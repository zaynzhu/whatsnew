import type { SourceAdapter } from "../domain/types.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import { getSourceDefinition } from "../settings/sourceCatalog.js"
import { iqiyiAdapter } from "./iqiyiAdapter.js"
import { netflixTop10Adapter } from "./netflixTop10Adapter.js"
import { tmdbAdapter } from "./tmdbAdapter.js"
import { tvmazeAdapter } from "./tvmazeAdapter.js"
import { youkuAdapter } from "./youkuAdapter.js"

export const implementedAdapters = {
  tvmaze: tvmazeAdapter,
  tmdb: tmdbAdapter,
  netflix: netflixTop10Adapter,
  youku: youkuAdapter,
  iqiyi: iqiyiAdapter
} as const

export function getImplementedAdapter(sourceId: string): SourceAdapter | null {
  return implementedAdapters[sourceId as keyof typeof implementedAdapters] ?? null
}

export function getEnabledAdapters(
  scheduleGroup?: "hourly" | "daily"
): SourceAdapter[] {
  return Object.entries(implementedAdapters)
    .filter(([sourceId]) => {
      return runtimeSettings.sourceEnabled(sourceId)
        && (!scheduleGroup || getSourceDefinition(sourceId).scheduleGroup === scheduleGroup)
    })
    .map(([, adapter]) => adapter)
}

export function getEnabledAdapter(sourceId: string): SourceAdapter | null {
  const adapter = getImplementedAdapter(sourceId)
  if (!adapter || !runtimeSettings.sourceEnabled(sourceId)) return null
  return adapter
}
