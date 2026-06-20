export type PopularityMovement = "new" | "rising" | "falling" | "stable"
export type PopularityEventType = "rank_entered" | "heat_rising" | "rank_changed"

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

export function heatFromCurrentSignals(signals: Array<{ rank: number | null }>): number {
  return signals.reduce((score, signal) => {
    return Math.max(score, signal.rank == null ? 0 : Math.max(0, 101 - signal.rank))
  }, 0)
}
