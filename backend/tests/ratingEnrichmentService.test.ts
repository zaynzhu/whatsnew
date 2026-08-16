import { describe, expect, it, vi } from "vitest"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import {
  enrichRatings,
  ratingCandidateTitles
} from "../src/services/ratingEnrichmentService.js"
import { SourceHttpError } from "../src/utils/sourceHttpClient.js"

type Candidate = {
  id: string
  mediaType: string
  releaseForm: string
  titleDisplay: string
  titleOriginal: string | null
  status: string
  tmdbId: number | null
  imdbId: string | null
  sourceRefs: Array<{ source: string; sourceId: string }>
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "media-1",
    mediaType: "movie",
    releaseForm: "theatrical_movie",
    titleDisplay: "示例电影",
    titleOriginal: "Sample Movie",
    status: "released",
    tmdbId: 101,
    imdbId: null,
    sourceRefs: [{ source: "douban", sourceId: "douban-1292052" }],
    ...overrides
  }
}

function settings(values: Record<string, string> = {}): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-rating-enrichment-env"), {
    TMDB_API_KEY: "test-tmdb-key",
    TMDB_BASE_URL: "https://tmdb.test/3",
    OMDB_API_KEY: "test-omdb-key",
    OMDB_BASE_URL: "https://omdb.test/",
    DOUBAN_BASE_URL: "https://douban.test/rexxar/api/v2/movie/coming_soon",
    ...values
  })
}

