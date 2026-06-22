import type { SourceAdapter, SourceFetchResult } from "../domain/types.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import type { ScheduleGroup } from "../settings/sourceCatalog.js"
import { iqiyiAdapter } from "./iqiyiAdapter.js"
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
}

export const registeredAdapters: RegisteredAdapter[] = [
  { sourceId: "tvmaze", scheduleGroup: "hourly", adapter: tvmazeAdapter },
  { sourceId: "tmdb", scheduleGroup: "hourly", adapter: tmdbAdapter },
  { sourceId: "trakt", scheduleGroup: "hourly", adapter: traktPopularityAdapter },
  { sourceId: "trakt", scheduleGroup: "daily", adapter: traktCalendarAdapter },
  { sourceId: "thetvdb", scheduleGroup: "daily", adapter: theTvdbAdapter },
  { sourceId: "netflix", scheduleGroup: "daily", adapter: netflixTop10Adapter },
  { sourceId: "youku", scheduleGroup: "hourly", adapter: youkuAdapter },
  { sourceId: "iqiyi", scheduleGroup: "hourly", adapter: iqiyiAdapter }
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
