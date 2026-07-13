export type PopularityMovement = "new" | "rising" | "falling" | "stable"
export type PopularityEventType = "rank_entered" | "heat_rising" | "rank_changed"

export const NON_HEAT_SIGNAL_SOURCES = [
  "douban_top",
  "douban_upcoming"
] as const

const nonHeatSignalSources = new Set<string>(NON_HEAT_SIGNAL_SOURCES)

export type RankedPopularitySignal = {
  source: string
  rank: number | null
}

export function isHeatBearingSignal(signal: RankedPopularitySignal): boolean {
  return signal.rank != null && !nonHeatSignalSources.has(signal.source)
}

export function calculateRankDelta(
  previousRank: number | null,
  currentRank: number | null
): number | null {
  if (previousRank == null || currentRank == null) return null
  return previousRank - currentRank
}

export function classifyMovement(
  previousRank: number | null,
  currentRank: number | null
): PopularityMovement {
  if (previousRank == null && currentRank != null) return "new"
  const delta = calculateRankDelta(previousRank, currentRank)
  if (delta == null || delta === 0) return "stable"
  return delta > 0 ? "rising" : "falling"
}

export function classifyPopularityEvent(
  previousRank: number | null,
  currentRank: number | null
): PopularityEventType | null {
  if (currentRank == null) return null
  if (previousRank == null) return currentRank <= 10 ? "rank_entered" : null

  const delta = previousRank - currentRank
  if (delta >= 5 || (previousRank > 10 && currentRank <= 10)) return "heat_rising"
  return Math.abs(delta) >= 3 ? "rank_changed" : null
}

export function heatFromCurrentSignals(signals: RankedPopularitySignal[]): number {
  return signals.reduce((score, signal) => {
    if (!isHeatBearingSignal(signal) || signal.rank == null) return score
    return Math.max(score, Math.max(0, 101 - signal.rank))
  }, 0)
}
