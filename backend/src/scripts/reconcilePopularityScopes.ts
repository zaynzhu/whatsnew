import { db } from "../config/db.js"
import { mediaWorkKind } from "../domain/mediaWorkKind.js"

const NETFLIX_SCOPES: Record<string, string> = {
  "Films (English)": "films_english",
  "Films (Non-English)": "films_non_english",
  "TV (English)": "tv_english",
  "TV (Non-English)": "tv_non_english"
}

const apply = process.argv.includes("--apply")

function netflixScopes(sourceIds: string[]): string[] {
  return [...new Set(sourceIds.flatMap((sourceId) => {
    const category = sourceId.match(/^netflix:([^:]+):/)?.[1]
    return category && NETFLIX_SCOPES[category] ? [NETFLIX_SCOPES[category]] : []
  }))]
}

async function reconcileGroup(source: string | string[], rankingScope: string, mediaItemIds: string[]) {
  if (mediaItemIds.length === 0) return 0

  const where = {
    source: Array.isArray(source) ? { in: source } : source,
    mediaItemId: { in: mediaItemIds },
    rankingScope: { not: rankingScope }
  }
  if (!apply) return db.popularitySignal.count({ where })

  return (await db.popularitySignal.updateMany({
    where,
    data: { rankingScope }
  })).count
}

try {
  const traktMedia = await db.mediaItem.findMany({
    where: {
      popularitySignals: {
        some: { source: { in: ["trakt_trending", "trakt_anticipated"] } }
      }
    },
    select: { id: true, mediaType: true, releaseForm: true }
  })
  const traktMovieIds = traktMedia
    .filter((media) => mediaWorkKind(media) === "movie")
    .map((media) => media.id)
  const traktSeriesIds = traktMedia
    .filter((media) => mediaWorkKind(media) === "series")
    .map((media) => media.id)

  const netflixMedia = await db.mediaItem.findMany({
    where: { popularitySignals: { some: { source: "netflix_top10" } } },
    select: {
      id: true,
      sourceRefs: {
        where: { source: "netflix" },
        select: { sourceId: true }
      }
    }
  })
  const netflixGroups = new Map<string, string[]>()
  let ambiguousNetflixMedia = 0
  for (const media of netflixMedia) {
    const scopes = netflixScopes(media.sourceRefs.map((ref) => ref.sourceId))
    if (scopes.length !== 1) {
      ambiguousNetflixMedia += 1
      continue
    }
    const ids = netflixGroups.get(scopes[0]) ?? []
    ids.push(media.id)
    netflixGroups.set(scopes[0], ids)
  }

  const traktMovies = await reconcileGroup(
    ["trakt_trending", "trakt_anticipated"],
    "movie",
    traktMovieIds
  )
  const traktSeries = await reconcileGroup(
    ["trakt_trending", "trakt_anticipated"],
    "series",
    traktSeriesIds
  )
  const netflix: Record<string, number> = {}
  for (const [rankingScope, mediaItemIds] of netflixGroups) {
    netflix[rankingScope] = await reconcileGroup("netflix_top10", rankingScope, mediaItemIds)
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    updatedSignals: {
      traktMovies,
      traktSeries,
      netflix
    },
    ambiguousNetflixMedia
  }, null, 2))
} finally {
  await db.$disconnect()
}
