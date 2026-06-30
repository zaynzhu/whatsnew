import type { PrismaClient } from "@prisma/client"
import { findBestMatch } from "../domain/matcher.js"
import { parseJsonArray, toJsonArray } from "../domain/normalizer.js"
import type {
  AdapterItem,
  ExistingMediaCandidate,
  SourceAdapter,
  SourceFetchBatch,
  SourceFetchResult
} from "../domain/types.js"
import { createMediaDetectedEvent } from "./eventService.js"
import { loadExistingMediaCandidates, mediaTypeFromStorageValue } from "./mediaCandidateService.js"
import { PopularitySnapshotService } from "./popularitySnapshotService.js"

const POPULARITY_HISTORY_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000
const TITLE_ALIASES_STORAGE_LIMIT = 191
const sourceSyncTails = new Map<string, Promise<void>>()

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

function normalizeFetchResult(result: SourceFetchResult): Required<SourceFetchBatch> {
  if (Array.isArray(result)) {
    return { items: result, retiredSourceRefs: [], completePopularitySources: [], completeReleaseSources: [] }
  }

  return {
    items: result.items,
    retiredSourceRefs: result.retiredSourceRefs ?? [],
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
  if (!match && item.createIfMissing === false) return null

  const titleAliases = match
    ? compactTitleAliases([...match.titleAliases, ...item.media.titleAliases])
    : compactTitleAliases(item.media.titleAliases)

  const mediaItem = match
    ? await prisma.mediaItem.update({
        where: { id: match.id },
        data: {
          titleAliases: toJsonArray(titleAliases),
          overview: match.overview ?? item.media.overview,
          posterUrl: match.posterUrl ?? item.media.posterUrl,
          productionCountries: toJsonArray(uniqueValues([
            ...parseJsonArray(match.productionCountries),
            ...item.media.productionCountries
          ])),
          genres: toJsonArray(uniqueValues([
            ...parseJsonArray(match.genres),
            ...item.media.genres
          ])),
          firstReleaseDate: match.firstReleaseDate ?? item.media.firstReleaseDate,
          originalLanguage: match.originalLanguage ?? item.media.originalLanguage,
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
          firstReleaseDate: item.media.firstReleaseDate,
          status: item.media.status ?? "unknown",
          heatScore: 0,
          tmdbId: item.media.tmdbId,
          tvmazeId: item.media.tvmazeId,
          imdbId: item.media.imdbId,
          traktId: item.media.traktId,
          tvdbId: item.media.tvdbId
        }
      })

  if (match) {
    match.titleAliases = titleAliases
    match.overview = mediaItem.overview
    match.posterUrl = mediaItem.posterUrl
    match.productionCountries = mediaItem.productionCountries
    match.genres = mediaItem.genres
    match.firstReleaseDate = mediaItem.firstReleaseDate
    match.originalLanguage = mediaItem.originalLanguage
    match.tmdbId = mediaItem.tmdbId
    match.tvmazeId = mediaItem.tvmazeId
    match.imdbId = mediaItem.imdbId
    match.traktId = mediaItem.traktId
    match.tvdbId = mediaItem.tvdbId
  } else {
    candidates.push({
      id: mediaItem.id,
      mediaType: mediaTypeFromStorageValue(mediaItem.mediaType),
      titleDisplay: mediaItem.titleDisplay,
      titleAliases,
      overview: mediaItem.overview,
      posterUrl: mediaItem.posterUrl,
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

  const releaseSources = uniqueValues(item.releases.map((release) => release.source))
  if (releaseSources.length > 0) {
    await prisma.release.deleteMany({
      where: {
        mediaItemId: mediaItem.id,
        source: { in: releaseSources }
      }
    })

    await prisma.release.createMany({
      data: item.releases.map((release) => ({
        mediaItemId: mediaItem.id,
        ...release,
        episodeTitle: release.episodeTitle ?? null
      }))
    })
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
    const { items, retiredSourceRefs, completePopularitySources, completeReleaseSources } = batch

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

    return prisma.sourceSyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorMessage: errorMessageFrom(error)
      }
    })
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
