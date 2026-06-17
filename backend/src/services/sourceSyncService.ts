import type { PrismaClient } from "@prisma/client"
import { findBestMatch } from "../domain/matcher.js"
import { parseJsonArray, toJsonArray } from "../domain/normalizer.js"
import type { AdapterItem, ExistingMediaCandidate, SourceAdapter } from "../domain/types.js"
import { createMediaDetectedEvent } from "./eventService.js"

function heatFromSignals(item: AdapterItem): number {
  const ranked = item.popularitySignals
    .map((signal) => signal.rank)
    .filter((rank): rank is number => typeof rank === "number" && rank > 0)

  if (ranked.length === 0) return 0

  return Math.max(0, 100 - Math.min(...ranked))
}

async function getCandidates(prisma: PrismaClient): Promise<ExistingMediaCandidate[]> {
  const rows = await prisma.mediaItem.findMany()

  return rows.map((row) => ({
    id: row.id,
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

async function upsertItem(prisma: PrismaClient, item: AdapterItem) {
  const candidates = await getCandidates(prisma)
  const match = findBestMatch(item.media, candidates)
  const heatScore = heatFromSignals(item)

  const mediaItem = match
    ? await prisma.mediaItem.update({
        where: { id: match.id },
        data: {
          titleAliases: toJsonArray([...match.titleAliases, ...item.media.titleAliases]),
          heatScore,
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
          titleAliases: toJsonArray(item.media.titleAliases),
          overview: item.media.overview,
          posterUrl: item.media.posterUrl,
          productionCountries: toJsonArray(item.media.productionCountries),
          originalLanguage: item.media.originalLanguage,
          genres: toJsonArray(item.media.genres),
          firstReleaseDate: item.media.firstReleaseDate,
          status: item.media.status ?? "unknown",
          heatScore,
          tmdbId: item.media.tmdbId,
          tvmazeId: item.media.tvmazeId,
          imdbId: item.media.imdbId,
          traktId: item.media.traktId,
          tvdbId: item.media.tvdbId
        }
      })

  await prisma.release.createMany({
    data: item.releases.map((release) => ({
      mediaItemId: mediaItem.id,
      ...release
    }))
  })

  await prisma.popularitySignal.createMany({
    data: item.popularitySignals.map((signal) => ({
      mediaItemId: mediaItem.id,
      ...signal
    }))
  })

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

    for (const item of items) {
      await upsertItem(prisma, item)
    }

    const finishedAt = new Date()
    return prisma.sourceSyncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        itemCount: items.length
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
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    })
  }
}
