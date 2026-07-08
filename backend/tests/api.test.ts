import type { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter.js"
import { traktCalendarAdapter, traktPopularityAdapter } from "../src/adapters/traktAdapter.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { runtimeSettings } from "../src/settings/runtimeSettingsService.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import { runSourceSync } from "../src/services/sourceSyncService.js"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"

let createApp: typeof import("../src/app.js").createApp
let createSourceHealthRouter: typeof import("../src/routes/sourceHealth.js").createSourceHealthRouter
let createSourceHealthService: typeof import("../src/services/sourceHealthService.js").createSourceHealthService
let createSourcesRouter: typeof import("../src/routes/sources.js").createSourcesRouter
let createSyncRouter: typeof import("../src/routes/sources.js").createSyncRouter
const prisma: PrismaClient = testPrisma

function testSettings(values: Record<string, string> = {}): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-api-env"), values)
}

function emptySettings(): RuntimeSettingsService {
  return testSettings()
}

beforeAll(async () => {
  const [appModule, sourceHealthModule, sourceHealthServiceModule, sourcesModule] = await Promise.all([
    import("../src/app.js"),
    import("../src/routes/sourceHealth.js"),
    import("../src/services/sourceHealthService.js"),
    import("../src/routes/sources.js")
  ])
  createApp = appModule.createApp
  createSourceHealthRouter = sourceHealthModule.createSourceHealthRouter
  createSourceHealthService = sourceHealthServiceModule.createSourceHealthService
  createSourcesRouter = sourcesModule.createSourcesRouter
  createSyncRouter = sourcesModule.createSyncRouter
})

