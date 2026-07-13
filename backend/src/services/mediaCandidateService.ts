import type { PrismaClient } from "@prisma/client"
import {
  MEDIA_TYPES,
  RELEASE_FORMS,
  type MediaType,
  type ReleaseForm
} from "@whatsnew/shared/media"
import { parseJsonArray } from "../domain/normalizer.js"
import type { ExistingMediaCandidate } from "../domain/types.js"

export function mediaTypeFromStorageValue(value: string): MediaType {
  if (MEDIA_TYPES.includes(value as MediaType)) return value as MediaType

  return "series"
}

export function releaseFormFromStorageValue(value: string): ReleaseForm {
  if (RELEASE_FORMS.includes(value as ReleaseForm)) return value as ReleaseForm

  return "tv_series"
}

export async function loadExistingMediaCandidates(prisma: PrismaClient): Promise<ExistingMediaCandidate[]> {
  const rows = await prisma.mediaItem.findMany()

  return rows.map((row) => ({
    id: row.id,
    mediaType: mediaTypeFromStorageValue(row.mediaType),
    releaseForm: releaseFormFromStorageValue(row.releaseForm),
    sourceContentType: row.sourceContentType,
    titleDisplay: row.titleDisplay,
    titleAliases: parseJsonArray(row.titleAliases),
    overview: row.overview,
    posterUrl: row.posterUrl,
    posterStatus: row.posterStatus,
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
