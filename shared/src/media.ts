export const MEDIA_TYPES = ["movie", "series", "anime", "variety", "short_drama", "documentary"] as const
export type MediaType = (typeof MEDIA_TYPES)[number]

export const RELEASE_FORMS = [
  "theatrical_movie",
  "streaming_movie",
  "tv_series",
  "web_series",
  "animated_series",
  "anime_season",
  "variety_season",
  "micro_drama",
  "documentary_film",
  "documentary_series"
] as const
export type ReleaseForm = (typeof RELEASE_FORMS)[number]

export const RELEASE_STATUS = ["announced", "upcoming", "airing_today", "available", "delayed", "ended", "unknown"] as const
export type ReleaseStatus = (typeof RELEASE_STATUS)[number]

export const MEDIA_STATUS = ["upcoming", "released", "ongoing", "ended", "returning", "unknown"] as const
export type MediaStatus = (typeof MEDIA_STATUS)[number]

export interface MediaSummary {
  id: string
  mediaType: MediaType
  releaseForm: ReleaseForm
  titleDisplay: string
  titleOriginal: string | null
  posterUrl: string | null
  firstReleaseDate: string | null
  status: MediaStatus
  heatScore: number
}

export interface SourceStatus {
  source: string
  status: "running" | "success" | "warning" | "failed"
  startedAt: string
  finishedAt: string | null
  itemCount: number
  errorMessage: string | null
  nextRunAt: string | null
}