describe("多来源评分补全", () => {
  it("按稳定身份写入各来源评分且不修改 Heat", async () => {
    const findMany = vi.fn(async (_args?: unknown) => [candidate()])
    const update = vi.fn(async (_args: { data: Record<string, unknown> }) => ({}))
    const upsert = vi.fn(async ({ create }) => create)
    const database = {
      mediaItem: { findMany, update },
      mediaRating: { upsert }
    }
    const fetchJson = vi.fn(async (
      _source: string,
      rawUrl: string,
      _options?: { headers?: Record<string, string> }
    ) => {
      const url = new URL(rawUrl)
      if (url.hostname === "douban.test") return { rating: { value: 9.7, count: 2400000 } }
      if (url.hostname === "tmdb.test") {
        return {
          vote_average: 8.6,
          vote_count: 31000,
          external_ids: { imdb_id: "tt0111161" }
        }
      }
      if (url.hostname === "omdb.test") {
        return {
          Response: "True",
          imdbID: "tt0111161",
          Title: "Sample Movie",
          imdbRating: "9.3",
          imdbVotes: "3,100,000",
          Ratings: [{ Source: "Rotten Tomatoes", Value: "91%" }]
        }
      }
      throw new Error("unexpected JSON URL")
    })
    const fetchText = vi.fn(async (_source: string, rawUrl: string) => {
      const url = new URL(rawUrl)
      if (url.pathname === "/search") {
        return '<a data-qa="info-name" href="/m/sample_movie">Sample Movie</a>'
      }
      if (url.pathname === "/m/sample_movie") {
        return '<score-board tomatometerscore="95" audiencescore="90"></score-board>'
      }
      throw new Error("unexpected HTML URL")
    })
    const now = new Date("2026-08-16T08:00:00.000Z")

    const result = await enrichRatings({
      database: database as never,
      settings: settings(),
      httpClient: { fetchJson, fetchText } as never,
      now: () => now,
      limit: 1
    })

    expect(result).toMatchObject({ scanned: 1, updated: 1, unchanged: 0, failed: 0 })
    expect(upsert).toHaveBeenCalledTimes(5)
    expect(upsert.mock.calls.map(([argument]) => argument.create)).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "douban", audience: "users", value: 9.7, scale: 10 }),
      expect.objectContaining({ source: "tmdb", audience: "users", value: 8.6, scale: 10 }),
      expect.objectContaining({ source: "imdb", audience: "users", value: 9.3, scale: 10 }),
      expect.objectContaining({ source: "rotten_tomatoes", audience: "critics", value: 95, scale: 100 }),
      expect.objectContaining({ source: "rotten_tomatoes", audience: "audience", value: 90, scale: 100 })
    ]))
    expect(update).toHaveBeenCalledWith({
      where: { id: "media-1" },
      data: { imdbId: "tt0111161" }
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: "media-1" },
      data: { ratingsCheckedAt: now }
    })
    expect(update.mock.calls.some(([argument]) => "heatScore" in argument.data)).toBe(false)
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        status: { in: ["released", "ongoing", "returning", "ended"] },
        sourceRefs: { some: { isActive: true } }
      },
      take: 3
    })
    const doubanRequest = fetchJson.mock.calls.find(([, rawUrl]) => new URL(rawUrl).hostname === "douban.test")
    expect(doubanRequest?.[2]?.headers?.referer).toBe("https://m.douban.com/movie")
  })

  it("豆瓣 403 后熔断本轮请求并保留其他候选", async () => {
    const items = [
      candidate({ id: "blocked-1", tmdbId: null, titleDisplay: "甲", titleOriginal: null }),
      candidate({ id: "blocked-2", tmdbId: null, titleDisplay: "乙", titleOriginal: null, sourceRefs: [
        { source: "douban", sourceId: "douban-1295644" }
      ] })
    ]
    const update = vi.fn(async () => ({}))
    const fetchJson = vi.fn(async () => {
      throw new SourceHttpError("HTTP 403", "douban", 403, "")
    })
    const fetchText = vi.fn()

    const result = await enrichRatings({
      database: {
        mediaItem: { findMany: vi.fn(async () => items), update },
        mediaRating: { upsert: vi.fn() }
      } as never,
      settings: settings({ TMDB_API_KEY: "", OMDB_API_KEY: "" }),
      httpClient: { fetchJson, fetchText } as never,
      now: () => new Date("2026-08-16T08:00:00.000Z"),
      limit: 2
    })

    expect(fetchJson).toHaveBeenCalledTimes(1)
    expect(fetchText).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ scanned: 2, updated: 0, unchanged: 2, failed: 1 })
    expect(result.failures[0]).toEqual({
      mediaId: "blocked-1",
      source: "douban",
      reason: "douban HTTP 403"
    })
  })

  it("丢弃不合法的外部身份并避免中文标题空匹配", async () => {
    const findMany = vi.fn(async () => [
      candidate({ id: "bad-imdb", tmdbId: null, imdbId: "invalid", sourceRefs: [] }),
      candidate({ id: "bad-douban", tmdbId: null, sourceRefs: [{ source: "douban", sourceId: "douban-abc" }] }),
      candidate({ id: "valid", tmdbId: null, imdbId: "tt1234567", sourceRefs: [] })
    ])

    const result = await enrichRatings({
      database: {
        mediaItem: { findMany, update: vi.fn(async () => ({})) },
        mediaRating: { upsert: vi.fn() }
      } as never,
      settings: settings({ TMDB_API_KEY: "", OMDB_API_KEY: "" }),
      httpClient: { fetchJson: vi.fn(), fetchText: vi.fn(async () => "") } as never,
      limit: 3
    })

    expect(result.scanned).toBe(1)
    expect(ratingCandidateTitles({ titleDisplay: "只有中文", titleOriginal: null })).toEqual([])
  })

  it("烂番茄直连失败时仍保存 OMDb 提供的影评人分", async () => {
    const upsert = vi.fn(async ({ create }) => create)
    const fetchJson = vi.fn(async () => ({
      Response: "True",
      imdbID: "tt1234567",
      Title: "Fallback Movie",
      imdbRating: "7.5",
      imdbVotes: "1000",
      Ratings: [{ Source: "Rotten Tomatoes", Value: "82%" }]
    }))
    const fetchText = vi.fn(async () => {
      throw new Error("network unavailable")
    })

    const result = await enrichRatings({
      database: {
        mediaItem: {
          findMany: vi.fn(async () => [candidate({
            tmdbId: null,
            imdbId: "tt1234567",
            titleDisplay: "Fallback Movie",
            titleOriginal: null,
            sourceRefs: []
          })]),
          update: vi.fn(async () => ({}))
        },
        mediaRating: { upsert }
      } as never,
      settings: settings({ TMDB_API_KEY: "" }),
      httpClient: { fetchJson, fetchText } as never,
      limit: 1
    })

    expect(result).toMatchObject({ scanned: 1, updated: 1, failed: 1 })
    expect(upsert.mock.calls.map(([argument]) => argument.create)).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "imdb", value: 7.5 }),
      expect.objectContaining({
        source: "rotten_tomatoes",
        audience: "critics",
        value: 82,
        sourceUrl: null
      })
    ]))
  })
})
