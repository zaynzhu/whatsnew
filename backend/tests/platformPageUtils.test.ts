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
      releasePattern: "catalog_addition",
      sourceUrl: "https://press.hulu.com/schedule/"
    }, "2026-07-01")

    expect(item?.media).toMatchObject({
      source: "hulu",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "The Bear: Complete Season 5",
      firstReleaseDate: null,
      status: "released"
    })
    expect(item?.media.sourceId).toMatch(/^hulu-[a-f0-9]{12}$/)
    expect(item?.releases[0]).toMatchObject({
      platform: "Hulu",
      region: "US",
      releaseDate: "2026-07-01",
      releasePattern: "catalog_addition",
      releaseStatus: "airing_today",
      source: "hulu"
    })
    expect(item?.popularitySignals).toEqual([])
  })

  it("keeps platform availability separate from an older work's original year", () => {
    const item = candidateToAdapterItem(config, {
      title: "Bad Boys",
      titleAliases: ["Bad Boys (1995)"],
      sourceContentType: "movie",
      releaseDate: "2026-07-01",
      originalReleaseYear: 1995,
      releasePattern: "catalog_addition",
      description: "Added",
      labels: ["Added"],
      sourceUrl: "https://press.hulu.com/schedule/"
    }, "2026-07-01")

    expect(item?.media).toMatchObject({
      titleDisplay: "Bad Boys",
      titleAliases: ["Bad Boys (1995)"],
      firstReleaseDate: "1995",
      status: "released"
    })
    expect(item?.releases[0]).toMatchObject({
      releaseDate: "2026-07-01",
      releasePattern: "catalog_addition"
    })
  })

  it("keeps sourceId distinct when title and date match but media type differs", () => {
    const movie = candidateToAdapterItem(config, {
      title: "Twin Release",
      sourceContentType: "movie",
      releaseDate: "2026-07-01",
      description: "Original movie event",
      labels: ["Movie"],
      sourceUrl: "https://press.hulu.com/schedule/twin-release"
    }, "2026-07-01")

    const series = candidateToAdapterItem(config, {
      title: "Twin Release",
      sourceContentType: "series",
      releaseDate: "2026-07-01",
      description: "Original series event",
      labels: ["Series"],
      sourceUrl: "https://press.hulu.com/schedule/twin-release"
    }, "2026-07-01")

    expect(movie?.media.mediaType).toBe("movie")
    expect(series?.media.mediaType).toBe("series")
    expect(movie?.media.sourceId).not.toBe(series?.media.sourceId)
  })

  it("classifies plural labels without misreading showcase as show", () => {
    expect(candidateToAdapterItem(config, {
      title: "Planet Earth Collection",
      sourceContentType: "collection",
      releaseDate: "2026-07-01",
      description: null,
      labels: ["Documentaries"],
      sourceUrl: "https://press.hulu.com/schedule/docs"
    }, "2026-07-01")?.media).toMatchObject({
      mediaType: "documentary",
      releaseForm: "documentary_series"
    })

    expect(candidateToAdapterItem(config, {
      title: "Live Night",
      sourceContentType: "event",
      releaseDate: "2026-07-01",
      description: null,
      labels: ["Specials"],
      sourceUrl: "https://press.hulu.com/schedule/specials"
    }, "2026-07-01")?.media).toMatchObject({
      mediaType: "variety",
      releaseForm: "variety_season"
    })

    expect(candidateToAdapterItem(config, {
      title: "Spotlight Slate",
      sourceContentType: "editorial",
      releaseDate: "2026-07-01",
      description: null,
      labels: ["Shows"],
      sourceUrl: "https://press.hulu.com/schedule/shows"
    }, "2026-07-01")?.media).toMatchObject({
      mediaType: "series",
      releaseForm: "tv_series"
    })

    expect(candidateToAdapterItem(config, {
      title: "Summer Showcase",
      sourceContentType: "collection",
      releaseDate: "2026-07-01",
      description: null,
      labels: [],
      sourceUrl: "https://press.hulu.com/schedule/showcase"
    }, "2026-07-01")).toBeNull()
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
