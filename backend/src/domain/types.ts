import type { MediaStatus, MediaType, ReleaseForm } from "@whatsnew/shared/media"

export interface SourceClassificationInput {
  source: string
  sourceContentType: string | null
  genres: string[]
}

export interface NormalizedMediaInput {
  source: string
  sourceId: string
  mediaType: MediaType
  releaseForm: ReleaseForm
  sourceContentType: string | null
  titleDisplay: string
  titleOriginal: string | null
  titleAliases: string[]
  overview: string | null
  posterUrl: string | null
  productionCountries: string[]
  originalLanguage: string | null
  genres: string[]
  firstReleaseDate: string | null
  status?: MediaStatus
  tmdbId: number | null
  tvmazeId: number | null
  imdbId: string | null
  traktId: number | null
  tvdbId: number | null
}

export interface ReleaseInput {
  platform: string
  region: string
  releaseDate: string | null
  releaseTime: string | null
  releasePattern: string
  releaseStatus: string
  seasonNumber: number | null
  episodeNumber: number | null
  source: string
  sourceUrl: string | null
}

export interface PopularitySignalInput {
  source: string
  sourceCategory: string
  platform: string | null
  region: string | null
  window: string
  rank: number | null
  rankDelta: number | null
  value: number | null
  valueLabel: string | null
  sourceUrl: string | null
  capturedAt?: Date
}

export interface AdapterItem {
  media: NormalizedMediaInput
  releases: ReleaseInput[]
  popularitySignals: PopularitySignalInput[]
}

export interface SourceAdapter {
  source: string
  fetchItems(): Promise<AdapterItem[]>
}

export interface ExistingMediaCandidate {
  id: string
  mediaType: MediaType
  titleDisplay: string
  titleAliases: string[]
  firstReleaseDate: string | null
  originalLanguage: string | null
  tmdbId: number | null
  tvmazeId: number | null
  imdbId: string | null
  traktId: number | null
}
