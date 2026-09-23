import type { PrismaClient } from "@prisma/client"
import request from "supertest"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"

let createApp: typeof import("../src/app.js").createApp
const prisma: PrismaClient = testPrisma

beforeAll(async () => {
  const appModule = await import("../src/app.js")
  createApp = appModule.createApp
})

beforeEach(async () => {
  await resetTestDatabase()
})

function lookupBody(extra: Record<string, unknown> = {}) {
  return { contractVersion: 1, ...extra }
}

describe("POST /api/media/lookup", () => {
  it("matches a douban id to the work with current signals and douban rating", async () => {
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "一瓯春",
        firstReleaseDate: "2026-10-01",
        status: "upcoming",
        heatScore: 12.5,
        sourceRefs: { create: { source: "douban", sourceId: "douban-35644140" } },
        popularitySignals: {
          create: {
            source: "douban_upcoming",
            sourceCategory: "chinese_interest",
            platform: "豆瓣",
            region: "CN",
            window: "2026-10-01",
            rank: 3
          }
        },
        ratings: {
          create: { source: "douban", audience: "all", value: 7.8, scale: 10, voteCount: 365671 }
        }
      }
    })

    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", doubanIds: [35644140] }))

    expect(response.status).toBe(200)
    expect(response.body.contractVersion).toBe(1)
    expect(response.body.counts).toEqual({ matched: 1, unmatched: 0, ambiguous: 0 })

    const item = response.body.items[0]
    expect(item.query).toEqual({ kind: "douban", id: 35644140 })
    expect(item.status).toBe("matched")
    expect(item.mediaId).toBe(media.id)
    expect(item.matchBasis).toBe("douban")
    expect(item.matchLevel).toBe("work")
    expect(item.titleDisplay).toBe("一瓯春")
    expect(item.mediaType).toBe("series")
    expect(item.releaseForm).toBe("tv_series")
    expect(item.imdbId).toBeNull()
    expect(item.signals).toHaveLength(1)
    expect(item.signals[0].source).toBe("douban_upcoming")
    expect(item.signals[0].isCurrent).toBe(true)
    expect(item.doubanRating.value).toBe(7.8)
    expect(item.doubanRating.scale).toBe(10)
    expect(item.doubanRating.voteCount).toBe(365671)
    expect(item.doubanRating.capturedAt).toBeTruthy()
  })

  it("returns unmatched for a douban id that is not in the library", async () => {
    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", doubanIds: [99999999] }))

    expect(response.status).toBe(200)
    expect(response.body.contractVersion).toBe(1)
    expect(response.body.counts).toEqual({ matched: 0, unmatched: 1, ambiguous: 0 })
    expect(response.body.items[0]).toEqual({
      query: { kind: "douban", id: 99999999 },
      status: "unmatched",
      reason: "no_work_level_identity"
    })
  })

  it("matches a work-level imdb id", async () => {
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "streaming_movie",
        titleDisplay: "Severance",
        imdbId: "tt11280740",
        tmdbId: 953389,
        sourceRefs: { create: { source: "imdb", sourceId: "imdb:tt11280740" } }
      }
    })

    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "movie", imdbIds: ["tt11280740"] }))

    expect(response.status).toBe(200)
    expect(response.body.counts).toEqual({ matched: 1, unmatched: 0, ambiguous: 0 })

    const item = response.body.items[0]
    expect(item.query).toEqual({ kind: "imdb", id: "tt11280740" })
    expect(item.status).toBe("matched")
    expect(item.mediaId).toBe(media.id)
    expect(item.matchBasis).toBe("imdb")
    expect(item.matchLevel).toBe("work")
    expect(item.imdbId).toBe("tt11280740")
    expect(item.tmdbId).toBe(953389)
  })

  it("reports unmatched for an episode-level imdb id with no work-level identity in the library", async () => {
    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", imdbIds: ["tt3658012"] }))

    expect(response.status).toBe(200)
    expect(response.body.counts).toEqual({ matched: 0, unmatched: 1, ambiguous: 0 })
    expect(response.body.items[0]).toEqual({
      query: { kind: "imdb", id: "tt3658012" },
      status: "unmatched",
      reason: "no_work_level_identity"
    })
  })

  it("returns matched with empty signals and the latest historical capture when no current signal exists", async () => {
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "旧信号作品",
        sourceRefs: { create: { source: "douban", sourceId: "douban-12345678" } },
        popularitySignals: {
          create: {
            source: "douban_upcoming",
            sourceCategory: "chinese_interest",
            platform: "豆瓣",
            region: "CN",
            window: "上期",
            isCurrent: false,
            capturedAt: new Date("2026-09-01T00:00:00.000Z")
          }
        }
      }
    })

    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", doubanIds: [12345678] }))

    expect(response.status).toBe(200)
    expect(response.body.counts).toEqual({ matched: 1, unmatched: 0, ambiguous: 0 })

    const item = response.body.items.find((entry: { status: string }) => entry.status === "matched")
    expect(item.mediaId).toBe(media.id)
    expect(item.signals).toEqual([])
    expect(item.lastSignalCapturedAt).toBe("2026-09-01T00:00:00.000Z")
    expect(item.doubanRating).toBeNull()
  })

  it("rejects a batch without mediaType with a request-level error", async () => {
    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ doubanIds: [35644140] }))

    expect(response.status).toBe(400)
    expect(response.body.error).toBe("invalid_body")
  })

  it("rejects a batch over the size limit instead of truncating", async () => {
    const doubanIds = Array.from({ length: 51 }, (_, index) => 10000000 + index)
    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", doubanIds }))

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: "batch_too_large", maxBatchSize: 50 })
  })

  it("rejects a batch with no queries", async () => {
    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", doubanIds: [], imdbIds: [] }))

    expect(response.status).toBe(400)
    expect(response.body.error).toBe("empty_lookup_batch")
  })

  it("rejects an unsupported contract version", async () => {
    const response = await request(createApp())
      .post("/api/media/lookup")
      .send({ contractVersion: 2, mediaType: "series", doubanIds: [35644140] })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: "unsupported_contract_version", supportedVersion: 1 })
  })

  it("rejects malformed imdb ids and non-integer douban ids", async () => {
    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", imdbIds: ["nm1234567"], doubanIds: [12.5] }))

    expect(response.status).toBe(400)
    expect(response.body.error).toBe("invalid_body")
  })

  it("marks multiple distinct works sharing one imdb id as ambiguous", async () => {
    const first = await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "同名作品一",
        imdbId: "tt2222222",
        sourceRefs: { create: { source: "imdb", sourceId: "imdb:tt2222222" } }
      }
    })
    const second = await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "同名作品二",
        imdbId: "tt2222222",
        sourceRefs: { create: { source: "imdb", sourceId: "imdb:tt2222222b" } }
      }
    })

    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", imdbIds: ["tt2222222"] }))

    expect(response.status).toBe(200)
    expect(response.body.counts).toEqual({ matched: 0, unmatched: 0, ambiguous: 1 })
    expect(response.body.items[0]).toEqual({
      query: { kind: "imdb", id: "tt2222222" },
      status: "ambiguous",
      reason: "multiple_candidates",
      candidateMediaIds: expect.arrayContaining([first.id, second.id])
    })
  })

  it("does not match a series work when the query kind is movie", async () => {
    await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "雨城迷案",
        sourceRefs: { create: { source: "douban", sourceId: "douban-35644140" } }
      }
    })

    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "movie", doubanIds: [35644140] }))

    expect(response.status).toBe(200)
    expect(response.body.counts).toEqual({ matched: 0, unmatched: 1, ambiguous: 0 })
    expect(response.body.items[0].status).toBe("unmatched")
  })

  it("treats animated_film as the movie kind and animated_series as the series kind", async () => {
    await prisma.mediaItem.create({
      data: {
        mediaType: "anime",
        releaseForm: "animated_film",
        titleDisplay: "剧场版动画",
        sourceRefs: { create: { source: "douban", sourceId: "douban-11111111" } }
      }
    })
    await prisma.mediaItem.create({
      data: {
        mediaType: "anime",
        releaseForm: "animated_series",
        titleDisplay: "连载动画",
        sourceRefs: { create: { source: "douban", sourceId: "douban-22222222" } }
      }
    })

    const movieResponse = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "movie", doubanIds: [11111111, 22222222] }))

    expect(movieResponse.status).toBe(200)
    expect(movieResponse.body.items[0]).toMatchObject({ status: "matched", releaseForm: "animated_film" })
    expect(movieResponse.body.items[1].status).toBe("unmatched")

    const seriesResponse = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", doubanIds: [11111111, 22222222] }))

    expect(seriesResponse.status).toBe(200)
    expect(seriesResponse.body.items[0].status).toBe("unmatched")
    expect(seriesResponse.body.items[1]).toMatchObject({ status: "matched", releaseForm: "animated_series" })
  })

  it("keeps items aligned with the request order and aggregates counts", async () => {
    for (const doubanId of [11111111, 33333333]) {
      await prisma.mediaItem.create({
        data: {
          mediaType: "series",
          releaseForm: "tv_series",
          titleDisplay: `剧 ${doubanId}`,
          sourceRefs: { create: { source: "douban", sourceId: `douban-${doubanId}` } }
        }
      })
    }

    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", doubanIds: [11111111, 22222222, 33333333] }))

    expect(response.status).toBe(200)
    expect(response.body.counts).toEqual({ matched: 2, unmatched: 1, ambiguous: 0 })
    expect(response.body.items.map((item: { query: { id: number } }) => item.query.id)).toEqual([11111111, 22222222, 33333333])
    expect(response.body.items[1].status).toBe("unmatched")
  })

  it("does not write any table when serving a lookup", async () => {
    await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "只读验证",
        sourceRefs: { create: { source: "douban", sourceId: "douban-35644140" } },
        popularitySignals: {
          create: {
            source: "douban_upcoming",
            sourceCategory: "chinese_interest",
            platform: "豆瓣",
            region: "CN",
            window: "2026-10-01",
            rank: 3
          }
        },
        ratings: {
          create: { source: "douban", audience: "users", value: 7.8, scale: 10, voteCount: 365671 }
        }
      }
    })
    const countBefore = {
      mediaItems: await prisma.mediaItem.count(),
      sourceRefs: await prisma.mediaSourceRef.count(),
      signals: await prisma.popularitySignal.count(),
      ratings: await prisma.mediaRating.count(),
      releases: await prisma.release.count(),
      changeEvents: await prisma.changeEvent.count(),
      syncRuns: await prisma.sourceSyncRun.count()
    }

    const response = await request(createApp())
      .post("/api/media/lookup")
      .send(lookupBody({ mediaType: "series", doubanIds: [35644140] }))

    expect(response.status).toBe(200)
    expect({
      mediaItems: await prisma.mediaItem.count(),
      sourceRefs: await prisma.mediaSourceRef.count(),
      signals: await prisma.popularitySignal.count(),
      ratings: await prisma.mediaRating.count(),
      releases: await prisma.release.count(),
      changeEvents: await prisma.changeEvent.count(),
      syncRuns: await prisma.sourceSyncRun.count()
    }).toEqual(countBefore)
  })
})