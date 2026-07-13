import type { PrismaClient } from "@prisma/client"
import { findBestMatch } from "../domain/matcher.js"
import { normalizeMediaStatusForDate } from "../domain/mediaStatus.js"
import { parseJsonArray, toJsonArray } from "../domain/normalizer.js"
import { normalizeReleaseStatusForDate } from "../domain/releaseStatus.js"
import type {
  AdapterItem,
  ExistingMediaCandidate,
  SourceAdapter,
  SourceFetchBatch,
  SourceFetchResult
} from "../domain/types.js"
import {
  isDoubanPlaceholderPosterUrl,
  isDoubanPosterUpgrade
} from "../utils/doubanPosterUrl.js"
import { formatLocalDate } from "../utils/date.js"
import { isIqiyiPosterUpgrade } from "../utils/iqiyiPosterUrl.js"
import { createMediaDetectedEvent, createSourceFailedEvent, generateReleaseEvents } from "./eventService.js"
import {
  loadExistingMediaCandidates,
  mediaTypeFromStorageValue,
  releaseFormFromStorageValue
} from "./mediaCandidateService.js"
import { PopularitySnapshotService } from "./popularitySnapshotService.js"

const POPULARITY_HISTORY_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000
const TITLE_ALIASES_STORAGE_LIMIT = 191
const INTERRUPTED_SYNC_ERROR = "同步进程中断，已自动收尾；请重新触发同步"
const sourceSyncTails = new Map<string, Promise<void>>()

export function isSourceSyncInFlight(source: string): boolean {
  return sourceSyncTails.has(source)
}
const PLATFORM_SNAPSHOT_SOURCES = new Set(["disney_plus", "hulu", "max", "prime_video"])
const SOURCE_OWNED_SCHEDULE_SOURCES = new Set(["douban", "iqiyi", "youku", "tencent"])
const UNKNOWN_LANGUAGE_SOURCES = new Set([...PLATFORM_SNAPSHOT_SOURCES, "apple_tv_plus", "iqiyi", "youku"])
const UNKNOWN_PRODUCTION_COUNTRY_SOURCES = new Set(["iqiyi", "youku"])

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function compactTitleAliases(values: string[]): string[] {
  const aliases: string[] = []

  for (const value of uniqueValues(values)) {
    const nextAliases = [...aliases, value]
    if (toJsonArray(nextAliases).length <= TITLE_ALIASES_STORAGE_LIMIT) {
      aliases.push(value)
    }
  }

  return aliases
}

function hasExternalIdentity(candidate: ExistingMediaCandidate): boolean {
  return candidate.tmdbId != null
    || candidate.tvmazeId != null
    || candidate.imdbId != null
    || candidate.traktId != null
    || candidate.tvdbId != null
}

function shouldAdoptCleanPlatformTitle(item: AdapterItem, match: ExistingMediaCandidate): boolean {
  return PLATFORM_SNAPSHOT_SOURCES.has(item.media.source)
    && !hasExternalIdentity(match)
    && item.media.titleDisplay !== match.titleDisplay
    && item.media.titleAliases.includes(match.titleDisplay)
}

function shouldReplaceSourceOwnedFirstReleaseDate(
  item: AdapterItem,
  match: ExistingMediaCandidate,
  hasStableSourceIdentity: boolean
): boolean {
  if (SOURCE_OWNED_SCHEDULE_SOURCES.has(item.media.source)) {
    return hasStableSourceIdentity
      && !hasExternalIdentity(match)
      && item.media.firstReleaseDate != null
  }
  if (!PLATFORM_SNAPSHOT_SOURCES.has(item.media.source) || hasExternalIdentity(match)) return false
  if (!item.releases.some((release) => release.releasePattern === "catalog_addition")) return false

  const platformDates = new Set(item.releases.map((release) => release.releaseDate).filter(Boolean))
  return item.media.firstReleaseDate != null || (match.firstReleaseDate != null && platformDates.has(match.firstReleaseDate))
}

