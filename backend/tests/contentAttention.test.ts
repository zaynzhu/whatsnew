import { describe, expect, it } from "vitest"
import {
  contentAttentionCategory,
  featuredScore,
  type AttentionMedia
} from "../src/domain/contentAttention.js"
import { CONTENT_WEIGHT_DEFINITIONS } from "../src/settings/contentAttentionSettings.js"

const weights = Object.fromEntries(
  CONTENT_WEIGHT_DEFINITIONS.map((definition) => [definition.category, definition.defaultValue])
) as Record<(typeof CONTENT_WEIGHT_DEFINITIONS)[number]["category"], number>

function media(overrides: Partial<AttentionMedia>): AttentionMedia {
  return {
    mediaType: "series",
    releaseForm: "tv_series",
    sourceContentType: "Scripted:tv",
    genres: "[]",
    heatScore: 0,
    posterUrl: "https://example.com/poster.jpg",
    ...overrides
  }
}

describe("content attention", () => {
  it("classifies TVmaze news separately from scripted series", () => {
    expect(contentAttentionCategory(media({ sourceContentType: "News:tv" }))).toBe("news")
    expect(contentAttentionCategory(media({ sourceContentType: "Scripted:web" }))).toBe("scripted")
  })

  it("keeps documentary and reality at the same default attention weight", () => {
    expect(weights.documentary).toBe(45)
    expect(weights.reality_variety).toBe(45)
  })

  it("ranks a scripted release above a same-day news program", () => {
    const scripted = featuredScore(media({ sourceContentType: "Scripted:tv" }), weights, 10)
    const news = featuredScore(media({ sourceContentType: "News:tv" }), weights, 10)

    expect(scripted).toBeGreaterThan(news)
  })
})
