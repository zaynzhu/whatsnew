import { describe, expect, it } from "vitest"
import {
  createImdbTargetIndex,
  filterImdbRowsForTargets,
  imdbRowMatchesTargets
} from "../src/adapters/imdbDatasetTargets.js"
import type {
  ImdbTitleBasicsRow,
  ImdbTitleRatingRow
} from "../src/adapters/imdbDatasetsParser.js"
import type { ExistingMediaCandidate } from "../src/domain/types.js"

function candidate(overrides: Partial<ExistingMediaCandidate>): ExistingMediaCandidate {
  return {
    id: "media-1",
    mediaType: "movie",
    titleDisplay: "Midnight File",
    titleAliases: [],
    overview: null,
    posterUrl: null,
    productionCountries: "[]",
    genres: "[]",
    firstReleaseDate: "2026-02-14",
    originalLanguage: "en",
    status: "unknown",
    tmdbId: null,
    tvmazeId: null,
    imdbId: null,
    traktId: null,
    tvdbId: null,
    ...overrides
  }
}

function imdbRow(overrides: Partial<ImdbTitleBasicsRow>): ImdbTitleBasicsRow {
  return {
    tconst: "tt1000001",
    titleType: "movie",
    primaryTitle: "Midnight File",
    originalTitle: "Midnight Archive",
    isAdult: false,
    startYear: 2026,
    endYear: null,
    runtimeMinutes: 112,
    genres: ["Drama"],
    ...overrides
  }
}

describe("IMDb dataset targets", () => {
  it("matches existing media by IMDb ID before title keys", () => {
    const targets = createImdbTargetIndex([
      candidate({ imdbId: "tt2000002", titleDisplay: "Different Title" })
    ])

    expect(imdbRowMatchesTargets(imdbRow({ tconst: "tt2000002", primaryTitle: "Noisy Title" }), targets)).toBe(true)
  })

  it("matches media without IMDb ID by normalized title, year, and media type", () => {
    const targets = createImdbTargetIndex([
      candidate({ imdbId: null, titleAliases: ["Midnight Archive"] })
    ])

    expect(imdbRowMatchesTargets(imdbRow({ primaryTitle: "Midnight Archive" }), targets)).toBe(true)
  })

  it("does not match title keys when year differs", () => {
    const targets = createImdbTargetIndex([candidate({ imdbId: null })])

    expect(imdbRowMatchesTargets(imdbRow({ startYear: 2025 }), targets)).toBe(false)
  })

  it("does not match title keys when media type differs", () => {
    const targets = createImdbTargetIndex([candidate({ mediaType: "series", imdbId: null })])

    expect(imdbRowMatchesTargets(imdbRow({ titleType: "movie" }), targets)).toBe(false)
  })

  it("maps only matched basics rows and attaches matching ratings", () => {
    const targets = createImdbTargetIndex([candidate({ imdbId: "tt1000001" })])
    const ratings: ImdbTitleRatingRow[] = [
      { tconst: "tt1000001", averageRating: 7.8, numVotes: 120345 },
      { tconst: "tt9999999", averageRating: 9.1, numVotes: 10 }
    ]

    const items = filterImdbRowsForTargets([
      imdbRow({ tconst: "tt1000001" }),
      imdbRow({ tconst: "tt9999999", primaryTitle: "Unknown Film" })
    ], ratings, targets)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      createIfMissing: false,
      media: { imdbId: "tt1000001" },
      popularitySignals: [{ source: "imdb_rating", value: 7.8 }]
    })
  })

  it("drops matched rows that the IMDb adapter mapping rejects", () => {
    const targets = createImdbTargetIndex([candidate({ imdbId: "tt1000001" })])

    expect(filterImdbRowsForTargets([
      imdbRow({ tconst: "tt1000001", isAdult: true })
    ], [], targets)).toEqual([])
  })
})
