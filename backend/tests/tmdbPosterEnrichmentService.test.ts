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
    posterStatus: "unverified",
    posterCheckedAt: null,
    posterFailureCount: 0,
    posterFailureReason: null,
    posterWidth: null,
    posterHeight: null,
    posterQuality: "unknown",
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
  it("can bypass the retry window for an explicit manual repair", async () => {
    const findMany = vi.fn(async (_args?: unknown) => [])
    const database = {
      mediaItem: { findMany }
    }

    await enrichMissingPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson: vi.fn() } as never,
      force: true
    })

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        AND: [{
          OR: [
            { posterUrl: null },
            { posterUrl: "" },
            { posterStatus: "broken" },
            { posterQuality: "undersized" }
          ]
        }]
      }
    })
  })

  it("enriches direct TMDb IDs and unique exact title matches", async () => {
    const items = [
      media({ id: "direct", titleDisplay: "Direct Movie", tmdbId: 101 }),
      media({ id: "search", titleDisplay: "Husbands in Action" }),
      media({
        id: "lowres",
        titleDisplay: "Low Resolution Movie",
        tmdbId: 303,
        posterUrl: "https://img.test/lowres.jpg",
        posterWidth: 141,
        posterHeight: 188,
        posterQuality: "undersized"
      })
    ]
    const update = vi.fn(async ({ where, data }) => ({
      ...items.find((item) => item.id === where.id),
      ...data
    }))
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : items),
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
      if (url.pathname.endsWith("/movie/303")) {
        return {
          id: 303,
          title: "Low Resolution Movie",
          poster_path: "/lowres-replacement.jpg",
          release_date: "2026-06-15",
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

    expect(result).toMatchObject({ scanned: 3, enriched: 3, merged: 0, unmatched: 0, conflicts: 0, failed: 0 })
    expect(database.mediaItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          {
            OR: [
              { posterUrl: null },
              { posterUrl: "" },
              { posterStatus: "broken" },
              { posterQuality: "undersized" }
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
        posterStatus: "unverified",
        posterFailureCount: 0,
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
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lowres" },
      data: expect.objectContaining({
        posterUrl: "https://image.tmdb.test/w500/lowres-replacement.jpg",
        posterWidth: null,
        posterHeight: null,
        posterQuality: "unknown"
      })
    }))
  })

  it("skips ambiguous exact title matches", async () => {
    const item = media({ titleDisplay: "Raw" })
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : [item]),
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

  it("selects a clearly leading recent Netflix title but keeps old ambiguity unresolved", async () => {
    const items = [
      media({ id: "blast", titleDisplay: "Blast", sourceContentType: "Films (Non-English)" }),
      media({ id: "old", titleDisplay: "Archive", sourceContentType: "Films (English)" }),
      media({ id: "tie", titleDisplay: "Twin", sourceContentType: "Films (English)" })
    ]
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : items),
        findUnique: vi.fn(),
        update: vi.fn(async ({ where, data }) => ({
          ...items.find((item) => item.id === where.id),
          ...data
        }))
      },
      mediaSourceRef: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({}))
      }
    }
    const fetchJson = vi.fn(async (_source: string, rawUrl: string) => {
      const title = new URL(rawUrl).searchParams.get("query")
      if (title === "Blast") {
        return { results: [
          { id: 2026, title: "Blast", poster_path: "/new.jpg", release_date: "2026-05-28", original_language: "ta", popularity: 12 },
          { id: 2022, title: "Blast", poster_path: "/old.jpg", release_date: "2022-06-16", original_language: "fr", popularity: 2 }
        ] }
      }
      if (title === "Twin") {
        return { results: [
          { id: 20261, title: "Twin", poster_path: "/one.jpg", release_date: "2026-05-01", original_language: "en", popularity: 4 },
          { id: 20262, title: "Twin", poster_path: "/two.jpg", release_date: "2026-04-01", original_language: "en", popularity: 2 }
        ] }
      }
      return { results: [
        { id: 2000, title: "Archive", poster_path: "/one.jpg", release_date: "2000-01-01", original_language: "en", popularity: 10 },
        { id: 1999, title: "Archive", poster_path: "/two.jpg", release_date: "1999-01-01", original_language: "en", popularity: 8 }
      ] }
    })

    const result = await enrichMissingPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      today: () => "2026-07-10",
      now: () => new Date("2026-07-10T00:00:00.000Z")
    })

    expect(result).toMatchObject({ enriched: 1, unmatched: 2 })
    expect(database.mediaItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "blast" },
      data: expect.objectContaining({ tmdbId: 2026, posterUrl: "https://image.tmdb.test/w500/new.jpg" })
    }))
  })

  it("retries a Netflix title without a trailing raw edition qualifier", async () => {
    const item = media({
      titleDisplay: "Dhurandhar The Revenge (Raw & Undekha)",
      sourceContentType: "Films (Non-English)"
    })
    const update = vi.fn(async ({ data }) => ({ ...item, ...data }))
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : [item]),
        update
      },
      mediaSourceRef: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({}))
      }
    }
    const fetchJson = vi.fn(async (_source: string, rawUrl: string) => {
      const query = new URL(rawUrl).searchParams.get("query")
      if (query?.includes("Raw & Undekha")) return { results: [] }
      return { results: [{
        id: 1582770,
        title: "Dhurandhar: The Revenge",
        poster_path: "/dhurandhar.jpg",
        release_date: "2026-03-19",
        original_language: "hi"
      }] }
    })

    const result = await enrichMissingPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      today: () => "2026-07-11"
    })

    expect(result).toMatchObject({ enriched: 1, unmatched: 0 })
    expect(fetchJson).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tmdbId: 1582770,
        posterUrl: "https://image.tmdb.test/w500/dhurandhar.jpg"
      })
    }))
  })

  it("merges a title-only Netflix duplicate into an existing TMDb title", async () => {
    const duplicate = media({
      id: "netflix-copy",
      titleDisplay: "Little Brother",
      sourceContentType: "Films (English)",
      originalLanguage: "en",
      heatScore: 99
    })
    const canonical = media({
      id: "canonical",
      titleDisplay: "Little Brother",
      posterUrl: "https://image.tmdb.test/w500/little.jpg",
      tmdbId: 1397385,
      firstReleaseDate: "2026-06-26",
      originalLanguage: "en",
      heatScore: 83
    })
    const transaction = {
      mediaSourceRef: { updateMany: vi.fn(async () => ({ count: 1 })) },
      release: { updateMany: vi.fn(async () => ({ count: 0 })) },
      popularitySignal: { updateMany: vi.fn(async () => ({ count: 1 })) },
      changeEvent: { updateMany: vi.fn(async () => ({ count: 0 })) },
      mediaItem: {
        update: vi.fn(async ({ data }) => ({ ...canonical, ...data })),
        delete: vi.fn(async () => duplicate)
      }
    }
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : [duplicate]),
        findUnique: vi.fn(async () => canonical),
        update: vi.fn()
      },
      mediaSourceRef: {
        findUnique: vi.fn(async () => ({ mediaItemId: canonical.id })),
        upsert: vi.fn()
      },
      $transaction: vi.fn(async (callback) => callback(transaction))
    }
    const fetchJson = vi.fn(async () => ({ results: [
      { id: 1397385, title: "Little Brother", poster_path: "/little.jpg", release_date: "2026-06-18", original_language: "en", popularity: 84 },
      { id: 979157, title: "Little Brother", poster_path: "/other.jpg", release_date: "2025-10-22", original_language: "en", popularity: 0.7 }
    ] }))

    const result = await enrichMissingPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      today: () => "2026-07-10",
      now: () => new Date("2026-07-10T00:00:00.000Z")
    })

    expect(result).toMatchObject({ enriched: 0, merged: 1, conflicts: 0 })
    expect(transaction.mediaSourceRef.updateMany).toHaveBeenCalledWith({
      where: { mediaItemId: duplicate.id },
      data: { mediaItemId: canonical.id }
    })
    expect(transaction.mediaItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: canonical.id },
      data: expect.objectContaining({ heatScore: 99, tmdbId: 1397385 })
    }))
    expect(transaction.mediaItem.delete).toHaveBeenCalledWith({ where: { id: duplicate.id } })
  })

  it("merges a Netflix duplicate into one recent local title before searching TMDb", async () => {
    const duplicate = media({
      id: "netflix-avatar",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "Avatar: The Last Airbender",
      titleAliases: "[\"Avatar: The Last Airbender: Season 2\"]",
      sourceContentType: "TV (English)",
      originalLanguage: "en",
      heatScore: 98
    })
    const canonical = media({
      id: "canonical-avatar",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "Avatar: The Last Airbender",
      posterUrl: "https://image.tmdb.test/w500/avatar.jpg",
      firstReleaseDate: "2024-02-22",
      originalLanguage: "en",
      status: "returning",
      tmdbId: 82452,
      heatScore: 80
    })
    const transaction = {
      mediaSourceRef: { updateMany: vi.fn(async () => ({ count: 2 })) },
      release: { updateMany: vi.fn(async () => ({ count: 0 })) },
      popularitySignal: { updateMany: vi.fn(async () => ({ count: 1 })) },
      changeEvent: { updateMany: vi.fn(async () => ({ count: 0 })) },
      mediaItem: {
        update: vi.fn(async ({ data }) => ({ ...canonical, ...data })),
        delete: vi.fn(async () => duplicate)
      }
    }
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [canonical] : [duplicate]),
        findUnique: vi.fn(),
        update: vi.fn()
      },
      mediaSourceRef: {
        findUnique: vi.fn(),
        upsert: vi.fn()
      },
      $transaction: vi.fn(async (callback) => callback(transaction))
    }
    const fetchJson = vi.fn()

    const result = await enrichMissingPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      today: () => "2026-07-10",
      now: () => new Date("2026-07-10T00:00:00.000Z")
    })

    expect(result).toMatchObject({ merged: 1, enriched: 0, unmatched: 0 })
    expect(fetchJson).not.toHaveBeenCalled()
    expect(transaction.mediaItem.update).toHaveBeenCalledWith({
      where: { id: canonical.id },
      data: { heatScore: 98 }
    })
  })
})
