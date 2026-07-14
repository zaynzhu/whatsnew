import type { PrismaClient } from "@prisma/client"
import { beforeEach, describe, expect, it } from "vitest"
import {
  SOURCE_HEALTH_ACCEPTANCE_STATUSES,
  SOURCE_HEALTH_REASON_CODES,
  SOURCE_HEALTH_RUN_STATUSES
} from "@whatsnew/shared/settings"
import {
  healthScopeKey,
  registeredAdapters,
  registeredHealthScopes
} from "../src/adapters/adapterRegistry.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import { createSourceHealthService } from "../src/services/sourceHealthService.js"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"

const prisma: PrismaClient = testPrisma

function settingsWith(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-source-health-env"), values)
}

describe("source health shared contract", () => {
  it("exposes stable run, acceptance and reason code enums", () => {
    expect(SOURCE_HEALTH_RUN_STATUSES).toEqual(["none", "running", "success", "warning", "failed"])
    expect(SOURCE_HEALTH_ACCEPTANCE_STATUSES).toEqual(["passed", "degraded", "failed", "blocked"])
    expect(SOURCE_HEALTH_REASON_CODES).toEqual([
      "passed",
      "disabled",
      "missing_credentials",
      "not_implemented",
      "commercial",
      "restricted",
      "never_succeeded",
      "stale_success",
      "latest_failed_no_fresh_success",
      "latest_failed_with_fresh_success",
      "latest_running_no_fresh_success",
      "latest_running_with_fresh_success",
      "latest_warning",
      "empty_result",
      "manual_cache_missing",
      "manual_cache_ready"
    ])
  })
})

describe("source health registry", () => {
  it("registers health policy per adapter scope", () => {
    const traktScopes = registeredHealthScopes
      .filter((entry) => entry.sourceId === "trakt")
      .map((entry) => ({
        key: healthScopeKey(entry),
        scheduleGroup: entry.scheduleGroup,
        staleAfterHours: entry.healthPolicy.staleAfterHours,
        signalKinds: entry.healthPolicy.expectedSignalKinds
      }))

    expect(traktScopes).toEqual([
      {
        key: "trakt:popularity",
        scheduleGroup: "hourly",
        staleAfterHours: 6,
        signalKinds: ["community_trend"]
      },
      {
        key: "trakt:calendar",
        scheduleGroup: "daily",
        staleAfterHours: 36,
        signalKinds: ["release_calendar"]
      }
    ])

    const doubanScopes = registeredHealthScopes
      .filter((entry) => entry.sourceId === "douban")
      .map((entry) => ({
        key: healthScopeKey(entry),
        signalKinds: entry.healthPolicy.expectedSignalKinds,
        sampleStrategy: entry.healthPolicy.sampleStrategy,
        sampleSources: entry.healthPolicy.sampleSources
      }))
    expect(doubanScopes).toEqual([
      {
        key: "douban:popularity",
        signalKinds: ["rating"],
        sampleStrategy: "popularity",
        sampleSources: ["douban_top"]
      },
      {
        key: "douban:upcoming",
        signalKinds: ["release_calendar"],
        sampleStrategy: "release",
        sampleSources: undefined
      }
    ])
  })

  it("keeps health scope keys unique and includes manual IMDb health", () => {
    const keys = registeredHealthScopes.map((entry) => healthScopeKey(entry))
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain("imdb:datasets_cache")
    expect(registeredHealthScopes.find((entry) => healthScopeKey(entry) === "imdb:datasets_cache")).toMatchObject({
      scheduleGroup: "manual",
      healthPolicy: {
        staleAfterHours: null,
        expectedSignalKinds: ["metadata", "rating"],
        sampleStrategy: "local_state"
      }
    })
  })

  it("keeps every runnable adapter represented in the health scopes", () => {
    const healthKeys = new Set(registeredHealthScopes.map((entry) => healthScopeKey(entry)))
    for (const adapter of registeredAdapters) {
      expect(healthKeys.has(healthScopeKey(adapter))).toBe(true)
    }
  })
})

