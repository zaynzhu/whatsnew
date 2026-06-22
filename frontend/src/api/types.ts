import type { MediaSummary } from "@whatsnew/shared/media"

export type {
  ConnectionTestResult,
  ProxyMode,
  SettingsFieldView,
  SettingsResponse,
  SettingsUpdateRequest,
  SettingsUpdateResponse,
  SourceSettingsView
} from "@whatsnew/shared/settings"

import type { ConnectionTestResult } from "@whatsnew/shared/settings"

export type ApiMediaItem = MediaSummary & {
  dataSources?: string[]
  overview?: string | null
  productionCountries?: string
  originalLanguage?: string | null
  genres?: string
  createdAt?: string
  updatedAt?: string
}

export type ReleaseRow = {
  id: string
  mediaItemId: string
  platform: string
  region: string
  releaseDate: string | null
  releaseTime: string | null
  releasePattern: string
  releaseStatus: string
  seasonNumber: number | null
  episodeNumber: number | null
  episodeTitle: string | null
  source: string
  sourceUrl: string | null
  fetchedAt: string
  mediaItem: ApiMediaItem
}

export type PopularitySignal = {
  id: string
  mediaItemId: string
  source: string
  sourceCategory: string
  platform: string | null
  region: string | null
  window: string
  rank: number | null
  previousRank: number | null
  rankDelta: number | null
  value: number | null
  valueLabel: string | null
  capturedAt: string
  isCurrent: boolean
  sourceUrl: string | null
  mediaItem: ApiMediaItem
}

export type PopularityMovement = "new" | "rising" | "falling" | "stable"

export type PopularityHistoryResponse = {
  items: Omit<PopularitySignal, "mediaItem">[]
}

export type SourceSyncRun = {
  id: string
  source: string
  scope: string
  status: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  itemCount: number
  errorMessage: string | null
  nextRunAt: string | null
}

export type ChangeEvent = {
  id: string
  mediaItemId: string | null
  eventType: string
  title: string
  description: string
  source: string
  sourceUrl: string | null
  eventAt: string
  payload: string
}

export type DashboardResponse = {
  today: ReleaseRow[]
  week: ReleaseRow[]
  trending: ApiMediaItem[]
  events: ChangeEvent[]
  sources: SourceSyncRun[]
}

export type MediaListResponse = {
  items: ApiMediaItem[]
  nextCursor: string | null
}

export type TrendingResponse = {
  items: PopularitySignal[]
}

export type CalendarResponse = {
  items: ReleaseRow[]
}

export type SourcesResponse = {
  items: SourceSyncRun[]
}

export type ProxyTestResponse = {
  items: ConnectionTestResult[]
}

export type MediaDetailResponse = ApiMediaItem & {
  releases: Omit<ReleaseRow, "mediaItem">[]
  popularitySignals: Omit<PopularitySignal, "mediaItem">[]
  changeEvents: ChangeEvent[]
}
