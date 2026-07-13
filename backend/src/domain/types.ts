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
  episodeTitle?: string | null
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
  createIfMissing?: boolean
}

export interface SourceRefRetirement {
  source: string
  sourceId: string
}

export interface SourceFetchBatch {
  items: AdapterItem[]
  retiredSourceRefs?: SourceRefRetirement[]
  completeMediaSources?: string[]
  completePopularitySources?: string[]
  completeReleaseSources?: string[]
}

export type SourceFetchResult = AdapterItem[] | SourceFetchBatch

export interface SourceAdapter<Result extends SourceFetchResult = AdapterItem[]> {
  source: string
  scope?: string
  fetchItems(): Promise<Result>
}

export interface ExistingMediaCandidate {
  id: string
  mediaType: MediaType
  releaseForm: ReleaseForm
  sourceContentType?: string | null
  titleDisplay: string
  titleAliases: string[]
  overview: string | null
  posterUrl: string | null
  posterStatus?: string
  productionCountries: string
  genres: string
  firstReleaseDate: string | null
  originalLanguage: string | null
  status: string
  tmdbId: number | null
  tvmazeId: number | null
  imdbId: string | null
  traktId: number | null
  tvdbId: number | null
}
