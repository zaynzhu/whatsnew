import type { MediaItem } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"
import { enrichMissingPosters } from "../src/services/tmdbPosterEnrichmentService.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"

function media(overrides: Partial<MediaItem>): MediaItem {
  return {
    id: "media-1",
    mediaType: "movie",
    releaseForm: "streaming_movie",
    sourceContentType: "movie",
    titleDisplay: "Sample Movie",
    titleOriginal: null,
    titleAliases: "[]",
    overview: null,
    posterUrl: null,
    posterLookupAttemptedAt: null,
    productionCountries: "[]",
    originalLanguage: null,
    genres: "[]",
    firstReleaseDate: null,
    status: "unknown",
    heatScore: 100,
    tmdbId: null,
    tvmazeId: null,
    imdbId: null,
    traktId: null,
    tvdbId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  }
}

function settings(): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-poster-enrichment-env"), {
    TMDB_API_KEY: "tmdb-key",
    TMDB_BASE_URL: "https://api.tmdb.test/3",
    TMDB_IMAGE_BASE_URL: "https://image.tmdb.test/w500"
  })
}

describe("TMDb poster enrichment", () => {
  it("enriches direct TMDb IDs and unique exact title matches", async () => {
    const items = [
      media({ id: "direct", titleDisplay: "Direct Movie", tmdbId: 101 }),
      media({ id: "search", titleDisplay: "Husbands in Action" })
    ]
    const update = vi.fn(async ({ where, data }) => ({
      ...items.find((item) => item.id === where.id),
      ...data
    }))
    const database = {
      mediaItem: {
        findMany: vi.fn(async () => items),
        update
      },
      mediaSourceRef: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({}))
      }
    }
    const fetchJson = vi.fn(async (_source: string, rawUrl: string) => {
      const url = new URL(rawUrl)
      if (url.pathname.endsWith("/movie/101")) {
        return {
          id: 101,
          title: "Direct Movie",
          poster_path: "/direct.jpg",
          release_date: "2026-05-01",
          overview: "Direct overview",
          original_language: "en"
        }
      }
      return {
        results: [{
          id: 202,
          title: "Husbands in Action",
          original_title: "Husbands in Action",
          poster_path: "/husbands.jpg",
          release_date: "2026-06-01",
          overview: "Search overview",
          original_language: "id"
        }]
      }
    })

    const result = await enrichMissingPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      today: () => "2026-07-10",
      now: () => new Date("2026-07-10T00:00:00.000Z")
    })

    expect(result).toMatchObject({ scanned: 2, enriched: 2, unmatched: 0, conflicts: 0, failed: 0 })
    expect(database.mediaItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          {
            OR: [
              { posterUrl: null },
              { posterUrl: "" }
            ]
          },
          {
            OR: [
              { posterLookupAttemptedAt: null },
              { posterLookupAttemptedAt: { lt: new Date("2026-07-03T00:00:00.000Z") } }
            ]
          }
        ]
      }
    }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "direct" },
      data: expect.objectContaining({
        posterUrl: "https://image.tmdb.test/w500/direct.jpg",
        status: "released"
      })
    }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "search" },
      data: expect.objectContaining({
        posterUrl: "https://image.tmdb.test/w500/husbands.jpg",
        tmdbId: 202
      })
    }))
  })

  it("skips ambiguous exact title matches", async () => {
    const item = media({ titleDisplay: "Raw" })
    const database = {
      mediaItem: {
        findMany: vi.fn(async () => [item]),
        update: vi.fn()
      },
      mediaSourceRef: {
        findUnique: vi.fn(),
        upsert: vi.fn()
      }
    }
    const fetchJson = vi.fn(async () => ({
      results: [
        { id: 1, title: "Raw", poster_path: "/one.jpg" },
        { id: 2, title: "Raw", poster_path: "/two.jpg" }
      ]
    }))

    const result = await enrichMissingPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never
    })

    expect(result.unmatched).toBe(1)
    expect(database.mediaItem.update).toHaveBeenCalledWith({
      where: { id: "media-1" },
      data: { posterLookupAttemptedAt: expect.any(Date) }
    })
  })
})
