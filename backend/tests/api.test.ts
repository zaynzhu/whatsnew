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
let createMediaRouter: typeof import("../src/routes/media.js").createMediaRouter
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
  const [appModule, mediaModule, sourceHealthModule, sourceHealthServiceModule, sourcesModule] = await Promise.all([
    import("../src/app.js"),
    import("../src/routes/media.js"),
    import("../src/routes/sourceHealth.js"),
    import("../src/services/sourceHealthService.js"),
    import("../src/routes/sources.js")
  ])
  createApp = appModule.createApp
  createMediaRouter = mediaModule.createMediaRouter
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

  it("returns each work only once in dashboard date shelves", async () => {
    const today = new Date()
    const releaseDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-")
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "Dashboard Duplicate",
        status: "ongoing",
        heatScore: 80,
        sourceRefs: {
          create: { source: "trakt", sourceId: "dashboard-duplicate", isActive: true }
        },
        releases: {
          createMany: {
            data: [
              {
                platform: "Trakt",
                region: "US",
                releaseDate,
                releasePattern: "episode_release",
                releaseStatus: "airing_today",
                seasonNumber: 1,
                episodeNumber: 1,
                source: "trakt"
              },
              {
                platform: "Trakt",
                region: "US",
                releaseDate,
                releasePattern: "episode_release",
                releaseStatus: "airing_today",
                seasonNumber: 1,
                episodeNumber: 2,
                source: "trakt"
              }
            ]
          }
        }
      }
    })

    const response = await request(createApp()).get("/api/dashboard")
    const todayIds = response.body.today.map((release: any) => release.mediaItemId)
    const weekIds = response.body.week.map((release: any) => release.mediaItemId)

    expect(response.status).toBe(200)
    expect(todayIds.filter((id: string) => id === media.id)).toHaveLength(1)
    expect(weekIds.filter((id: string) => id === media.id)).toHaveLength(1)
  })

  it("aggregates same-day episode events in the dashboard while preserving detail history", async () => {
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "Episode Event Series",
        status: "upcoming",
        sourceRefs: {
          create: { source: "trakt", sourceId: "episode-event-series", isActive: true }
        }
      }
    })
    const eventAt = new Date("2026-07-14T06:21:55.082Z")
    const eventData = [1, 2, 3].map((episodeNumber) => ({
      mediaItemId: media.id,
      eventType: "release_announced",
      title: "定档：Episode Event Series 将于 2026-07-23 在 Unspecified 上线",
      description: "Episode Event Series 计划于 2026-07-23 在 Unspecified（GLOBAL）上线",
      source: "trakt",
      eventAt,
      payload: JSON.stringify({
        source: "trakt",
        platform: "Unspecified",
        region: "GLOBAL",
        seasonNumber: 1,
        episodeNumber,
        releaseDate: "2026-07-23",
        releaseStatus: "upcoming"
      })
    }))
    eventData.push({
      ...eventData[0],
      title: "定档：Episode Event Series 将于 2026-07-24 在 Unspecified 上线",
      description: "Episode Event Series 计划于 2026-07-24 在 Unspecified（GLOBAL）上线",
      payload: JSON.stringify({
        source: "trakt",
        platform: "Unspecified",
        region: "GLOBAL",
        seasonNumber: 1,
        episodeNumber: 4,
        releaseDate: "2026-07-24",
        releaseStatus: "upcoming"
      })
    })
    await prisma.changeEvent.createMany({ data: eventData })

    const dashboardResponse = await request(createApp()).get("/api/dashboard")
    const detailResponse = await request(createApp()).get(`/api/media/${media.id}`)
    const dashboardEvents = dashboardResponse.body.events.filter((event: any) => event.mediaItemId === media.id)

    expect(dashboardResponse.status).toBe(200)
    expect(dashboardEvents).toHaveLength(2)
    const groupedEvent = dashboardEvents.find((event: any) => event.title.includes("2026-07-23"))
    expect(groupedEvent).toMatchObject({
      title: "定档：Episode Event Series 第 1 季共 3 集 将于 2026-07-23 在 Unspecified 上线",
      description: "Episode Event Series 第 1 季共 3 集 计划于 2026-07-23 在 Unspecified（GLOBAL）上线"
    })
    expect(JSON.parse(groupedEvent.payload)).toMatchObject({
      seasonNumber: 1,
      episodeNumber: null,
      episodeNumbers: [1, 2, 3],
      episodeCount: 3
    })
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body.changeEvents).toHaveLength(4)
  })

  it("returns poster coverage and persistent health status", async () => {
    const response = await request(createApp()).get("/api/poster-health")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      total: 4,
      withPoster: 0,
      missing: 4,
      coveragePercent: 0,
      missingBySource: expect.any(Array),
      statuses: {
        unverified: 0,
        healthy: 0,
        degraded: 0,
        broken: 0
      },
      lookup: {
        notAttempted: 4,
        cooldown: 0,
        retryEligible: 0,
        retryAfterDays: 3
      },
      replacement: {
        notAttempted: 0,
        cooldown: 0,
        retryEligible: 0,
        retryAfterDays: 3
      },
      cache: expect.objectContaining({
        entries: expect.any(Number),
        bytes: expect.any(Number)
      })
    })
  })

  it("filters media by mediaType", async () => {
    const response = await request(createApp()).get("/api/media?mediaType=movie")

    expect(response.status).toBe(200)
    expect(response.body.items.every((item: any) => item.mediaType === "movie")).toBe(true)
    expect(response.body.items[0].dataSources).toEqual(expect.arrayContaining(["demo", "demo_trending"]))
  })

  it("searches media by title aliases and source names", async () => {
    const byAlias = await request(createApp()).get("/api/media?q=Echoes%20Beyond")
    const bySource = await request(createApp()).get("/api/media?q=demo_trending")

    expect(byAlias.status).toBe(200)
    expect(byAlias.body.items.map((item: any) => item.titleDisplay)).toEqual(["星际回声"])
    expect(bySource.status).toBe(200)
    expect(bySource.body.items.map((item: any) => item.titleDisplay)).toContain("星际回声")
  })

  it("keeps inactive history out of current views while preserving direct detail", async () => {
    const today = new Date()
    const releaseDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-")
    const archived = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "theatrical_movie",
        titleDisplay: "Archived Ghost",
        status: "released",
        heatScore: 100,
        sourceRefs: {
          create: { source: "douban", sourceId: "archived-ghost", isActive: false }
        },
        releases: {
          create: {
            platform: "Douban",
            region: "CN",
            releaseDate,
            releasePattern: "theatrical_coming_soon",
            releaseStatus: "available",
            source: "douban"
          }
        },
        popularitySignals: {
          create: {
            source: "archive_signal",
            sourceCategory: "historical",
            window: "daily",
            rank: 1,
            isCurrent: true
          }
        }
      }
    })
    const app = createApp()

    const [media, dashboard, calendar, trending, preview, detail] = await Promise.all([
      request(app).get("/api/media?q=Archived%20Ghost"),
      request(app).get("/api/dashboard"),
      request(app).get(`/api/calendar?from=${releaseDate}&to=${releaseDate}`),
      request(app).get("/api/trending?source=archive_signal"),
      request(app).get("/api/preview"),
      request(app).get(`/api/media/${archived.id}`)
    ])

    expect(media.body.items).toEqual([])
    expect(dashboard.body.today.map((item: any) => item.mediaItemId)).not.toContain(archived.id)
    expect(dashboard.body.week.map((item: any) => item.mediaItemId)).not.toContain(archived.id)
    expect(dashboard.body.trending.map((item: any) => item.id)).not.toContain(archived.id)
    expect(dashboard.body.featured.map((item: any) => item.id)).not.toContain(archived.id)
    expect(calendar.body.items.map((item: any) => item.mediaItemId)).not.toContain(archived.id)
    expect(trending.body.items).toEqual([])
    expect(preview.body.days.flatMap((day: any) => day.items).map((item: any) => item.mediaItemId)).not.toContain(archived.id)
    expect(detail.status).toBe(200)
    expect(detail.body.id).toBe(archived.id)
  })

  it("proxies stored media posters through the backend", async () => {
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "streaming_movie",
        titleDisplay: "Poster Sample",
        titleOriginal: "Poster Sample",
        posterUrl: "https://img.example.test/poster.jpg",
        firstReleaseDate: "2026-07-08",
        status: "released",
        sourceContentType: "movie"
      }
    })
    const posterService = {
      getPoster: vi.fn(async () => ({
        body: Buffer.from("poster-bytes"),
        contentType: "image/png",
        width: 640,
        height: 960,
        cacheHit: true,
        cacheStatus: "hit" as const
      }))
    }

    const response = await request(createApp({
      mediaRouter: createMediaRouter({
        database: prisma,
        posterService
      })
    })).get(`/api/media/${media.id}/poster`)

    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toContain("image/png")
    expect(response.headers["x-poster-cache"]).toBe("hit")
    expect(response.body.toString()).toBe("poster-bytes")
    expect(posterService.getPoster).toHaveBeenCalledWith("https://img.example.test/poster.jpg")
    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({
      posterStatus: "healthy",
      posterFailureCount: 0,
      posterFailureReason: null
    })
  })

  it("returns a requested responsive poster variant", async () => {
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "streaming_movie",
        titleDisplay: "Variant Poster",
        posterUrl: "https://img.example.test/variant.jpg",
        status: "released"
      }
    })
    const posterService = {
      getPoster: vi.fn(async () => ({
        body: Buffer.from("original"),
        contentType: "image/jpeg",
        width: 800,
        height: 1200,
        cacheHit: true,
        cacheStatus: "hit" as const
      }))
    }
    const variantService = {
      getVariant: vi.fn(async () => ({
        body: Buffer.from("variant"),
        contentType: "image/webp",
        width: 320,
        height: 480,
        cacheStatus: "miss" as const
      }))
    }

    const response = await request(createApp({
      mediaRouter: createMediaRouter({ database: prisma, posterService, variantService })
    })).get(`/api/media/${media.id}/poster?width=320`)

    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toContain("image/webp")
    expect(response.headers["x-poster-cache"]).toBe("hit")
    expect(response.headers["x-poster-variant-cache"]).toBe("miss")
    expect(response.headers["x-poster-width"]).toBe("320")
    expect(response.body.toString()).toBe("variant")
    expect(variantService.getVariant).toHaveBeenCalledWith(
      "https://img.example.test/variant.jpg",
      expect.objectContaining({ body: Buffer.from("original") }),
      320
    )
  })

  it("rejects unsupported responsive poster widths", async () => {
    const response = await request(createApp()).get("/api/media/any-id/poster?width=500")

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: "invalid_poster_width",
      allowedWidths: [160, 320, 640, 960]
    })
  })

  it("marks repeatedly unavailable posters as broken across retry windows", async () => {
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "streaming_movie",
        titleDisplay: "Broken Poster",
        posterUrl: "https://img.example.test/broken.jpg",
        status: "released"
      }
    })
    const posterService = {
      getPoster: vi.fn(async () => {
        throw new Error("upstream unavailable")
      })
    }
    const app = createApp({
      mediaRouter: createMediaRouter({ database: prisma, posterService })
    })

    expect((await request(app).get(`/api/media/${media.id}/poster`)).status).toBe(502)
    await prisma.mediaItem.update({
      where: { id: media.id },
      data: { posterCheckedAt: new Date(Date.now() - 61_000) }
    })
    expect((await request(app).get(`/api/media/${media.id}/poster`)).status).toBe(502)

    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({
      posterStatus: "broken",
      posterFailureCount: 2,
      posterFailureReason: "upstream_unavailable"
    })
  })

  it("keeps stale cached posters available while recording degraded health", async () => {
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "Stale Poster",
        posterUrl: "https://img.example.test/stale.jpg",
        status: "ongoing"
      }
    })
    const posterService = {
      getPoster: vi.fn(async () => ({
        body: Buffer.from("stale-poster"),
        contentType: "image/jpeg",
        width: 640,
        height: 960,
        cacheHit: true,
        cacheStatus: "stale" as const
      }))
    }

    const response = await request(createApp({
      mediaRouter: createMediaRouter({ database: prisma, posterService })
    })).get(`/api/media/${media.id}/poster`)

    expect(response.status).toBe(200)
    expect(response.headers["x-poster-cache"]).toBe("stale")
    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({
      posterStatus: "degraded",
      posterFailureCount: 1,
      posterFailureReason: "stale_cache_fallback"
    })
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
    expect(Array.isArray(response.body.days)).toBe(true)
    expect(response.body.days.every((day: any) => (
      day.date >= todayDate
      && day.count > 0
      && day.items.length <= 3
    ))).toBe(true)
  })

  it("returns the complete Douban preview beyond the former 500-row cap", async () => {
    const itemCount = 501
    await prisma.mediaItem.createMany({
      data: Array.from({ length: itemCount }, (_, index) => ({
        id: `preview-media-${index}`,
        mediaType: index % 2 === 0 ? "movie" : "series",
        releaseForm: index % 2 === 0 ? "theatrical_movie" : "tv_series",
        titleDisplay: `Preview ${index}`,
        status: "upcoming"
      }))
    })
    await prisma.mediaSourceRef.createMany({
      data: Array.from({ length: itemCount }, (_, index) => ({
        mediaItemId: `preview-media-${index}`,
        source: "douban",
        sourceId: `preview-${index}`,
        isActive: true
      }))
    })
    await prisma.release.createMany({
      data: Array.from({ length: itemCount }, (_, index) => ({
        id: `preview-release-${index}`,
        mediaItemId: `preview-media-${index}`,
        platform: "豆瓣",
        region: "CN",
        releaseDate: "2099-01-01",
        releasePattern: index % 2 === 0 ? "theatrical_coming_soon" : "tv_coming_soon",
        releaseStatus: "upcoming",
        source: "douban"
      }))
    })
    await prisma.popularitySignal.create({
      data: {
        mediaItemId: "preview-media-0",
        source: "douban_upcoming_hot",
        sourceCategory: "chinese_interest",
        platform: "豆瓣",
        region: "CN",
        window: "upcoming",
        rankingScope: "movie",
        rank: 3,
        value: 220099,
        valueLabel: "豆瓣想看",
        isCurrent: true
      }
    })

    const response = await request(createApp()).get("/api/preview")

    expect(response.status).toBe(200)
    expect(response.body.summary.total).toBe(itemCount)
    expect(response.body.summary.hot).toBe(1)
    expect(response.body.days).toHaveLength(1)
    expect(response.body.days[0].items).toHaveLength(itemCount)
    expect(response.body.days[0].items[0].mediaItemId).toBe("preview-media-0")
    expect(response.body.days[0].items.find((item: any) => item.mediaItemId === "preview-media-0")).toMatchObject({
      doubanHotRank: 3,
      doubanHotKind: "movie",
      doubanWishCount: 220099
    })
  })

  it("counts unique works instead of episode rows in calendar summaries", async () => {
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        sourceContentType: "series",
        titleDisplay: "Daily Series",
        titleAliases: "[]",
        productionCountries: "[]",
        genres: "[]",
        sourceRefs: {
          create: { source: "test", sourceId: "daily-series", isActive: true }
        }
      }
    })
    await prisma.release.createMany({
      data: [1, 2, 3].map((episodeNumber) => ({
        mediaItemId: media.id,
        platform: "Network",
        region: "US",
        releaseDate: "2099-01-01",
        releasePattern: "episode_release",
        releaseStatus: "upcoming",
        seasonNumber: 1,
        episodeNumber,
        source: "test"
      }))
    })

    const response = await request(createApp()).get(
      "/api/calendar?from=2099-01-01&to=2099-01-01&summary=true"
    )

    expect(response.status).toBe(200)
    expect(response.body.days).toEqual([
      expect.objectContaining({ date: "2099-01-01", count: 1 })
    ])
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
      implementationStatus: "blocked",
      supportsSync: false,
      enabled: false,
      runnable: false,
      semantics: expect.objectContaining({
        signalKinds: ["platform_catalog", "release_calendar"],
        access: "restricted_page"
      })
    })
    expect(sourcesResponse.body.items.find((source: any) => source.id === "prime_video")).toMatchObject({
      implementationStatus: "active",
      supportsSync: true,
      enabled: false,
      runnable: false,
      semantics: expect.objectContaining({
        signalKinds: ["platform_catalog", "release_calendar"]
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
        { ...baseSignal, source: "movement_new", rankingScope: "movie", rank: 8, previousRank: null, rankDelta: null },
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
        `/api/trending?movement=${movement}&source=${source}&platform=TMDb&region=GLOBAL${source === "movement_new" ? "&rankingScope=movie" : ""}`
      )
      expect(response.status).toBe(200)
      expect(response.body.items).toHaveLength(1)
      expect(response.body.items[0]).toMatchObject({ source, isCurrent: true })
    }
  })

  it("returns default trending works by work heat with all current signals", async () => {
    const hotMedia = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "theatrical_movie",
        titleDisplay: "综合高热作品",
        heatScore: 1000,
        sourceRefs: {
          create: { source: "tmdb", sourceId: "tmdb:movie:composite-hot" }
        },
        popularitySignals: {
          create: [
            {
              source: "tmdb_trending",
              sourceCategory: "metadata_community",
              platform: "TMDb",
              region: "GLOBAL",
              window: "week",
              rank: 40
            },
            {
              source: "trakt_trending",
              sourceCategory: "metadata_community",
              platform: "Trakt",
              region: "GLOBAL",
              window: "current",
              rankingScope: "movie",
              rank: 25
            }
          ]
        }
      }
    })
    await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "theatrical_movie",
        titleDisplay: "单榜第一作品",
        heatScore: 1,
        sourceRefs: {
          create: { source: "tmdb", sourceId: "tmdb:movie:single-rank-one" }
        },
        popularitySignals: {
          create: {
            source: "tmdb_trending",
            sourceCategory: "metadata_community",
            platform: "TMDb",
            region: "GLOBAL",
            window: "week",
            rank: 1
          }
        }
      }
    })

    const response = await request(createApp()).get("/api/trending")
    const hotSignals = response.body.items.filter((item: any) => item.mediaItemId === hotMedia.id)

    expect(response.status).toBe(200)
    expect(response.body.items[0].mediaItemId).toBe(hotMedia.id)
    expect(hotSignals).toHaveLength(2)
    expect(hotSignals.map((signal: any) => signal.source)).toEqual([
      "trakt_trending",
      "tmdb_trending"
    ])
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
