import { describe, expect, it } from "vitest"
import {
  imdbRowsToAdapterItem,
  parseImdbTitleBasics,
  parseImdbTitleRatings,
  type ImdbTitleBasicsRow,
  type ImdbTitleRatingRow
} from "../src/adapters/imdbDatasetsParser.js"

describe("IMDb datasets parser", () => {
  const movieBasics: ImdbTitleBasicsRow = {
    tconst: "tt1000001",
    titleType: "movie",
    primaryTitle: "Midnight File",
    originalTitle: "Midnight Archive",
    isAdult: false,
    startYear: 2026,
    endYear: null,
    runtimeMinutes: 112,
    genres: ["Drama", "Mystery"]
  }
  const rating: ImdbTitleRatingRow = {
    tconst: "tt1000001",
    averageRating: 7.8,
    numVotes: 120345
  }

  it("parses title basics TSV rows with IMDb null markers", () => {
    const basicsText = [
      "tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres",
      "tt1000001\tmovie\tMidnight File\tMidnight File\t0\t2026\t\\N\t112\tDrama,Mystery"
    ].join("\n")

    expect(parseImdbTitleBasics(basicsText)).toEqual([{
      tconst: "tt1000001",
      titleType: "movie",
      primaryTitle: "Midnight File",
      originalTitle: "Midnight File",
      isAdult: false,
      startYear: 2026,
      endYear: null,
      runtimeMinutes: 112,
      genres: ["Drama", "Mystery"]
    }])
  })

  it("parses title ratings TSV rows", () => {
    const ratingsText = [
      "tconst\taverageRating\tnumVotes",
      "tt1000001\t7.8\t120345"
    ].join("\n")

    expect(parseImdbTitleRatings(ratingsText)).toEqual([{
      tconst: "tt1000001",
      averageRating: 7.8,
      numVotes: 120345
    }])
  })

  it("reports missing required columns with the field name", () => {
    const brokenText = [
      "tconst\ttitleType\tprimaryTitle",
      "tt1000001\tmovie\tMidnight File"
    ].join("\n")

    expect(() => parseImdbTitleBasics(brokenText)).toThrow("IMDb TSV 缺少必需字段: originalTitle")
  })

  it("maps supported IMDb titles to non-creating adapter items with rating signals", () => {
    expect(imdbRowsToAdapterItem(movieBasics, rating)).toMatchObject({
      createIfMissing: false,
      media: {
        source: "imdb",
        sourceId: "imdb:tt1000001",
        mediaType: "movie",
        releaseForm: "theatrical_movie",
        titleDisplay: "Midnight File",
        titleOriginal: "Midnight Archive",
        titleAliases: ["Midnight File", "Midnight Archive"],
        firstReleaseDate: "2026-01-01",
        genres: ["Drama", "Mystery"],
        imdbId: "tt1000001"
      },
      releases: [],
      popularitySignals: [{
        source: "imdb_rating",
        sourceCategory: "metadata_rating",
        platform: "IMDb",
        region: "GLOBAL",
        window: "lifetime",
        rank: null,
        value: 7.8,
        valueLabel: "7.8/10 · 120,345 votes",
        sourceUrl: "https://www.imdb.com/title/tt1000001/"
      }]
    })
  })

  it("filters unsupported title types and adult rows", () => {
    expect(imdbRowsToAdapterItem({ ...movieBasics, isAdult: true }, rating)).toBeNull()
    expect(imdbRowsToAdapterItem({ ...movieBasics, titleType: "tvEpisode" }, rating)).toBeNull()
  })
})
