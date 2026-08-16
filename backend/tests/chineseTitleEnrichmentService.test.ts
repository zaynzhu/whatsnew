import type { MediaItem } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"
import {
  enrichChineseTitles
} from "../src/services/chineseTitleEnrichmentService.js"
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
    titleChinese: null,
    titleChineseSource: null,
    titleChineseCheckedAt: null,
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
    ratingsCheckedAt: null,
    heatScore: 100,
    tmdbId: 101,
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
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-title-enrichment-env"), {
    TMDB_API_KEY: "tmdb-key",
    TMDB_BASE_URL: "https://api.tmdb.test/3"
  })
}

describe("Chinese title enrichment", () => {
  it("uses zh-CN titles and stable regional alternatives without changing canonical titles", async () => {
    const items = [
      media({ id: "primary", titleDisplay: "House of the Dragon", tmdbId: 101 }),
      media({ id: "alternative", titleDisplay: "X-Men '97", tmdbId: 102, mediaType: "series", releaseForm: "tv_series" }),
      media({ id: "rejected", titleDisplay: "Attack on Titan", tmdbId: 103, mediaType: "series", releaseForm: "tv_series" })
    ]
    const update = vi.fn(async ({ where, data }) => ({
      ...items.find((item) => item.id === where.id),
      ...data
    }))
    const database = {
      mediaItem: {
        findMany: vi.fn(async () => items),
        update
      }
    }
    const fetchJson = vi.fn(async (_source: string, rawUrl: string) => {
      const url = new URL(rawUrl)
      expect(url.searchParams.get("language")).toBe("zh-CN")
      expect(url.searchParams.get("append_to_response")).toBe("alternative_titles")
      if (url.pathname.endsWith("/movie/101")) return { id: 101, title: "权力的游戏前传：龙族" }
      if (url.pathname.endsWith("/tv/102")) {
        return {
          id: 102,
          name: "X-Men '97",
          alternative_titles: {
            results: [
              { iso_3166_1: "TW", title: "X战警 '97" },
              { iso_3166_1: "CN", title: "X战警97" }
            ]
          }
        }
      }
      return { id: 103, name: "進撃の巨人", alternative_titles: { results: [] } }
    })

    const result = await enrichChineseTitles({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson } as never,
      limit: 3,
      now: () => new Date("2026-08-15T00:00:00.000Z")
    })

    expect(result).toMatchObject({ scanned: 3, enriched: 2, notFound: 1, failed: 0 })
    expect(update).toHaveBeenCalledWith({
      where: { id: "primary" },
      data: {
        titleChinese: "权力的游戏前传：龙族",
        titleChineseSource: "tmdb:zh-CN",
        titleChineseCheckedAt: new Date("2026-08-15T00:00:00.000Z")
      }
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: "alternative" },
      data: expect.objectContaining({ titleChinese: "X战警97" })
    })
    expect(items.map((item) => item.titleDisplay)).toEqual([
      "House of the Dragon",
      "X-Men '97",
      "Attack on Titan"
    ])
  })

  it("does not start a cooldown after a network failure", async () => {
    const update = vi.fn()
    const result = await enrichChineseTitles({
      database: {
        mediaItem: {
          findMany: vi.fn(async () => [media({})]),
          update
        }
      } as never,
      settings: settings(),
      httpClient: {
        fetchJson: vi.fn(async () => {
          throw new Error("fetch failed")
        })
      } as never
    })

    expect(result).toMatchObject({ scanned: 1, enriched: 0, notFound: 0, failed: 1 })
    expect(update).not.toHaveBeenCalled()
  })

  it("records a completed check when a stable TMDb identity no longer exists", async () => {
    const item = media({})
    const update = vi.fn(async () => item)
    const now = new Date("2026-08-15T00:00:00.000Z")
    const result = await enrichChineseTitles({
      database: {
        mediaItem: {
          findMany: vi.fn(async () => [item]),
          update
        }
      } as never,
      settings: settings(),
      httpClient: {
        fetchJson: vi.fn(async () => {
          throw new SourceHttpError("not found", "tmdb", 404, "")
        })
      } as never,
      now: () => now
    })

    expect(result).toMatchObject({ scanned: 1, enriched: 0, notFound: 1, failed: 0 })
    expect(update).toHaveBeenCalledWith({
      where: { id: item.id },
      data: { titleChineseCheckedAt: now }
    })
  })
})
