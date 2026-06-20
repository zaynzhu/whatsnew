import type { PrismaClient } from "@prisma/client"
import { MEDIA_TYPES, type MediaType } from "@whatsnew/shared/media"
import { findBestMatch } from "../domain/matcher.js"
import { parseJsonArray, toJsonArray } from "../domain/normalizer.js"
import type { AdapterItem, ExistingMediaCandidate, SourceAdapter } from "../domain/types.js"
import { createMediaDetectedEvent } from "./eventService.js"
import { PopularitySnapshotService } from "./popularitySnapshotService.js"

const POPULARITY_HISTORY_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function mediaTypeFromRow(value: string): MediaType {
  if (MEDIA_TYPES.includes(value as MediaType)) return value as MediaType

  return "series"
}

async function getCandidates(prisma: PrismaClient): Promise<ExistingMediaCandidate[]> {
  const rows = await prisma.mediaItem.findMany()

  return rows.map((row) => ({
    id: row.id,
    mediaType: mediaTypeFromRow(row.mediaType),
    titleDisplay: row.titleDisplay,
    titleAliases: parseJsonArray(row.titleAliases),
    firstReleaseDate: row.firstReleaseDate,
    originalLanguage: row.originalLanguage,
    tmdbId: row.tmdbId,
    tvmazeId: row.tvmazeId,
    imdbId: row.imdbId,
    traktId: row.traktId
  }))
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
  const match = findBestMatch(item.media, candidates)
  const titleAliases = match
    ? uniqueValues([...match.titleAliases, ...item.media.titleAliases])
    : uniqueValues(item.media.titleAliases)

  const mediaItem = match
    ? await prisma.mediaItem.update({
        where: { id: match.id },
        data: {
          titleAliases: toJsonArray(titleAliases),
          updatedAt: new Date()
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
  } else {
    candidates.push({
      id: mediaItem.id,
      mediaType: mediaTypeFromRow(mediaItem.mediaType),
      titleDisplay: mediaItem.titleDisplay,
      titleAliases,
      firstReleaseDate: mediaItem.firstReleaseDate,
      originalLanguage: mediaItem.originalLanguage,
      tmdbId: mediaItem.tmdbId,
      tvmazeId: mediaItem.tvmazeId,
      imdbId: mediaItem.imdbId,
      traktId: mediaItem.traktId
    })
  }

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
        ...release
      }))
    })
  }

  await snapshotService.persistSignals(item.popularitySignals.map((signal) => ({
    mediaItemId: mediaItem.id,
    mediaTitle: mediaItem.titleDisplay,
    signal,
    sourceSyncRunId,
    capturedAt: signal.capturedAt ?? startedAt
  })))

  if (!match) {
    await createMediaDetectedEvent(prisma, mediaItem.id, mediaItem.titleDisplay, item.media.source, item.releases[0]?.sourceUrl ?? null)
  }

  return mediaItem
}

export async function runSourceSync(prisma: PrismaClient, adapter: SourceAdapter) {
  const startedAt = new Date()
  const run = await prisma.sourceSyncRun.create({
    data: { source: adapter.source, status: "running", startedAt }
  })

  try {
    const items = await adapter.fetchItems()
    const candidates = await getCandidates(prisma)
    const snapshotService = new PopularitySnapshotService(prisma)

    for (const item of items) {
      await upsertItem(
        prisma,
        item,
        candidates,
        snapshotService,
        run.id,
        startedAt
      )
    }

    const finishedAt = new Date()
    const signalSources = uniqueValues(items.flatMap((item) => {
      return item.popularitySignals.map((signal) => signal.source)
    }))
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
