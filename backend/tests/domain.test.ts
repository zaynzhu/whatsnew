import { describe, expect, it } from "vitest"
import { classifyMedia } from "../src/domain/mediaClassifier.js"
import { normalizeTitle } from "../src/domain/normalizer.js"
import { findBestMatch } from "../src/domain/matcher.js"
import type { ExistingMediaCandidate, NormalizedMediaInput } from "../src/domain/types.js"

describe("classifyMedia", () => {
  it("keeps movie and tv types distinct", () => {
    expect(classifyMedia({ source: "tmdb", sourceContentType: "movie", genres: ["Documentary"] })).toEqual({
      mediaType: "documentary",
      releaseForm: "documentary_film"
    })

    expect(classifyMedia({ source: "tmdb", sourceContentType: "tv", genres: ["Animation"] })).toEqual({
      mediaType: "anime",
      releaseForm: "animated_series"
    })
  })

  it("maps short drama source text", () => {
    expect(classifyMedia({ source: "youku", sourceContentType: "短剧", genres: [] })).toEqual({
      mediaType: "short_drama",
      releaseForm: "micro_drama"
    })
  })
})

describe("normalizeTitle", () => {
  it("normalizes whitespace and punctuation", () => {
    expect(normalizeTitle("  The  Last of Us： Season 2 ")).toBe("the last of us season 2")
  })
})

describe("findBestMatch", () => {
  const input: NormalizedMediaInput = {
    source: "tmdb",
    sourceId: "123",
    mediaType: "series",
    releaseForm: "tv_series",
    sourceContentType: "tv",
    titleDisplay: "The Last of Us",
    titleOriginal: "The Last of Us",
    titleAliases: ["最后生还者"],
    firstReleaseDate: "2026-04-01",
    originalLanguage: "en",
    genres: ["Drama"],
    productionCountries: ["US"],
    tmdbId: 100,
    tvmazeId: null,
    imdbId: null,
    traktId: null,
    tvdbId: null,
    overview: null,
    posterUrl: null
  }

  it("matches by external id first", () => {
    const candidates: ExistingMediaCandidate[] = [
      { id: "a", titleDisplay: "Different", titleAliases: [], firstReleaseDate: null, originalLanguage: null, tmdbId: 100, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(input, candidates)?.id).toBe("a")
  })

  it("does not force low-confidence title matches", () => {
    const candidates: ExistingMediaCandidate[] = [
      { id: "b", titleDisplay: "The Last Ship", titleAliases: [], firstReleaseDate: "2014-06-22", originalLanguage: "en", tmdbId: null, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(input, candidates)).toBeNull()
  })
})
