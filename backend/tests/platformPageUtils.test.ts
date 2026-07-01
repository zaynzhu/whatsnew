import { describe, expect, it } from "vitest"
import {
  candidateToAdapterItem,
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformAdapterConfig
} from "../src/adapters/platformPageUtils.js"

const config: PlatformAdapterConfig = {
  source: "hulu",
  platform: "Hulu",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: "https://press.hulu.com/schedule/"
}

describe("platformPageUtils", () => {
  it("cleans repeated whitespace and html entities from platform text", () => {
    expect(cleanPlatformText("  The&nbsp;Bear\n Season 5  ")).toBe("The Bear Season 5")
    expect(cleanPlatformText("   ")).toBeNull()
  })

  it("parses English release dates with the supplied year", () => {
    expect(parseEnglishReleaseDate("July 1", 2026)).toBe("2026-07-01")
    expect(parseEnglishReleaseDate("Jul. 9, 2026", 2025)).toBe("2026-07-09")
    expect(parseEnglishReleaseDate("Coming soon", 2026)).toBeNull()
  })

  it("maps clear platform candidates to release-only adapter items", () => {
    const item = candidateToAdapterItem(config, {
      title: "The Bear: Complete Season 5",
      sourceContentType: "series",
      releaseDate: "2026-07-01",
      description: "FX series returns",
      labels: ["Complete Season 5"],
      sourceUrl: "https://press.hulu.com/schedule/"
    }, "2026-07-01")

    expect(item?.media).toMatchObject({
      source: "hulu",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "The Bear: Complete Season 5",
      firstReleaseDate: "2026-07-01",
      status: "released"
    })
    expect(item?.media.sourceId).toMatch(/^hulu-[a-f0-9]{12}$/)
    expect(item?.releases[0]).toMatchObject({
      platform: "Hulu",
      region: "US",
      releaseDate: "2026-07-01",
      releasePattern: "platform_schedule",
      releaseStatus: "airing_today",
      source: "hulu"
    })
    expect(item?.popularitySignals).toEqual([])
  })

  it("skips candidates without a concrete date or media type", () => {
    expect(candidateToAdapterItem(config, {
      title: "Ambiguous Showcase",
      sourceContentType: "collection",
      releaseDate: "2026-07-01",
      description: null,
      labels: [],
      sourceUrl: "https://press.hulu.com/schedule/"
    }, "2026-07-01")).toBeNull()

    expect(candidateToAdapterItem(config, {
      title: "Movie Without Day",
      sourceContentType: "movie",
      releaseDate: null,
      description: null,
      labels: ["Movie"],
      sourceUrl: "https://press.hulu.com/schedule/"
    }, "2026-07-01")).toBeNull()
  })
})
