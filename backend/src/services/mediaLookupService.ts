import type { MediaRating, PopularitySignal, Prisma, PrismaClient } from "@prisma/client"
import { MOVIE_RELEASE_FORMS } from "../domain/mediaWorkKind.js"

export const LOOKUP_CONTRACT_VERSION = 1
export const MAX_LOOKUP_BATCH_SIZE = 50

export type MediaLookupWorkKind = "movie" | "series"

export type MediaLookupRequest = {
  workKind: MediaLookupWorkKind
  doubanIds: number[]
  imdbIds: string[]
}

export type LookupQuery = { kind: "douban"; id: number } | { kind: "imdb"; id: string }

export type LookupDoubanRating = {
  value: number
  scale: number
  voteCount: number | null
  capturedAt: string
}

export type LookupMatchedItem = {
  query: LookupQuery
  status: "matched"
  mediaId: string
  matchBasis: "douban" | "imdb"
  matchLevel: "work"
  titleDisplay: string
  mediaType: string
  releaseForm: string
  firstReleaseDate: string | null
  workStatus: string
  heatScore: number
  signals: PopularitySignal[]
  lastSignalCapturedAt: string | null
  doubanRating: LookupDoubanRating | null
  imdbId: string | null
  tmdbId: number | null
  tvdbId: number | null
  traktId: number | null
}

export type LookupUnmatchedItem = {
  query: LookupQuery
  status: "unmatched"
  reason: "no_work_level_identity"
}

export type LookupAmbiguousItem = {
  query: LookupQuery
  status: "ambiguous"
  reason: "multiple_candidates"
  candidateMediaIds: string[]
}

export type LookupItem = LookupMatchedItem | LookupUnmatchedItem | LookupAmbiguousItem

export type MediaLookupResult = {
  contractVersion: number
  counts: { matched: number; unmatched: number; ambiguous: number }
  items: LookupItem[]
}

const MEDIA_FIELDS = {
  id: true,
  mediaType: true,
  releaseForm: true,
  titleDisplay: true,
  firstReleaseDate: true,
  status: true,
  heatScore: true,
  imdbId: true,
  tmdbId: true,
  tvdbId: true,
  traktId: true
} satisfies Prisma.MediaItemSelect

type LookupMedia = Prisma.MediaItemGetPayload<{ select: typeof MEDIA_FIELDS }>

// 大类查询约束与 mediaWorkKind 同源：电影按 releaseForm 或 mediaType 判定，剧集为其余
function workKindWhere(workKind: MediaLookupWorkKind): Prisma.MediaItemWhereInput {
  if (workKind === "movie") {
    return { OR: [{ releaseForm: { in: [...MOVIE_RELEASE_FORMS] } }, { mediaType: "movie" }] }
  }
  return {
    AND: [
      { releaseForm: { notIn: [...MOVIE_RELEASE_FORMS] } },
      { mediaType: { not: "movie" } }
    ]
  }
}