function normalizeFetchResult(result: SourceFetchResult): Required<SourceFetchBatch> {
  if (Array.isArray(result)) {
    return {
      items: result,
      retiredSourceRefs: [],
      completeMediaSources: [],
      completePopularitySources: [],
      completeReleaseSources: []
    }
  }

  return {
    items: result.items,
    retiredSourceRefs: result.retiredSourceRefs ?? [],
    completeMediaSources: result.completeMediaSources ?? [],
    completePopularitySources: result.completePopularitySources ?? [],
    completeReleaseSources: result.completeReleaseSources ?? []
  }
}

function errorMessageFrom(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  return message
    .replace(/([?&]api_key=)[^&\s)]+/g, "$1[REDACTED]")
    .replace(/(Authorization:\s*Bearer\s+)[^\s)]+/gi, "$1[REDACTED]")
    .slice(0, 5000)
}

async function upsertItem(
  prisma: PrismaClient,
  item: AdapterItem,
  candidates: ExistingMediaCandidate[],
  snapshotService: PopularitySnapshotService,
  sourceSyncRunId: string,
  startedAt: Date
) {
  const sourceRef = await prisma.mediaSourceRef.findUnique({
    where: {
      source_sourceId: {
        source: item.media.source,
        sourceId: item.media.sourceId
      }
    },
    select: { mediaItemId: true }
  })
  const match = sourceRef
    ? candidates.find((candidate) => candidate.id === sourceRef.mediaItemId) ?? null
    : findBestMatch(item.media, candidates)
  const hasStableSourceIdentity = sourceRef != null
  if (!match && item.createIfMissing === false) return null

  const titleAliases = match
    ? compactTitleAliases([...match.titleAliases, ...item.media.titleAliases])
    : compactTitleAliases(item.media.titleAliases)
  const adoptCleanPlatformTitle = match ? shouldAdoptCleanPlatformTitle(item, match) : false
  const replaceSourceOwnedFirstReleaseDate = match
    ? shouldReplaceSourceOwnedFirstReleaseDate(item, match, hasStableSourceIdentity)
    : false
  const clearInferredSourceLanguage = match
    ? hasStableSourceIdentity
      && UNKNOWN_LANGUAGE_SOURCES.has(item.media.source)
      && !hasExternalIdentity(match)
      && item.media.originalLanguage == null
    : false
  const clearInferredProductionCountries = match
    ? hasStableSourceIdentity
      && UNKNOWN_PRODUCTION_COUNTRY_SOURCES.has(item.media.source)
      && !hasExternalIdentity(match)
      && item.media.productionCountries.length === 0
    : false
  const acceptIqiyiPosterUpgrade = match
    ? hasStableSourceIdentity
      && item.media.source === "iqiyi"
      && isIqiyiPosterUpgrade(match.posterUrl, item.media.posterUrl)
    : false
  const acceptDoubanPosterUpgrade = match
    ? hasStableSourceIdentity
      && item.media.source === "douban"
      && isDoubanPosterUpgrade(match.posterUrl, item.media.posterUrl)
    : false
  const clearDoubanPlaceholder = match
    ? hasStableSourceIdentity
      && item.media.source === "douban"
      && isDoubanPlaceholderPosterUrl(match.posterUrl)
      && item.media.posterUrl == null
    : false
  let nextPosterUrl = match?.posterUrl ?? item.media.posterUrl
  const acceptTvmazePoster = match
    && item.media.source === "tvmaze"
    && item.media.posterUrl
    && (!match.posterUrl || match.posterUrl.includes("static.tvmaze.com/"))
  if (match && item.media.posterUrl && (
    match.posterStatus === "broken"
    || acceptDoubanPosterUpgrade
    || acceptIqiyiPosterUpgrade
    || acceptTvmazePoster
  )) {
    nextPosterUrl = item.media.posterUrl
  }
  if (clearDoubanPlaceholder) nextPosterUrl = null
  const posterChanged = match?.posterUrl !== nextPosterUrl
  const nextFirstReleaseDate = match
    ? replaceSourceOwnedFirstReleaseDate
      ? item.media.firstReleaseDate
      : match.firstReleaseDate ?? item.media.firstReleaseDate
    : item.media.firstReleaseDate
  const proposedStatus = match
    ? item.media.status && item.media.status !== "unknown"
      && (hasStableSourceIdentity || match.status === "unknown")
      ? item.media.status
      : match.status
    : item.media.status ?? "unknown"
  const nextStatus = normalizeMediaStatusForDate(
    proposedStatus,
    nextFirstReleaseDate,
    formatLocalDate(startedAt)
  )

  const mediaItem = match
    ? await prisma.mediaItem.update({
        where: { id: match.id },
        data: {
          titleDisplay: adoptCleanPlatformTitle ? item.media.titleDisplay : match.titleDisplay,
          sourceContentType: item.media.source === "tvmaze" || !match.sourceContentType
            ? item.media.sourceContentType
            : match.sourceContentType,
          titleAliases: toJsonArray(titleAliases),
          overview: match.overview ?? item.media.overview,
          posterUrl: nextPosterUrl,
          ...(posterChanged ? {
            ...(clearDoubanPlaceholder ? { posterLookupAttemptedAt: null } : {}),
            posterStatus: "unverified",
            posterCheckedAt: null,
            posterFailureCount: 0,
            posterFailureReason: null,
            posterWidth: null,
            posterHeight: null,
            posterQuality: "unknown"
          } : {}),
          productionCountries: clearInferredProductionCountries
            ? toJsonArray([])
            : toJsonArray(uniqueValues([
                ...parseJsonArray(match.productionCountries),
                ...item.media.productionCountries
              ])),
          genres: toJsonArray(uniqueValues([
            ...parseJsonArray(match.genres),
            ...item.media.genres
          ])),
          firstReleaseDate: nextFirstReleaseDate,
          originalLanguage: clearInferredSourceLanguage
            ? null
            : match.originalLanguage ?? item.media.originalLanguage,
          status: nextStatus,
          tmdbId: match.tmdbId ?? item.media.tmdbId,
          tvmazeId: match.tvmazeId ?? item.media.tvmazeId,
          imdbId: match.imdbId ?? item.media.imdbId,
          traktId: match.traktId ?? item.media.traktId,
          tvdbId: match.tvdbId ?? item.media.tvdbId
        }
      })
    : await prisma.mediaItem.create({
        data: {
          mediaType: item.media.mediaType,
          releaseForm: item.media.releaseForm,
          sourceContentType: item.media.sourceContentType,
          titleDisplay: item.media.titleDisplay,
          titleOriginal: item.media.titleOriginal,
          titleAliases: toJsonArray(titleAliases),
          overview: item.media.overview,
          posterUrl: item.media.posterUrl,
          productionCountries: toJsonArray(item.media.productionCountries),
          originalLanguage: item.media.originalLanguage,
          genres: toJsonArray(item.media.genres),
          firstReleaseDate: nextFirstReleaseDate,
          status: nextStatus,
          heatScore: 0,
          tmdbId: item.media.tmdbId,
          tvmazeId: item.media.tvmazeId,
          imdbId: item.media.imdbId,
          traktId: item.media.traktId,
          tvdbId: item.media.tvdbId
        }
      })

  if (match) {
    match.titleDisplay = mediaItem.titleDisplay
    match.titleAliases = titleAliases
    match.sourceContentType = mediaItem.sourceContentType
    match.overview = mediaItem.overview
    match.posterUrl = mediaItem.posterUrl
    match.posterStatus = mediaItem.posterStatus
    match.productionCountries = mediaItem.productionCountries
    match.genres = mediaItem.genres
    match.firstReleaseDate = mediaItem.firstReleaseDate
    match.originalLanguage = mediaItem.originalLanguage
    match.status = mediaItem.status
    match.tmdbId = mediaItem.tmdbId
    match.tvmazeId = mediaItem.tvmazeId
    match.imdbId = mediaItem.imdbId
    match.traktId = mediaItem.traktId
    match.tvdbId = mediaItem.tvdbId
  } else {
    candidates.push({
      id: mediaItem.id,
      mediaType: mediaTypeFromStorageValue(mediaItem.mediaType),
      releaseForm: releaseFormFromStorageValue(mediaItem.releaseForm),
      sourceContentType: mediaItem.sourceContentType,
      titleDisplay: mediaItem.titleDisplay,
      titleAliases,
      overview: mediaItem.overview,
      posterUrl: mediaItem.posterUrl,
      posterStatus: mediaItem.posterStatus,
      productionCountries: mediaItem.productionCountries,
      genres: mediaItem.genres,
      firstReleaseDate: mediaItem.firstReleaseDate,
      originalLanguage: mediaItem.originalLanguage,
      status: mediaItem.status,
      tmdbId: mediaItem.tmdbId,
      tvmazeId: mediaItem.tvmazeId,
      imdbId: mediaItem.imdbId,
      traktId: mediaItem.traktId,
      tvdbId: mediaItem.tvdbId
    })
  }

  await prisma.mediaSourceRef.upsert({
    where: {
      source_sourceId: {
        source: item.media.source,
        sourceId: item.media.sourceId
      }
    },
    update: { mediaItemId: mediaItem.id, isActive: true },
    create: {
      mediaItemId: mediaItem.id,
      source: item.media.source,
      sourceId: item.media.sourceId,
      isActive: true
    }
  })

  const normalizedReleases = item.releases.map((release) => ({
    ...release,
    releaseStatus: normalizeReleaseStatusForDate(
      release.releaseStatus,
      release.releaseDate,
      formatLocalDate(startedAt)
    )
  }))
  const releaseSources = uniqueValues(normalizedReleases.map((release) => release.source))
  if (releaseSources.length > 0) {
    // 在全量替换前读出旧 release 作为对比基线，用于生成定档 / 改档事件
    const previousReleases = await prisma.release.findMany({
      where: {
        mediaItemId: mediaItem.id,
        source: { in: releaseSources }
      },
      select: {
        source: true,
        platform: true,
        region: true,
        releaseDate: true,
        seasonNumber: true,
        episodeNumber: true
      }
    })

    await prisma.release.deleteMany({
      where: {
        mediaItemId: mediaItem.id,
        source: { in: releaseSources }
      }
    })

    await prisma.release.createMany({
      data: normalizedReleases.map((release) => ({
        mediaItemId: mediaItem.id,
        ...release,
        episodeTitle: release.episodeTitle ?? null
      }))
    })

    await generateReleaseEvents(
      prisma,
      mediaItem.id,
      mediaItem.titleDisplay,
      normalizedReleases,
      previousReleases,
      startedAt
    )
  }

  const persistedSignals = await snapshotService.persistSignals(item.popularitySignals.map((signal) => ({
    mediaItemId: mediaItem.id,
    mediaTitle: mediaItem.titleDisplay,
    signal,
    sourceSyncRunId,
    capturedAt: signal.capturedAt ?? startedAt
  })))

  if (!match) {
    await createMediaDetectedEvent(prisma, mediaItem.id, mediaItem.titleDisplay, item.media.source, item.releases[0]?.sourceUrl ?? null)
  }

  return { mediaItem, persistedSignals }
}