describe("source health service", () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  it("reports passed, degraded, failed and blocked scope rows", async () => {
    const now = new Date("2026-07-08T04:00:00Z")
    await prisma.sourceSyncRun.createMany({
      data: [
        {
          source: "trakt",
          scope: "popularity",
          status: "success",
          startedAt: new Date("2026-07-08T03:00:00Z"),
          finishedAt: new Date("2026-07-08T03:02:00Z"),
          durationMs: 120000,
          itemCount: 12
        },
        {
          source: "trakt",
          scope: "calendar",
          status: "failed",
          startedAt: new Date("2026-07-08T03:30:00Z"),
          finishedAt: new Date("2026-07-08T03:31:00Z"),
          durationMs: 60000,
          itemCount: 0,
          errorMessage: "fetch failed"
        },
        {
          source: "trakt",
          scope: "calendar",
          status: "success",
          startedAt: new Date("2026-07-08T02:00:00Z"),
          finishedAt: new Date("2026-07-08T02:02:00Z"),
          durationMs: 120000,
          itemCount: 9
        },
        {
          source: "hulu",
          scope: "all",
          status: "success",
          startedAt: new Date("2026-07-06T12:00:00Z"),
          finishedAt: new Date("2026-07-06T12:01:00Z"),
          durationMs: 60000,
          itemCount: 4
        }
      ]
    })

    const settings = settingsWith({
      TRAKT_CLIENT_ID: "client-id",
      SOURCE_TRAKT_ENABLED: "true",
      SOURCE_HULU_ENABLED: "true"
    })
    const service = createSourceHealthService({ database: prisma, settings })
    const response = await service.getSourceHealth(now)

    const row = (key: string) => response.items.find((item) => `${item.sourceId}:${item.scope}` === key)

    expect(row("trakt:popularity")).toMatchObject({
      runStatus: "success",
      acceptanceStatus: "passed",
      freshnessStatus: "fresh",
      reasonCode: "passed",
      itemCount: 12
    })
    expect(row("trakt:calendar")).toMatchObject({
      runStatus: "failed",
      acceptanceStatus: "degraded",
      freshnessStatus: "fresh",
      reasonCode: "latest_failed_with_fresh_success",
      itemCount: 0
    })
    expect(row("hulu:all")).toMatchObject({
      runStatus: "success",
      acceptanceStatus: "failed",
      freshnessStatus: "stale",
      reasonCode: "stale_success"
    })
    expect(row("tmdb:all")).toMatchObject({
      acceptanceStatus: "blocked",
      reasonCode: "missing_credentials"
    })
    expect(row("justwatch:coverage")).toMatchObject({
      acceptanceStatus: "blocked",
      reasonCode: "commercial"
    })
    expect(row("max:all")).toMatchObject({
      acceptanceStatus: "blocked",
      reasonCode: "restricted",
      reason: "WBD Pressroom 当前要求登录或返回 403，暂不产生新的 Max 数据"
    })
    expect(response.summary).toMatchObject({
      total: response.items.length,
      passed: 1,
      degraded: 1
    })
    expect(response.summary.failed).toBeGreaterThan(0)
    expect(response.summary.blocked).toBeGreaterThan(0)
  })

  it("returns persisted acceptance samples without calling adapters", async () => {
    const now = new Date("2026-07-08T04:00:00Z")
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "movie",
        titleDisplay: "Sample Movie",
        titleOriginal: "Sample Movie",
        firstReleaseDate: "2026-07-08",
        status: "upcoming",
        sourceContentType: "movie"
      }
    })
    await prisma.sourceSyncRun.create({
      data: {
        source: "trakt",
        scope: "popularity",
        status: "success",
        startedAt: new Date("2026-07-08T03:00:00Z"),
        finishedAt: new Date("2026-07-08T03:01:00Z"),
        itemCount: 1
      }
    })
    await prisma.popularitySignal.create({
      data: {
        mediaItemId: media.id,
        source: "trakt_trending",
        sourceCategory: "community_trend",
        platform: "Trakt",
        region: "GLOBAL",
        window: "week",
        rank: 1,
        capturedAt: new Date("2026-07-08T03:01:00Z"),
        isCurrent: true,
        sourceUrl: "https://trakt.tv/movies/sample-movie-2026"
      }
    })

    const settings = settingsWith({
      TRAKT_CLIENT_ID: "client-id",
      SOURCE_TRAKT_ENABLED: "true"
    })
    const service = createSourceHealthService({ database: prisma, settings })
    const response = await service.getSourceHealth(now)
    const row = response.items.find((item) => `${item.sourceId}:${item.scope}` === "trakt:popularity")

    expect(row?.samples).toEqual([
      {
        title: "Sample Movie",
        mediaType: "movie",
        signalKind: "community_trend",
        source: "trakt_trending",
        platform: "Trakt",
        region: "GLOBAL",
        sourceUrl: "https://trakt.tv/movies/sample-movie-2026",
        capturedAtOrFetchedAt: "2026-07-08T03:01:00.000Z"
      }
    ])
  })

  it("keeps Douban TOP250 health samples separate from upcoming signals", async () => {
    const now = new Date("2026-07-08T04:00:00Z")
    const topMedia = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "movie",
        titleDisplay: "TOP250 Movie",
        titleOriginal: "TOP250 Movie",
        status: "released",
        sourceContentType: "movie"
      }
    })
    const upcomingMedia = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "movie",
        titleDisplay: "Upcoming Movie",
        titleOriginal: "Upcoming Movie",
        status: "upcoming",
        sourceContentType: "movie"
      }
    })
    await prisma.sourceSyncRun.create({
      data: {
        source: "douban",
        scope: "popularity",
        status: "success",
        startedAt: new Date("2026-07-08T03:00:00Z"),
        finishedAt: new Date("2026-07-08T03:01:00Z"),
        itemCount: 1
      }
    })
    await prisma.popularitySignal.createMany({
      data: [
        {
          mediaItemId: topMedia.id,
          source: "douban_top",
          sourceCategory: "rating",
          platform: "Douban",
          region: "CN",
          window: "all_time",
          rank: 1,
          value: 9.7,
          capturedAt: new Date("2026-07-08T03:01:00Z"),
          isCurrent: true
        },
        {
          mediaItemId: upcomingMedia.id,
          source: "douban_upcoming",
          sourceCategory: "anticipation",
          platform: "Douban",
          region: "CN",
          window: "upcoming",
          rank: 1,
          value: 100000,
          capturedAt: new Date("2026-07-08T03:02:00Z"),
          isCurrent: true
        }
      ]
    })

    const settings = settingsWith({ SOURCE_DOUBAN_ENABLED: "true" })
    const service = createSourceHealthService({ database: prisma, settings })
    const response = await service.getSourceHealth(now)
    const row = response.items.find((item) => `${item.sourceId}:${item.scope}` === "douban:popularity")

    expect(row?.samples.map((sample) => ({ title: sample.title, source: sample.source }))).toEqual([
      { title: "TOP250 Movie", source: "douban_top" }
    ])
  })
})
