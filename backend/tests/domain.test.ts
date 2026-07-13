import { describe, expect, it } from "vitest"
import { classifyMedia } from "../src/domain/mediaClassifier.js"
import { normalizePlatform, normalizeTitle } from "../src/domain/normalizer.js"
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

  it("maps animation movies to animated films", () => {
    expect(classifyMedia({ source: "tmdb", sourceContentType: "movie", genres: ["Animation"] })).toEqual({
      mediaType: "anime",
      releaseForm: "animated_film"
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

describe("normalizePlatform", () => {
  it("maps source-specific signal names to their platform", () => {
    expect(normalizePlatform("iqiyi_reserve")).toBe("iQIYI")
    expect(normalizePlatform("tmdb_tv_trending")).toBe("TMDb")
    expect(normalizePlatform("youku_hot")).toBe("Youku")
    expect(normalizePlatform("youku_reserve")).toBe("Youku")
  })
})

describe("findBestMatch", () => {
  const candidateMetadata = {
    releaseForm: "tv_series" as const,
    overview: null,
    posterUrl: null,
    productionCountries: "[]",
    genres: "[]",
    status: "unknown",
    tvdbId: null
  }

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
      { ...candidateMetadata, id: "a", mediaType: "series", titleDisplay: "Different", titleAliases: [], firstReleaseDate: null, originalLanguage: null, tmdbId: 100, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(input, candidates)?.id).toBe("a")
  })

  it("does not match TMDb ids across movie and series work kinds", () => {
    const candidates: ExistingMediaCandidate[] = [
      { ...candidateMetadata, id: "movie", mediaType: "movie", releaseForm: "streaming_movie", titleDisplay: "Different Movie", titleAliases: [], firstReleaseDate: "2026-04-01", originalLanguage: "en", tmdbId: 100, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(input, candidates)).toBeNull()
  })

  it("matches stable ids across content types within the same series work kind", () => {
    const candidates: ExistingMediaCandidate[] = [
      { ...candidateMetadata, id: "anime", mediaType: "anime", releaseForm: "animated_series", titleDisplay: "尼古喵喵", titleAliases: [], firstReleaseDate: "2026-07-03", originalLanguage: "ja", tmdbId: 100, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(input, candidates)?.id).toBe("anime")
  })

  it("matches TVDB ids for the same media type", () => {
    const candidates: ExistingMediaCandidate[] = [
      { ...candidateMetadata, id: "tvdb", mediaType: "series", titleDisplay: "Different", titleAliases: [], firstReleaseDate: null, originalLanguage: null, tmdbId: null, tvmazeId: null, imdbId: null, traktId: null, tvdbId: 200 }
    ]

    expect(findBestMatch({ ...input, tmdbId: null, tvdbId: 200 }, candidates)?.id).toBe("tvdb")
  })

  it("does not force low-confidence title matches", () => {
    const candidates: ExistingMediaCandidate[] = [
      { ...candidateMetadata, id: "b", mediaType: "series", titleDisplay: "The Last Ship", titleAliases: [], firstReleaseDate: "2014-06-22", originalLanguage: "en", tmdbId: null, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(input, candidates)).toBeNull()
  })

  it("does not match title, language, and year across different media types", () => {
    const movieInput: NormalizedMediaInput = {
      ...input,
      sourceId: "movie-123",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      sourceContentType: "movie",
      titleDisplay: "归港夜",
      titleOriginal: "归港夜",
      titleAliases: [],
      firstReleaseDate: "2026-04-01",
      originalLanguage: "zh",
      genres: ["Drama"],
      productionCountries: ["CN"],
      tmdbId: null
    }

    const candidates: ExistingMediaCandidate[] = [
      { ...candidateMetadata, id: "series", mediaType: "series", titleDisplay: "归港夜", titleAliases: [], firstReleaseDate: "2026-09-12", originalLanguage: "zh", tmdbId: null, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(movieInput, candidates)).toBeNull()
  })

  it("matches title, media type, and language when both release dates are unknown", () => {
    const undatedInput: NormalizedMediaInput = {
      ...input,
      source: "youku",
      sourceId: "youku-short-1",
      mediaType: "short_drama",
      releaseForm: "micro_drama",
      sourceContentType: "短剧",
      titleDisplay: "红了樱桃绿了芭蕉",
      titleOriginal: "红了樱桃绿了芭蕉",
      titleAliases: [],
      firstReleaseDate: null,
      originalLanguage: "zh",
      genres: ["短剧"],
      productionCountries: ["CN"],
      tmdbId: null
    }

    const candidates: ExistingMediaCandidate[] = [
      { ...candidateMetadata, id: "movie", titleDisplay: "红了樱桃绿了芭蕉", titleAliases: [], firstReleaseDate: null, originalLanguage: "zh", mediaType: "movie", tmdbId: null, tvmazeId: null, imdbId: null, traktId: null },
      { ...candidateMetadata, id: "short", titleDisplay: "红了樱桃绿了芭蕉", titleAliases: [], firstReleaseDate: null, originalLanguage: "zh", mediaType: "short_drama", tmdbId: null, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(undatedInput, candidates)?.id).toBe("short")
  })

  it("matches title, media type, and language when one release date is unknown", () => {
    const datedInput: NormalizedMediaInput = {
      ...input,
      source: "iqiyi",
      sourceId: "iqiyi-movie-1",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      sourceContentType: "电影",
      titleDisplay: "镖人：风起大漠",
      titleOriginal: "镖人：风起大漠",
      titleAliases: [],
      firstReleaseDate: "2026-06-18",
      originalLanguage: "zh",
      genres: ["电影"],
      productionCountries: ["CN"],
      tmdbId: null
    }

    const candidates: ExistingMediaCandidate[] = [
      { ...candidateMetadata, id: "same", titleDisplay: "镖人：风起大漠", titleAliases: [], firstReleaseDate: null, originalLanguage: "zh", mediaType: "movie", tmdbId: null, tvmazeId: null, imdbId: null, traktId: null },
      { ...candidateMetadata, id: "wrong-type", titleDisplay: "镖人：风起大漠", titleAliases: [], firstReleaseDate: null, originalLanguage: "zh", mediaType: "series", tmdbId: null, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(datedInput, candidates)?.id).toBe("same")
  })

  it("normalizes language names before exact-title matching", () => {
    const catalogInput: NormalizedMediaInput = {
      ...input,
      source: "disney_plus",
      sourceId: "disney-project-runway",
      titleDisplay: "Project Runway",
      titleOriginal: null,
      titleAliases: ["Project Runway Season 22, Disney+ & Hulu"],
      firstReleaseDate: null,
      originalLanguage: "en",
      tmdbId: null
    }
    const candidates: ExistingMediaCandidate[] = [{
      ...candidateMetadata,
      id: "tvmaze-project-runway",
      mediaType: "series",
      titleDisplay: "Project Runway",
      titleAliases: [],
      firstReleaseDate: "2004-12-01",
      originalLanguage: "English",
      tmdbId: null,
      tvmazeId: 123,
      imdbId: null,
      traktId: null
    }]

    expect(findBestMatch(catalogInput, candidates)?.id).toBe("tvmaze-project-runway")
  })

  it("matches an unknown-language platform item only to one unique external identity", () => {
    const catalogInput: NormalizedMediaInput = {
      ...input,
      source: "disney_plus",
      sourceId: "disney-shop-for-killers",
      titleDisplay: "A Shop for Killers",
      titleOriginal: null,
      titleAliases: [],
      firstReleaseDate: null,
      originalLanguage: null,
      tmdbId: null
    }
    const candidates: ExistingMediaCandidate[] = [{
      ...candidateMetadata,
      id: "canonical",
      mediaType: "series",
      titleDisplay: "A Shop for Killers",
      titleAliases: [],
      firstReleaseDate: "2024-01-17",
      originalLanguage: "ko",
      tmdbId: 215072,
      tvmazeId: null,
      imdbId: "tt26450613",
      traktId: null
    }]

    expect(findBestMatch(catalogInput, candidates)?.id).toBe("canonical")
  })

  it("does not guess when an unknown-language title has multiple external identities", () => {
    const catalogInput: NormalizedMediaInput = {
      ...input,
      source: "hulu",
      sourceId: "hulu-love-island",
      titleDisplay: "Love Island",
      titleOriginal: null,
      titleAliases: [],
      firstReleaseDate: null,
      originalLanguage: null,
      tmdbId: null
    }
    const candidates: ExistingMediaCandidate[] = [2015, 2019].map((year) => ({
      ...candidateMetadata,
      id: `love-island-${year}`,
      mediaType: "series",
      titleDisplay: "Love Island",
      titleAliases: [],
      firstReleaseDate: `${year}-01-01`,
      originalLanguage: "en",
      tmdbId: year,
      tvmazeId: null,
      imdbId: null,
      traktId: null
    }))

    expect(findBestMatch(catalogInput, candidates)).toBeNull()
  })
})
