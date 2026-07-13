import type { MediaItem } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"
import { enrichMissingPosters } from "../src/services/tmdbPosterEnrichmentService.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import { SourceHttpError } from "../src/utils/sourceHttpClient.js"

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

function settings(overrides: Record<string, string> = {}): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-poster-enrichment-env"), {
    TMDB_API_KEY: "tmdb-key",
    TMDB_BASE_URL: "https://api.tmdb.test/3",
    TMDB_IMAGE_BASE_URL: "https://image.tmdb.test/w500",
    ...overrides
  })
}

function enrichPosters(options: Parameters<typeof enrichMissingPosters>[0]) {
  return enrichMissingPosters({
    imageService: {
      getPoster: vi.fn(async () => ({
        body: Buffer.from("poster"),
        contentType: "image/jpeg",
        width: 600,
        height: 900,
        cacheHit: false,
        cacheStatus: "miss" as const
      }))
    },
    ...options
  })
}

describe("TMDb poster enrichment", () => {
  it("can bypass the retry window for an explicit manual repair", async () => {
    const findMany = vi.fn(async (_args?: unknown) => [])
    const database = {
      mediaItem: { findMany }
    }

    await enrichPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson: vi.fn() } as never,
      force: true
    })

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        AND: [
          { sourceRefs: { some: { isActive: true } } },
          {
            OR: [
              { posterUrl: null },
              { posterUrl: "" },
              { posterStatus: "broken" },
              { posterQuality: "undersized" }
            ]
          }
        ]
      }
    })
  })

  it("prioritizes configured content attention over recently updated news", async () => {
    const news = media({
      id: "news",
      titleDisplay: "Morning News",
      sourceContentType: "news",
      heatScore: 100,
      updatedAt: new Date("2026-07-14T00:00:00.000Z")
    })
    const drama = media({
      id: "drama",
      titleDisplay: "Upcoming Drama",
      sourceContentType: "scripted",
      heatScore: 0,
      updatedAt: new Date("2026-07-01T00:00:00.000Z")
    })
    const update = vi.fn(async ({ where, data }) => ({
      ...(where.id === drama.id ? drama : news),
      ...data
    }))
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : [news, drama]),
        update
      },
      mediaSourceRef: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({}))
      }
    }
    const fetchJson = vi.fn(async (_source: string, rawUrl: string) => {
      const url = new URL(rawUrl)
      expect(url.searchParams.get("query")).toBe("Upcoming Drama")
      return {
        results: [{
          id: 902,
          title: "Upcoming Drama",
          poster_path: "/upcoming-drama.jpg"
        }]
      }
    })

    const result = await enrichPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      limit: 1
    })

    expect(result).toMatchObject({ scanned: 1, enriched: 1, failed: 0 })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "drama" }
    }))
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

    const result = await enrichPosters({
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
          { sourceRefs: { some: { isActive: true } } },
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
              { posterLookupAttemptedAt: { lt: new Date("2026-07-07T00:00:00.000Z") } }
            ]
          }
        ]
      }
    }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "direct" },
      data: expect.objectContaining({
        posterUrl: "https://image.tmdb.test/w500/direct.jpg",
        posterStatus: "healthy",
        posterWidth: 600,
        posterHeight: 900,
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
        posterWidth: 600,
        posterHeight: 900,
        posterQuality: "adequate"
      })
    }))
  })

  it("uses a year-scoped base alias within the bounded title queries", async () => {
    const item = media({
      titleDisplay: "Titanic En Espanol",
      titleAliases: "[\"Titanic\",\"Titanic En Espanol (1997)\"]",
      firstReleaseDate: "1997"
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
    const queries: string[] = []
    const fetchJson = vi.fn(async (_source: string, rawUrl: string) => {
      const query = new URL(rawUrl).searchParams.get("query") ?? ""
      queries.push(query)
      return query === "Titanic"
        ? { results: [{
            id: 597,
            title: "Titanic",
            original_title: "Titanic",
            poster_path: "/titanic.jpg",
            release_date: "1997-12-18"
          }] }
        : { results: [] }
    })

    const result = await enrichPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      today: () => "2026-07-14"
    })

    expect(result).toMatchObject({ scanned: 1, enriched: 1, unmatched: 0 })
    expect(queries).toEqual(["Titanic En Espanol", "Titanic"])
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tmdbId: 597 })
    }))
  })

  it("uses an exact IMDb identity for the OMDb poster fallback", async () => {
    const item = media({
      id: "imdb-fallback",
      titleDisplay: "The House That Dragons Built",
      imdbId: "tt26761151",
      posterUrl: "https://img.test/undersized.jpg",
      posterQuality: "undersized"
    })
    const update = vi.fn(async ({ data }) => ({ ...item, ...data }))
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : [item]),
        update
      }
    }
    const fetchJson = vi.fn(async (source: string, rawUrl: string) => {
      const url = new URL(rawUrl)
      expect(source).toBe("imdb")
      expect(url.searchParams.get("i")).toBe("tt26761151")
      return {
        Response: "True",
        imdbID: "tt26761151",
        Poster: "https://m.media-amazon.com/images/M/poster._V1_SX300.jpg"
      }
    })

    const result = await enrichPosters({
      database: database as never,
      settings: settings({
        OMDB_API_KEY: "omdb-key",
        OMDB_BASE_URL: "https://www.omdbapi.test"
      }),
      httpClient: { fetchJson } as never,
      imageService: {
        getPoster: vi.fn(async () => ({
          body: Buffer.from("poster"),
          contentType: "image/jpeg",
          width: 600,
          height: 900,
          cacheHit: false,
          cacheStatus: "miss" as const
        }))
      },
      now: () => new Date("2026-07-14T00:00:00.000Z")
    })

    expect(result).toMatchObject({ scanned: 1, enriched: 1, unmatched: 0, failed: 0 })
    expect(fetchJson).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith({
      where: { id: "imdb-fallback" },
      data: expect.objectContaining({
        posterUrl: "https://m.media-amazon.com/images/M/poster._V1_SX300.jpg",
        posterStatus: "healthy",
        posterWidth: 600,
        posterHeight: 900,
        posterQuality: "adequate"
      })
    })
  })

  it("keeps the existing poster when the TMDb image cannot be downloaded", async () => {
    const item = media({
      id: "tmdb-image-failure",
      titleDisplay: "Existing Poster",
      tmdbId: 404,
      posterUrl: "https://img.test/existing.jpg",
      posterQuality: "undersized"
    })
    const update = vi.fn()
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : [item]),
        update
      }
    }

    const result = await enrichPosters({
      database: database as never,
      settings: settings(),
      httpClient: {
        fetchJson: vi.fn(async () => ({
          id: 404,
          title: "Existing Poster",
          poster_path: "/temporarily-unavailable.jpg"
        }))
      } as never,
      imageService: {
        getPoster: vi.fn(async () => {
          throw new Error("upstream unavailable")
        })
      }
    })

    expect(result).toMatchObject({ scanned: 1, enriched: 0, failed: 1 })
    expect(update).not.toHaveBeenCalled()
  })

  it("rejects horizontal OMDb artwork and continues with TMDb", async () => {
    const item = media({
      id: "horizontal-omdb",
      titleDisplay: "Documentary Series",
      imdbId: "tt1234567",
      tmdbId: 303,
      posterUrl: "https://img.test/undersized.jpg",
      posterQuality: "undersized"
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
    const fetchJson = vi.fn(async (source: string) => source === "imdb"
      ? {
          Response: "True",
          imdbID: "tt1234567",
          Poster: "https://m.media-amazon.com/images/M/horizontal.jpg"
        }
      : {
          id: 303,
          title: "Documentary Series",
          poster_path: "/portrait.jpg"
        })

    const result = await enrichPosters({
      database: database as never,
      settings: settings({ OMDB_API_KEY: "omdb-key" }),
      httpClient: { fetchJson } as never,
      imageService: {
        getPoster: vi.fn(async (url: string) => ({
          body: Buffer.from("artwork"),
          contentType: "image/jpeg",
          width: 600,
          height: url.includes("media-amazon.com") ? 338 : 900,
          cacheHit: false,
          cacheStatus: "miss" as const
        }))
      }
    })

    expect(result).toMatchObject({ scanned: 1, enriched: 1, failed: 0 })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        posterUrl: "https://image.tmdb.test/w500/portrait.jpg",
        posterStatus: "healthy"
      })
    }))
  })

  it("keeps the existing poster when the OMDb image is unavailable", async () => {
    const item = media({
      id: "dead-omdb",
      imdbId: "tt7654321",
      posterUrl: "https://img.test/existing.jpg",
      posterQuality: "undersized"
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
    const fetchJson = vi.fn(async (source: string) => source === "imdb"
      ? {
          Response: "True",
          imdbID: "tt7654321",
          Poster: "https://m.media-amazon.com/images/M/dead.jpg"
        }
      : { results: [] })

    const result = await enrichPosters({
      database: database as never,
      settings: settings({ OMDB_API_KEY: "omdb-key" }),
      httpClient: { fetchJson } as never,
      imageService: {
        getPoster: vi.fn(async () => {
          throw new Error("HTTP 404")
        })
      }
    })

    expect(result).toMatchObject({ scanned: 1, enriched: 0, unmatched: 1, failed: 0 })
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ posterUrl: expect.any(String) })
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

    const result = await enrichPosters({
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

  it("keeps transport failures immediately retryable and reports a safe reason", async () => {
    const item = media({ titleDisplay: "Network Failure" })
    const update = vi.fn()
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : [item]),
        update
      },
      mediaSourceRef: {
        findUnique: vi.fn(),
        upsert: vi.fn()
      }
    }

    const result = await enrichPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson: vi.fn(async () => { throw new Error("fetch failed") }) } as never
    })

    expect(result).toMatchObject({
      scanned: 1,
      failed: 1,
      unmatched: 0,
      failures: [{ title: "Network Failure", reason: "TMDb 网络请求失败" }]
    })
    expect(update).not.toHaveBeenCalled()
  })

  it("cools down a missing direct TMDb identity after a confirmed 404", async () => {
    const item = media({ titleDisplay: "Removed TMDb Work", tmdbId: 404 })
    const update = vi.fn()
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => where?.posterUrl ? [] : [item]),
        update
      },
      mediaSourceRef: {
        findUnique: vi.fn(),
        upsert: vi.fn()
      }
    }

    const result = await enrichPosters({
      database: database as never,
      settings: settings(),
      httpClient: {
        fetchJson: vi.fn(async () => {
          throw new SourceHttpError("not found", "tmdb", 404, "")
        })
      } as never
    })

    expect(result).toMatchObject({ scanned: 1, failed: 0, unmatched: 1, failures: [] })
    expect(update).toHaveBeenCalledWith({
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

    const result = await enrichPosters({
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

    const result = await enrichPosters({
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

    const result = await enrichPosters({
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

    const result = await enrichPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      today: () => "2026-07-10",
      now: () => new Date("2026-07-10T00:00:00.000Z")
    })

    expect(result).toMatchObject({ merged: 1, enriched: 0, unmatched: 0 })
    expect(fetchJson).not.toHaveBeenCalled()
    expect(transaction.mediaItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: canonical.id },
      data: expect.objectContaining({ heatScore: 98 })
    }))
  })

  it("keeps a specialized classification when TMDb poster enrichment finds a generic duplicate", async () => {
    const anime = media({
      id: "anime-copy",
      mediaType: "anime",
      releaseForm: "animated_series",
      sourceContentType: "anime",
      titleDisplay: "Chainsmoker Cat",
      originalLanguage: "ja"
    })
    const generic = media({
      id: "generic-series",
      mediaType: "series",
      releaseForm: "tv_series",
      sourceContentType: "tv",
      titleDisplay: "Chainsmoker Cat",
      posterUrl: "https://image.tmdb.test/w500/chainsmoker-cat.jpg",
      tmdbId: 312949,
      tvmazeId: 90001,
      originalLanguage: "ja"
    })
    const transaction = {
      mediaSourceRef: { updateMany: vi.fn(async () => ({ count: 1 })) },
      release: { updateMany: vi.fn(async () => ({ count: 0 })) },
      popularitySignal: { updateMany: vi.fn(async () => ({ count: 0 })) },
      changeEvent: { updateMany: vi.fn(async () => ({ count: 0 })) },
      mediaItem: {
        update: vi.fn(async ({ data }) => ({ ...anime, ...data })),
        delete: vi.fn(async () => generic)
      }
    }
    const database = {
      mediaItem: {
        findMany: vi.fn(async ({ where } = {}) => Array.isArray(where?.AND) ? [anime] : []),
        findUnique: vi.fn(async () => generic),
        update: vi.fn(async ({ data }) => ({ ...anime, ...data }))
      },
      mediaSourceRef: {
        findUnique: vi.fn(async () => ({ mediaItemId: generic.id })),
        upsert: vi.fn()
      },
      $transaction: vi.fn(async (callback) => callback(transaction))
    }
    const fetchJson = vi.fn(async () => ({
      results: [{
        id: 312949,
        name: "Chainsmoker Cat",
        original_name: "Chainsmoker Cat",
        poster_path: "/chainsmoker-cat.jpg",
        first_air_date: "2026-07-03",
        original_language: "ja"
      }]
    }))

    const result = await enrichPosters({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      today: () => "2026-07-13",
      now: () => new Date("2026-07-13T00:00:00.000Z")
    })

    expect(result).toMatchObject({ merged: 1, conflicts: 0 })
    expect(transaction.mediaSourceRef.updateMany).toHaveBeenCalledWith({
      where: { mediaItemId: generic.id },
      data: { mediaItemId: anime.id }
    })
    expect(transaction.mediaItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: anime.id },
      data: expect.objectContaining({
        tmdbId: 312949,
        tvmazeId: 90001,
        posterUrl: "https://image.tmdb.test/w500/chainsmoker-cat.jpg"
      })
    }))
    expect(transaction.mediaItem.delete).toHaveBeenCalledWith({ where: { id: generic.id } })
  })
})
