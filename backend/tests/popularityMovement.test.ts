import { describe, expect, it } from "vitest"
import {
  calculateRankDelta,
  classifyMovement,
  classifyPopularityEvent,
  heatFromCurrentSignals,
  isHeatBearingSignal
} from "../src/domain/popularityMovement.js"

describe("popularity movement", () => {
  it("treats a lower current rank as positive movement", () => {
    expect(calculateRankDelta(12, 7)).toBe(5)
    expect(classifyMovement(12, 7)).toBe("rising")
    expect(classifyMovement(7, 12)).toBe("falling")
    expect(classifyMovement(null, 8)).toBe("new")
    expect(classifyMovement(8, 8)).toBe("stable")
  })

  it("emits at most one event using the approved thresholds", () => {
    expect(classifyPopularityEvent(null, 8)).toBe("rank_entered")
    expect(classifyPopularityEvent(14, 9)).toBe("heat_rising")
    expect(classifyPopularityEvent(10, 5)).toBe("heat_rising")
    expect(classifyPopularityEvent(4, 7)).toBe("rank_changed")
    expect(classifyPopularityEvent(4, 5)).toBeNull()
  })

  it("uses the strongest current rank as the auxiliary heat score", () => {
    expect(heatFromCurrentSignals([
      { source: "trakt_trending", rank: 18 },
      { source: "tmdb_trending", rank: 3 },
      { source: "imdb_rating", rank: null }
    ])).toBe(98)
    expect(heatFromCurrentSignals([])).toBe(0)
  })

  it("keeps Douban preview and reputation ranks outside Heat", () => {
    expect(isHeatBearingSignal({ source: "douban_upcoming", rank: 1 })).toBe(false)
    expect(isHeatBearingSignal({ source: "douban_top", rank: 1 })).toBe(false)
    expect(heatFromCurrentSignals([
      { source: "douban_upcoming", rank: 1 },
      { source: "douban_top", rank: 1 },
      { source: "trakt_trending", rank: 8 }
    ])).toBe(93)
  })
})
