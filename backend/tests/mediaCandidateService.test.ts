import { describe, expect, it, vi } from "vitest"
import { loadExistingMediaCandidates } from "../src/services/mediaCandidateService.js"

describe("loadExistingMediaCandidates", () => {
  it("normalizes stored JSON arrays and media type rows", async () => {
    const prisma = {
      mediaItem: {
        findMany: vi.fn(async () => [{
          id: "media-1",
          mediaType: "movie",
          releaseForm: "streaming_movie",
          sourceContentType: "movie",
          titleDisplay: "Midnight File",
          titleAliases: "[\"Midnight Archive\"]",
          overview: null,
          posterUrl: null,
          productionCountries: "[\"US\"]",
          genres: "[\"Drama\"]",
          firstReleaseDate: "2026-02-14",
          originalLanguage: "en",
          status: "released",
          tmdbId: 123,
          tvmazeId: null,
          imdbId: "tt1000001",
          traktId: null,
          tvdbId: null
        }])
      }
    }

    await expect(loadExistingMediaCandidates(prisma as never)).resolves.toEqual([{
      id: "media-1",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      sourceContentType: "movie",
      titleDisplay: "Midnight File",
      titleAliases: ["Midnight Archive"],
      overview: null,
      posterUrl: null,
      productionCountries: "[\"US\"]",
      genres: "[\"Drama\"]",
      firstReleaseDate: "2026-02-14",
      originalLanguage: "en",
      status: "released",
      tmdbId: 123,
      tvmazeId: null,
      imdbId: "tt1000001",
      traktId: null,
      tvdbId: null
    }])
  })
})
