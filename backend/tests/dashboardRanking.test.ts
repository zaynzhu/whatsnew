import { describe, expect, it } from "vitest"
import {
  dashboardReleasePriority,
  dashboardTimingBoost
} from "../src/routes/dashboard.js"
import type { AttentionMedia } from "../src/domain/contentAttention.js"

const media: AttentionMedia = {
  mediaType: "movie",
  releaseForm: "streaming_movie",
  sourceContentType: "movie",
  genres: [],
  heatScore: 0,
  posterUrl: null
}

const weights = {
  scripted: 100,
  animation: 100,
  documentary: 45,
  reality_variety: 45,
  talk_game: 35,
  news: 15,
  sports: 10
}

describe("dashboard release ranking", () => {
  it("ranks platform premieres ahead of ordinary schedules and catalog additions", () => {
    const priority = (releasePattern: string) => dashboardReleasePriority({
      releasePattern,
      mediaItem: media
    }, weights)

    expect(priority("platform_premiere")).toBeGreaterThan(priority("episode_release"))
    expect(priority("episode_release")).toBeGreaterThan(priority("catalog_addition"))
  })

  it("does not give catalog additions a homepage timing boost", () => {
    expect(dashboardTimingBoost("platform_premiere", 10)).toBe(15)
    expect(dashboardTimingBoost("episode_release", 10)).toBe(10)
    expect(dashboardTimingBoost("catalog_addition", 10)).toBe(0)
  })
})
