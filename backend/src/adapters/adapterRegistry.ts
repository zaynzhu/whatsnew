import type {
  SourceHealthScheduleGroup,
  SourceSignalKind
} from "@whatsnew/shared/settings"
import type { SourceAdapter, SourceFetchResult } from "../domain/types.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import type { ScheduleGroup } from "../settings/sourceCatalog.js"
import { appleTvPlusAdapter } from "./appleTvPlusAdapter.js"
import { bilibiliAdapter } from "./bilibiliAdapter.js"
import { disneyPlusAdapter } from "./disneyPlusAdapter.js"
import { doubanAdapter } from "./doubanAdapter.js"
import { huluAdapter } from "./huluAdapter.js"
import { iqiyiAdapter } from "./iqiyiAdapter.js"
import { mgtvAdapter } from "./mgtvAdapter.js"
import { maxAdapter } from "./maxAdapter.js"
import { netflixTop10Adapter } from "./netflixTop10Adapter.js"
import { theTvdbAdapter } from "./theTvdbAdapter.js"
import { tmdbAdapter } from "./tmdbAdapter.js"
import { traktCalendarAdapter, traktPopularityAdapter } from "./traktAdapter.js"
import { tvmazeAdapter } from "./tvmazeAdapter.js"
import { youkuAdapter } from "./youkuAdapter.js"

export type RegisteredAdapter = {
  sourceId: string
  scheduleGroup: ScheduleGroup
  adapter: SourceAdapter<SourceFetchResult>
  healthPolicy: SourceHealthPolicy
}

export type SourceHealthSampleStrategy = "release" | "popularity" | "local_state" | "coverage_only"

export type SourceHealthPolicy = {
  expectedSignalKinds: SourceSignalKind[]
  staleAfterHours: number | null
  emptyOk: boolean
  sampleStrategy: SourceHealthSampleStrategy
}

export type RegisteredHealthScope = {
  sourceId: string
  scope: string
  scheduleGroup: SourceHealthScheduleGroup
  adapter?: SourceAdapter<SourceFetchResult>
  healthPolicy: SourceHealthPolicy
}

const HOURLY_STALE_HOURS = 6
const DAILY_STALE_HOURS = 36

function healthPolicy(
  expectedSignalKinds: SourceSignalKind[],
  scheduleGroup: ScheduleGroup | "manual",
  sampleStrategy: SourceHealthSampleStrategy,
  emptyOk = false
): SourceHealthPolicy {
  return {
    expectedSignalKinds,
    staleAfterHours: scheduleGroup === "manual"
      ? null
      : scheduleGroup === "hourly"
        ? HOURLY_STALE_HOURS
        : DAILY_STALE_HOURS,
    emptyOk,
    sampleStrategy
  }
}

export const registeredAdapters: RegisteredAdapter[] = [
  { sourceId: "tvmaze", scheduleGroup: "hourly", adapter: tvmazeAdapter, healthPolicy: healthPolicy(["release_calendar", "metadata"], "hourly", "release") },
  { sourceId: "tmdb", scheduleGroup: "hourly", adapter: tmdbAdapter, healthPolicy: healthPolicy(["metadata", "community_trend", "release_calendar"], "hourly", "popularity") },
  { sourceId: "trakt", scheduleGroup: "hourly", adapter: traktPopularityAdapter, healthPolicy: healthPolicy(["community_trend"], "hourly", "popularity") },
  { sourceId: "trakt", scheduleGroup: "daily", adapter: traktCalendarAdapter, healthPolicy: healthPolicy(["release_calendar"], "daily", "release") },
  { sourceId: "thetvdb", scheduleGroup: "daily", adapter: theTvdbAdapter, healthPolicy: healthPolicy(["metadata", "release_calendar"], "daily", "release") },
  { sourceId: "netflix", scheduleGroup: "daily", adapter: netflixTop10Adapter, healthPolicy: healthPolicy(["platform_rank"], "daily", "popularity") },
  { sourceId: "hulu", scheduleGroup: "daily", adapter: huluAdapter, healthPolicy: healthPolicy(["platform_catalog", "release_calendar"], "daily", "release") },
  { sourceId: "disney_plus", scheduleGroup: "daily", adapter: disneyPlusAdapter, healthPolicy: healthPolicy(["platform_catalog", "release_calendar"], "daily", "release") },
  { sourceId: "max", scheduleGroup: "daily", adapter: maxAdapter, healthPolicy: healthPolicy(["platform_catalog", "release_calendar"], "daily", "release") },
  { sourceId: "apple_tv_plus", scheduleGroup: "daily", adapter: appleTvPlusAdapter, healthPolicy: healthPolicy(["news_signal"], "daily", "popularity") },
  { sourceId: "youku", scheduleGroup: "hourly", adapter: youkuAdapter, healthPolicy: healthPolicy(["platform_catalog", "platform_rank"], "hourly", "popularity") },
  { sourceId: "iqiyi", scheduleGroup: "hourly", adapter: iqiyiAdapter, healthPolicy: healthPolicy(["platform_catalog", "platform_rank"], "hourly", "release") },
  { sourceId: "mango_tv", scheduleGroup: "hourly", adapter: mgtvAdapter, healthPolicy: healthPolicy(["platform_catalog", "platform_rank"], "hourly", "popularity") },
  { sourceId: "bilibili", scheduleGroup: "daily", adapter: bilibiliAdapter, healthPolicy: healthPolicy(["platform_rank"], "daily", "popularity") },
  { sourceId: "douban", scheduleGroup: "daily", adapter: doubanAdapter, healthPolicy: healthPolicy(["rating"], "daily", "popularity") }
]

export function healthScopeKey(entry: RegisteredAdapter | Pick<RegisteredHealthScope, "sourceId" | "scope">): string {
  const scope = "scope" in entry ? entry.scope : entry.adapter.scope ?? "all"
  return `${entry.sourceId}:${scope}`
}

export const registeredHealthScopes: RegisteredHealthScope[] = [
  ...registeredAdapters.map((entry) => ({
    sourceId: entry.sourceId,
    scope: entry.adapter.scope ?? "all",
    scheduleGroup: entry.scheduleGroup,
    adapter: entry.adapter,
    healthPolicy: entry.healthPolicy
  })),
  {
    sourceId: "imdb",
    scope: "datasets_cache",
    scheduleGroup: "manual",
    healthPolicy: healthPolicy(["metadata", "rating"], "manual", "local_state")
  }
]

export function getEnabledAdapters(scheduleGroup?: ScheduleGroup): RegisteredAdapter[] {
  return registeredAdapters.filter((entry) => {
    return runtimeSettings.sourceRunnable(entry.sourceId)
      && (!scheduleGroup || entry.scheduleGroup === scheduleGroup)
  })
}

export function getEnabledAdaptersForSource(sourceId: string): RegisteredAdapter[] {
  if (!runtimeSettings.sourceRunnable(sourceId)) return []
  return registeredAdapters.filter((entry) => entry.sourceId === sourceId)
}

export function getImplementedAdaptersForSource(sourceId: string): RegisteredAdapter[] {
  return registeredAdapters.filter((entry) => entry.sourceId === sourceId)
}
