import { describe, expect, it } from "vitest"
import {
  calculateRankDelta,
  classifyMovement,
  classifyPopularityEvent,
  heatFromCurrentSignals
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
    expect(heatFromCurrentSignals([{ rank: 18 }, { rank: 3 }, { rank: null }])).toBe(98)
    expect(heatFromCurrentSignals([])).toBe(0)
  })
})
