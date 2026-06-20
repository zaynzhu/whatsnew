import type { SourceAdapter } from "../domain/types.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import { iqiyiAdapter } from "./iqiyiAdapter.js"
import { tmdbAdapter } from "./tmdbAdapter.js"
import { tvmazeAdapter } from "./tvmazeAdapter.js"
import { youkuAdapter } from "./youkuAdapter.js"

export const implementedAdapters = {
  tvmaze: tvmazeAdapter,
  tmdb: tmdbAdapter,
  youku: youkuAdapter,
  iqiyi: iqiyiAdapter
} as const

export function getImplementedAdapter(sourceId: string): SourceAdapter | null {
  return implementedAdapters[sourceId as keyof typeof implementedAdapters] ?? null
}

export function getEnabledAdapters(): SourceAdapter[] {
  return Object.entries(implementedAdapters)
    .filter(([sourceId]) => runtimeSettings.sourceEnabled(sourceId))
    .map(([, adapter]) => adapter)
}

export function getEnabledAdapter(sourceId: string): SourceAdapter | null {
  const adapter = getImplementedAdapter(sourceId)
  if (!adapter || !runtimeSettings.sourceEnabled(sourceId)) return null
  return adapter
}