async function runSourceSyncUnlocked(prisma: PrismaClient, adapter: SourceAdapter<SourceFetchResult>) {
  const startedAt = new Date()
  const run = await prisma.sourceSyncRun.create({
    data: { source: adapter.source, scope: adapter.scope ?? "all", status: "running", startedAt }
  })

  try {
    const batch = normalizeFetchResult(await adapter.fetchItems())
    const {
      items,
      retiredSourceRefs,
      completeMediaSources,
      completePopularitySources,
      completeReleaseSources
    } = batch

    if (retiredSourceRefs.length > 0) {
      await prisma.mediaSourceRef.updateMany({
        where: {
          OR: retiredSourceRefs.map(({ source, sourceId }) => ({ source, sourceId }))
        },
        data: { isActive: false }
      })
    }

    const candidates = await loadExistingMediaCandidates(prisma)
    const snapshotService = new PopularitySnapshotService(prisma)
    const currentSignalIds: string[] = []
    const releaseMediaIds = new Map(completeReleaseSources.map((source) => [source, new Set<string>()]))
    const signalSources = uniqueValues([
      ...completePopularitySources,
      ...items.flatMap((item) => item.popularitySignals.map((signal) => signal.source))
    ])

    for (const item of items) {
      const result = await upsertItem(
        prisma,
        item,
        candidates,
        snapshotService,
        run.id,
        startedAt
      )
      if (!result) continue
      currentSignalIds.push(...result.persistedSignals.map((signal) => signal.id))
      for (const source of completeReleaseSources) {
        if (item.releases.some((release) => release.source === source)) {
          releaseMediaIds.get(source)?.add(result.mediaItem.id)
        }
      }
    }

    for (const source of completeMediaSources) {
      const currentSourceIds = uniqueValues(
        items
          .filter((item) => item.media.source === source)
          .map((item) => item.media.sourceId)
      )
      await prisma.mediaSourceRef.updateMany({
        where: {
          source,
          ...(currentSourceIds.length > 0 ? { sourceId: { notIn: currentSourceIds } } : {})
        },
        data: { isActive: false }
      })
    }

    for (const source of completeReleaseSources) {
      const mediaItemIds = [...(releaseMediaIds.get(source) ?? [])]
      await prisma.release.deleteMany({
        where: {
          source,
          ...(mediaItemIds.length > 0 ? { mediaItemId: { notIn: mediaItemIds } } : {})
        }
      })
    }

    const finishedAt = new Date()
    await snapshotService.deactivateMissingCurrentSignals(signalSources, currentSignalIds)
    const cutoff = new Date(finishedAt.getTime() - POPULARITY_HISTORY_DAYS * DAY_MS)
    let status = "success"
    let errorMessage: string | null = null

    try {
      await snapshotService.pruneHistory(signalSources, cutoff)
    } catch (error) {
      status = "warning"
      errorMessage = errorMessageFrom(error)
    }

    return prisma.sourceSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        itemCount: items.length,
        errorMessage
      }
    })
  } catch (error) {
    const finishedAt = new Date()
    const errorMessage = errorMessageFrom(error)

    const updated = await prisma.sourceSyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorMessage
      }
    })

    // 同步失败单独记录一条 source_failed 事件，便于首页"最新变化"展示
    // 事件写入失败不应影响已记录的同步失败状态
    try {
      await createSourceFailedEvent(prisma, adapter.source, errorMessage, run.id, finishedAt)
    } catch {
      // 忽略事件写入失败，避免掩盖原始同步失败状态
    }

    return updated
  }
}

export async function runSourceSync(prisma: PrismaClient, adapter: SourceAdapter<SourceFetchResult>) {
  const previous = sourceSyncTails.get(adapter.source) ?? Promise.resolve()
  let releaseLock: () => void = () => undefined
  const current = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  const tail = previous.catch(() => undefined).then(() => current)
  sourceSyncTails.set(adapter.source, tail)

  await previous.catch(() => undefined)
  try {
    return await runSourceSyncUnlocked(prisma, adapter)
  } finally {
    releaseLock()
    if (sourceSyncTails.get(adapter.source) === tail) sourceSyncTails.delete(adapter.source)
  }
}

export async function recoverInterruptedSourceRuns(prisma: PrismaClient, now = new Date()) {
  const interruptedRuns = await prisma.sourceSyncRun.findMany({
    where: {
      status: "running",
      finishedAt: null
    },
    select: {
      id: true,
      startedAt: true
    }
  })

  await prisma.$transaction(interruptedRuns.map((run) => (
    prisma.sourceSyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: now,
        durationMs: now.getTime() - run.startedAt.getTime(),
        errorMessage: INTERRUPTED_SYNC_ERROR
      }
    })
  )))

  return interruptedRuns.length
}