beforeEach(async () => {
  await resetTestDatabase()
  await runSourceSync(prisma, demoSeedAdapter)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("api routes", () => {
  it("returns dashboard sections for the current date window", async () => {
    await prisma.sourceSyncRun.createMany({
      data: [
        { source: "tmdb", status: "success", itemCount: 10 },
        { source: "tmdb", status: "success", itemCount: 12 }
      ]
    })
    const response = await request(createApp()).get("/api/dashboard")
    const today = new Date()
    const todayDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-")

    expect(response.status).toBe(200)
    expect(response.body.today.every((release: any) => release.releaseDate === todayDate)).toBe(true)
    expect(Array.isArray(response.body.week)).toBe(true)
    expect(response.body.trending.length).toBeGreaterThan(0)
    expect(response.body.sources.map((run: any) => run.source)).toEqual(["tmdb"])
  })

  it("filters media by mediaType", async () => {
    const response = await request(createApp()).get("/api/media?mediaType=movie")

    expect(response.status).toBe(200)
    expect(response.body.items.every((item: any) => item.mediaType === "movie")).toBe(true)
    expect(response.body.items[0].dataSources).toEqual(expect.arrayContaining(["demo", "demo_trending"]))
  })

  it("returns calendar releases", async () => {
    const response = await request(createApp()).get("/api/calendar")
    const today = new Date()
    const todayDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-")

    expect(response.status).toBe(200)
    expect(response.body.items.every((release: any) => release.releaseDate >= todayDate)).toBe(true)
  })

  it("returns trending and source status routes", async () => {
    await prisma.sourceSyncRun.create({
      data: { source: "tmdb", status: "success", itemCount: 10 }
    })
    const trendingResponse = await request(createApp()).get("/api/trending?window=week")
    const sourcesResponse = await request(createApp({
      sourcesRouter: createSourcesRouter({ database: prisma, settings: emptySettings() })
    })).get("/api/sources")

    expect(trendingResponse.status).toBe(200)
    expect(trendingResponse.body.items.length).toBeGreaterThan(0)
    expect(sourcesResponse.status).toBe(200)
    expect(sourcesResponse.body.items).toHaveLength(22)
    expect(sourcesResponse.body.items.find((source: any) => source.id === "tmdb")).toMatchObject({
      name: "TMDb",
      latestRun: expect.objectContaining({
        status: "success",
        itemCount: 10
      }),
      semantics: expect.objectContaining({
        signalKinds: expect.arrayContaining(["metadata", "community_trend"])
      })
    })
    expect(sourcesResponse.body.items.find((source: any) => source.id === "hulu")).toMatchObject({
      implementationStatus: "active",
      supportsSync: true,
      enabled: false,
      runnable: false,
      semantics: expect.objectContaining({
        signalKinds: ["platform_catalog", "release_calendar"],
        access: "public_page"
      })
    })
    expect(sourcesResponse.body.items.find((source: any) => source.id === "disney_plus")).toMatchObject({
      implementationStatus: "active",
      supportsSync: true,
      enabled: false,
      runnable: false,
      semantics: expect.objectContaining({
        signalKinds: ["platform_catalog", "release_calendar"],
        access: "public_page"
      })
    })
    expect(sourcesResponse.body.items.find((source: any) => source.id === "max")).toMatchObject({
      implementationStatus: "active",
      supportsSync: true,
      enabled: false,
      runnable: false,
      semantics: expect.objectContaining({
        signalKinds: ["platform_catalog", "release_calendar"],
        access: "public_page"
      })
    })
    expect(sourcesResponse.body.items.find((source: any) => source.id === "prime_video")).toMatchObject({
      implementationStatus: "planned",
      supportsSync: false,
      semantics: expect.objectContaining({
        signalKinds: ["platform_catalog"]
      })
    })
  })

  it("returns source health summary and scope rows", async () => {
    await prisma.sourceSyncRun.create({
      data: {
        source: "trakt",
        scope: "popularity",
        status: "success",
        startedAt: new Date(),
        finishedAt: new Date(),
        itemCount: 3
      }
    })
    const settings = testSettings({
      TRAKT_CLIENT_ID: "client-id",
      SOURCE_TRAKT_ENABLED: "true"
    })
    const response = await request(createApp({
      sourceHealthRouter: createSourceHealthRouter({
        service: createSourceHealthService({ database: prisma, settings })
      })
    })).get("/api/source-health")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      summary: expect.objectContaining({
        total: expect.any(Number),
        passed: expect.any(Number),
        degraded: expect.any(Number),
        failed: expect.any(Number),
        blocked: expect.any(Number),
        runnable: expect.any(Number),
        stale: expect.any(Number)
      })
    })
    expect(response.body.items.find((item: any) => item.sourceId === "trakt" && item.scope === "popularity")).toMatchObject({
      sourceName: "Trakt",
      scheduleGroup: "hourly",
      runStatus: "success",
      acceptanceStatus: "passed",
      reasonCode: "passed",
      samples: expect.any(Array)
    })
  })

  it("filters current trending signals by movement and source", async () => {
    const media = await prisma.mediaItem.findFirstOrThrow()
    const capturedAt = new Date()
    const baseSignal = {
      mediaItemId: media.id,
      sourceCategory: "metadata_community",
      platform: "TMDb",
      region: "GLOBAL",
      window: "week",
      value: null,
      valueLabel: null,
      capturedAt,
      sourceUrl: "https://example.test/trending",
      isCurrent: true
    }

    await prisma.popularitySignal.createMany({
      data: [
        { ...baseSignal, source: "movement_new", rank: 8, previousRank: null, rankDelta: null },
        { ...baseSignal, source: "movement_rising", rank: 7, previousRank: 12, rankDelta: 5 },
        { ...baseSignal, source: "movement_falling", rank: 7, previousRank: 4, rankDelta: -3 },
        { ...baseSignal, source: "movement_stable", rank: 7, previousRank: 7, rankDelta: 0 }
      ]
    })

    const cases = [
      ["new", "movement_new"],
      ["rising", "movement_rising"],
      ["falling", "movement_falling"],
      ["stable", "movement_stable"]
    ]
    for (const [movement, source] of cases) {
      const response = await request(createApp()).get(
        `/api/trending?movement=${movement}&source=${source}&platform=TMDb&region=GLOBAL`
      )
      expect(response.status).toBe(200)
      expect(response.body.items).toHaveLength(1)
      expect(response.body.items[0]).toMatchObject({ source, isCurrent: true })
    }
  })

  it("returns bounded popularity history while media detail stays current-only", async () => {
    const media = await prisma.mediaItem.findFirstOrThrow()
    const currentCapturedAt = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const historicalCapturedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

    await prisma.popularitySignal.createMany({
      data: [
        {
          mediaItemId: media.id,
          source: "tmdb_trending",
          sourceCategory: "metadata_community",
          platform: "TMDb",
          region: "GLOBAL",
          window: "week",
          rank: 12,
          previousRank: null,
          rankDelta: null,
          capturedAt: historicalCapturedAt,
          isCurrent: false
        },
        {
          mediaItemId: media.id,
          source: "tmdb_trending",
          sourceCategory: "metadata_community",
          platform: "TMDb",
          region: "GLOBAL",
          window: "week",
          rank: 7,
          previousRank: 12,
          rankDelta: 5,
          capturedAt: currentCapturedAt,
          isCurrent: true
        }
      ]
    })
    await prisma.mediaSourceRef.createMany({
      data: [
        {
          mediaItemId: media.id,
          source: "thetvdb",
          sourceId: "thetvdb:series:100",
          isActive: true
        },
        {
          mediaItemId: media.id,
          source: "tmdb",
          sourceId: "tmdb:tv:100",
          isActive: false
        }
      ]
    })

    const rising = await request(createApp()).get(
      "/api/trending?movement=rising&source=tmdb_trending"
    )
    const history = await request(createApp()).get(
      `/api/media/${media.id}/popularity-history?source=tmdb_trending&days=30&limit=10`
    )
    const detail = await request(createApp()).get(`/api/media/${media.id}`)

    expect(rising.status).toBe(200)
    expect(rising.body.items).toHaveLength(1)
    expect(rising.body.items[0]).toMatchObject({
      isCurrent: true,
      previousRank: 12,
      rank: 7,
      rankDelta: 5
    })
    expect(history.status).toBe(200)
    expect(history.body.items.map((item: { rank: number }) => item.rank)).toEqual([12, 7])
    expect(detail.status).toBe(200)
    expect(detail.body.popularitySignals.every((signal: { isCurrent: boolean }) => {
      return signal.isCurrent
    })).toBe(true)
    expect(detail.body.popularitySignals.filter((signal: { source: string }) => {
      return signal.source === "tmdb_trending"
    })).toHaveLength(1)
    expect(detail.body.sourceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "thetvdb", isActive: true }),
      expect.objectContaining({ source: "tmdb", isActive: false })
    ]))
  })

  it("rejects popularity history windows outside 1 to 90 days", async () => {
    const media = await prisma.mediaItem.findFirstOrThrow()
    const response = await request(createApp()).get(
      `/api/media/${media.id}/popularity-history?days=91`
    )

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: "invalid_query" })
  })

  it("rejects unknown source sync requests", async () => {
    const response = await request(createApp()).post("/api/sources/unknown/sync")

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: "source_not_implemented" })
  })

  it("rejects demo source sync requests", async () => {
    const response = await request(createApp()).post("/api/sources/demo/sync")

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: "source_not_implemented" })
  })

  it("rejects planned source sync requests", async () => {
    const response = await request(createApp()).post("/api/sources/imdb/sync")

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: "source_not_implemented" })
  })

  it("rejects disabled implemented source sync requests", async () => {
    vi.spyOn(runtimeSettings, "sourceEnabled").mockImplementation((sourceId) => sourceId !== "tmdb")

    const response = await request(createApp()).post("/api/sources/tmdb/sync")

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: "source_disabled" })
  })

  it("reports disabled before missing credentials", async () => {
    vi.spyOn(runtimeSettings, "sourceEnabled").mockReturnValue(false)
    vi.spyOn(runtimeSettings, "missingCredentials").mockReturnValue(["TRAKT_CLIENT_ID"])

    const response = await request(createApp()).post("/api/sources/trakt/sync")

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: "source_disabled" })
  })

  it("rejects source sync requests with missing credentials", async () => {
    vi.spyOn(runtimeSettings, "sourceEnabled").mockReturnValue(true)
    vi.spyOn(runtimeSettings, "missingCredentials").mockReturnValue(["TRAKT_CLIENT_ID"])

    const response = await request(createApp()).post("/api/sources/trakt/sync")

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: "credential_missing",
      missingCredentials: ["TRAKT_CLIENT_ID"]
    })
  })

  it("runs every Trakt adapter in order even when one scope fails", async () => {
    const executionOrder: string[] = []
    let popularityFinished = false
    vi.spyOn(runtimeSettings, "sourceEnabled").mockReturnValue(true)
    vi.spyOn(runtimeSettings, "missingCredentials").mockReturnValue([])
    vi.spyOn(traktPopularityAdapter, "fetchItems").mockImplementation(async () => {
      executionOrder.push("popularity:start")
      await new Promise((resolve) => setTimeout(resolve, 10))
      popularityFinished = true
      executionOrder.push("popularity:end")
      throw new Error("popularity failed")
    })
    vi.spyOn(traktCalendarAdapter, "fetchItems").mockImplementation(async () => {
      expect(popularityFinished).toBe(true)
      executionOrder.push("calendar")
      return { items: [], completeReleaseSources: ["trakt"] }
    })

    const response = await request(createApp()).post("/api/sources/trakt/sync")

    expect(response.status).toBe(200)
    expect(response.body.items.map((run: { scope: string }) => run.scope)).toEqual([
      "popularity",
      "calendar"
    ])
    expect(response.body.items.map((run: { status: string }) => run.status)).toEqual([
      "failed",
      "success"
    ])
    expect(executionOrder).toEqual(["popularity:start", "popularity:end", "calendar"])
  })

  it("runs every enabled adapter with credentials via POST /api/sync", async () => {
    vi.spyOn(runtimeSettings, "missingCredentials").mockReturnValue([])
    const mockAdapter = { source: "tmdb", scope: "all", async fetchItems() { return [] } }
    const response = await request(createApp({
      syncRouter: createSyncRouter({
        database: prisma,
        settings: runtimeSettings,
        enabledAdapters: [{ sourceId: "tmdb", scheduleGroup: "hourly", adapter: mockAdapter as never }]
      })
    })).post("/api/sync")

    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0].source).toBe("tmdb")
    expect(response.body.items[0].status).toBe("success")
  })

  it("skips adapters missing credentials in POST /api/sync", async () => {
    vi.spyOn(runtimeSettings, "missingCredentials").mockReturnValue(["TMDB_API_KEY"])
    const mockAdapter = { source: "tmdb", scope: "all", async fetchItems() { return [] } }
    const response = await request(createApp({
      syncRouter: createSyncRouter({
        database: prisma,
        settings: runtimeSettings,
        enabledAdapters: [{ sourceId: "tmdb", scheduleGroup: "hourly", adapter: mockAdapter as never }]
      })
    })).post("/api/sync")

    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(0)
  })
})