export function createMediaLookupService(database: PrismaClient) {
  async function lookup(request: MediaLookupRequest): Promise<MediaLookupResult> {
    const where = workKindWhere(request.workKind)

    const doubanRefs = request.doubanIds.length === 0 ? [] : await database.mediaSourceRef.findMany({
      where: {
        source: "douban",
        sourceId: { in: request.doubanIds.map((id) => `douban-${id}`) },
        mediaItem: where
      },
      include: { mediaItem: { select: MEDIA_FIELDS } }
    })
    const doubanRefById = new Map(doubanRefs.map((ref) => [ref.sourceId, ref]))

    const imdbDirectHits = request.imdbIds.length === 0 ? [] : await database.mediaItem.findMany({
      where: { imdbId: { in: request.imdbIds }, ...where },
      select: MEDIA_FIELDS
    })
    const imdbRefHits = request.imdbIds.length === 0 ? [] : await database.mediaSourceRef.findMany({
      where: {
        source: "imdb",
        sourceId: { in: request.imdbIds.map((id) => `imdb:${id}`) },
        mediaItem: where
      },
      include: { mediaItem: { select: MEDIA_FIELDS } }
    })
    // 每个 IMDb 输入的候选集合：直查命中 + 来源引用命中，按 mediaItemId 去重
    const imdbCandidates = new Map<string, Map<string, LookupMedia>>()
    const addCandidate = (ttId: string, media: LookupMedia) => {
      const bucket = imdbCandidates.get(ttId) ?? new Map<string, LookupMedia>()
      bucket.set(media.id, media)
      imdbCandidates.set(ttId, bucket)
    }
    for (const media of imdbDirectHits) {
      if (media.imdbId) addCandidate(media.imdbId, media)
    }
    for (const ref of imdbRefHits) {
      addCandidate(ref.sourceId.replace(/^imdb:/, ""), ref.mediaItem)
    }

    const matchedItems: Array<{ item: LookupMatchedItem; mediaId: string }> = []
    const items: LookupItem[] = []

    for (const id of request.doubanIds) {
      const query: LookupQuery = { kind: "douban", id }
      const ref = doubanRefById.get(`douban-${id}`)
      if (!ref) {
        items.push({ query, status: "unmatched", reason: "no_work_level_identity" })
        continue
      }
      const item = buildMatchedItem(query, "douban", ref.mediaItem)
      matchedItems.push({ item, mediaId: ref.mediaItem.id })
      items.push(item)
    }

    for (const id of request.imdbIds) {
      const query: LookupQuery = { kind: "imdb", id }
      const bucket = imdbCandidates.get(id)
      if (!bucket || bucket.size === 0) {
        items.push({ query, status: "unmatched", reason: "no_work_level_identity" })
        continue
      }
      if (bucket.size > 1) {
        items.push({
          query,
          status: "ambiguous",
          reason: "multiple_candidates",
          candidateMediaIds: [...bucket.keys()].sort()
        })
        continue
      }
      const media = [...bucket.values()][0]
      const item = buildMatchedItem(query, "imdb", media)
      matchedItems.push({ item, mediaId: media.id })
      items.push(item)
    }

    const matchedMediaIds = matchedItems.map(({ mediaId }) => mediaId)
    const currentSignals = matchedMediaIds.length === 0 ? [] : await database.popularitySignal.findMany({
      where: { mediaItemId: { in: matchedMediaIds }, isCurrent: true },
      orderBy: [{ capturedAt: "desc" }]
    })
    const signalHistory = matchedMediaIds.length === 0 ? [] : await database.popularitySignal.groupBy({
      by: ["mediaItemId"],
      where: { mediaItemId: { in: matchedMediaIds } },
      _max: { capturedAt: true }
    })
    const doubanRatings = matchedMediaIds.length === 0 ? [] : await database.mediaRating.findMany({
      where: { mediaItemId: { in: matchedMediaIds }, source: "douban" },
      orderBy: [{ capturedAt: "desc" }]
    })

    const signalsByMediaId = new Map<string, PopularitySignal[]>()
    for (const signal of currentSignals) {
      const bucket = signalsByMediaId.get(signal.mediaItemId) ?? []
      bucket.push(signal)
      signalsByMediaId.set(signal.mediaItemId, bucket)
    }
    const lastCapturedAtByMediaId = new Map<string, string>()
    for (const row of signalHistory) {
      const capturedAt = row._max.capturedAt?.toISOString()
      if (capturedAt) lastCapturedAtByMediaId.set(row.mediaItemId, capturedAt)
    }
    const ratingByMediaId = new Map<string, MediaRating>()
    for (const rating of doubanRatings) {
      if (!ratingByMediaId.has(rating.mediaItemId)) ratingByMediaId.set(rating.mediaItemId, rating)
    }

    for (const { item, mediaId } of matchedItems) {
      item.signals = signalsByMediaId.get(mediaId) ?? []
      item.lastSignalCapturedAt = lastCapturedAtByMediaId.get(mediaId) ?? null
      const rating = ratingByMediaId.get(mediaId)
      item.doubanRating = rating
        ? {
            value: rating.value,
            scale: rating.scale,
            voteCount: rating.voteCount,
            capturedAt: rating.capturedAt.toISOString()
          }
        : null
    }

    const counts = { matched: 0, unmatched: 0, ambiguous: 0 }
    for (const item of items) counts[item.status] += 1

    return { contractVersion: LOOKUP_CONTRACT_VERSION, counts, items }
  }

  return { lookup }
}

function buildMatchedItem(
  query: LookupQuery,
  matchBasis: "douban" | "imdb",
  media: LookupMedia
): LookupMatchedItem {
  return {
    query,
    status: "matched",
    mediaId: media.id,
    matchBasis,
    matchLevel: "work",
    titleDisplay: media.titleDisplay,
    mediaType: media.mediaType,
    releaseForm: media.releaseForm,
    firstReleaseDate: media.firstReleaseDate,
    workStatus: media.status,
    heatScore: media.heatScore,
    signals: [],
    lastSignalCapturedAt: null,
    doubanRating: null,
    imdbId: media.imdbId,
    tmdbId: media.tmdbId,
    tvdbId: media.tvdbId,
    traktId: media.traktId
  }
}