import type { PrismaClient } from "@prisma/client"
import { MEDIA_TYPES, type MediaType } from "@whatsnew/shared/media"
import { parseJsonArray } from "../domain/normalizer.js"
import type { ExistingMediaCandidate } from "../domain/types.js"

export function mediaTypeFromStorageValue(value: string): MediaType {
  if (MEDIA_TYPES.includes(value as MediaType)) return value as MediaType

  return "series"
}

export async function loadExistingMediaCandidates(prisma: PrismaClient): Promise<ExistingMediaCandidate[]> {
  const rows = await prisma.mediaItem.findMany()

  return rows.map((row) => ({
    id: row.id,
    mediaType: mediaTypeFromStorageValue(row.mediaType),
    sourceContentType: row.sourceContentType,
    titleDisplay: row.titleDisplay,
    titleAliases: parseJsonArray(row.titleAliases),
    overview: row.overview,
    posterUrl: row.posterUrl,
    productionCountries: row.productionCountries,
    genres: row.genres,
    firstReleaseDate: row.firstReleaseDate,
    originalLanguage: row.originalLanguage,
    status: row.status,
    tmdbId: row.tmdbId,
    tvmazeId: row.tvmazeId,
    imdbId: row.imdbId,
    traktId: row.traktId,
    tvdbId: row.tvdbId
  }))
}
