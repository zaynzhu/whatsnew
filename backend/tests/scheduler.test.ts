import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: { name: "test-db" },
  tvmazeAdapter: { source: "tvmaze" },
  tmdbAdapter: { source: "tmdb" },
  traktPopularityAdapter: { source: "trakt", scope: "popularity" },
  traktCalendarAdapter: { source: "trakt", scope: "calendar" },
  theTvdbAdapter: { source: "thetvdb", scope: "updates" },
  youkuAdapter: { source: "youku" },
  iqiyiAdapter: { source: "iqiyi" },
  tencentVideoAdapter: { source: "tencent" },
  mgtvAdapter: { source: "mgtv" },
  bilibiliAdapter: { source: "bilibili" },
  appleTvPlusAdapter: { source: "apple_tv_plus" },
  doubanTopAdapter: { source: "douban", scope: "popularity" },
  doubanUpcomingAdapter: { source: "douban", scope: "upcoming" },
  netflixAdapter: { source: "netflix" },
  primeVideoAdapter: { source: "prime_video" },
  huluAdapter: { source: "hulu" },
  disneyPlusAdapter: { source: "disney_plus" },
  maxAdapter: { source: "max" },
  env: { SYNC_ON_START: false, APP_ENVIRONMENT: "main" },
  settings: {
    get: vi.fn((_key: string, fallback = "") => fallback),
    sourceRunnable: vi.fn((_sourceId: string) => true)
  },
  runSourceSync: vi.fn(async () => ({ status: "success" })),
  reconcileMediaStatuses: vi.fn(async () => ({ scanned: 0, matched: 0, updated: 0 })),
  reconcileDuplicateTmdbIdentities: vi.fn(async () => ({ groups: 0, merged: 0 })),
  reconcileUniqueTitleIdentities: vi.fn(async () => ({ groups: 0, merged: 0 })),
  reconcileSharedDateTitles: vi.fn(async () => ({ groups: 0, merged: 0 })),
  cleanupOrphanedMedia: vi.fn(async () => ({ matched: 0, deleted: 0 })),
  enrichMissingPosters: vi.fn(async () => ({ scanned: 0, enriched: 0 })),
  verifyPosterImages: vi.fn(async () => ({ scanned: 0, healthy: 0 })),
  prunePosterVariantCache: vi.fn(async () => ({ removedEntries: 0 })),
  schedule: vi.fn((
    _expression: string,
    _callback: () => Promise<void>,
    _options?: { timezone: string }
  ) => ({ stop: vi.fn() }))
}))

vi.mock("node-cron", () => ({
  default: {
    schedule: mocks.schedule
  }
}))

vi.mock("../src/config/db.js", () => ({
  db: mocks.db
}))

vi.mock("../src/config/env.js", () => ({
  env: mocks.env
}))

vi.mock("../src/settings/runtimeSettingsService.js", () => ({
  runtimeSettings: mocks.settings
}))

vi.mock("../src/adapters/tvmazeAdapter.js", () => ({
  tvmazeAdapter: mocks.tvmazeAdapter
}))

vi.mock("../src/adapters/tmdbAdapter.js", () => ({
  tmdbAdapter: mocks.tmdbAdapter
}))

vi.mock("../src/adapters/traktAdapter.js", () => ({
  traktPopularityAdapter: mocks.traktPopularityAdapter,
  traktCalendarAdapter: mocks.traktCalendarAdapter
}))

vi.mock("../src/adapters/theTvdbAdapter.js", () => ({
  theTvdbAdapter: mocks.theTvdbAdapter
}))

vi.mock("../src/adapters/youkuAdapter.js", () => ({
  youkuAdapter: mocks.youkuAdapter
}))

vi.mock("../src/adapters/iqiyiAdapter.js", () => ({
  iqiyiAdapter: mocks.iqiyiAdapter
}))

vi.mock("../src/adapters/tencentVideoAdapter.js", () => ({
  tencentVideoAdapter: mocks.tencentVideoAdapter
}))

vi.mock("../src/adapters/mgtvAdapter.js", () => ({
  mgtvAdapter: mocks.mgtvAdapter
}))

vi.mock("../src/adapters/bilibiliAdapter.js", () => ({
  bilibiliAdapter: mocks.bilibiliAdapter
}))

vi.mock("../src/adapters/appleTvPlusAdapter.js", () => ({
  appleTvPlusAdapter: mocks.appleTvPlusAdapter
}))

vi.mock("../src/adapters/doubanAdapter.js", () => ({
  doubanTopAdapter: mocks.doubanTopAdapter,
  doubanUpcomingAdapter: mocks.doubanUpcomingAdapter
}))

vi.mock("../src/adapters/netflixTop10Adapter.js", () => ({
  netflixTop10Adapter: mocks.netflixAdapter
}))

vi.mock("../src/adapters/primeVideoAdapter.js", () => ({
  primeVideoAdapter: mocks.primeVideoAdapter
}))

vi.mock("../src/adapters/huluAdapter.js", () => ({
  huluAdapter: mocks.huluAdapter
}))

vi.mock("../src/adapters/disneyPlusAdapter.js", () => ({
  disneyPlusAdapter: mocks.disneyPlusAdapter
}))

vi.mock("../src/adapters/maxAdapter.js", () => ({
  maxAdapter: mocks.maxAdapter
}))

vi.mock("../src/services/sourceSyncService.js", () => ({
  runSourceSync: mocks.runSourceSync
}))

vi.mock("../src/services/mediaStatusReconciliationService.js", () => ({
  reconcileMediaStatuses: mocks.reconcileMediaStatuses
}))

vi.mock("../src/services/duplicateIdentityService.js", () => ({
  reconcileDuplicateTmdbIdentities: mocks.reconcileDuplicateTmdbIdentities,
  reconcileUniqueTitleIdentities: mocks.reconcileUniqueTitleIdentities,
  reconcileSharedDateTitles: mocks.reconcileSharedDateTitles
}))

vi.mock("../src/services/orphanedMediaCleanupService.js", () => ({
  cleanupOrphanedMedia: mocks.cleanupOrphanedMedia
}))

vi.mock("../src/services/tmdbPosterEnrichmentService.js", () => ({
  enrichMissingPosters: mocks.enrichMissingPosters
}))

vi.mock("../src/services/posterVerificationService.js", () => ({
  verifyPosterImages: mocks.verifyPosterImages
}))

vi.mock("../src/services/posterVariantCacheMaintenanceService.js", () => ({
  prunePosterVariantCache: mocks.prunePosterVariantCache
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.env.SYNC_ON_START = false
  mocks.settings.get.mockImplementation((_key: string, fallback = "") => fallback)
  mocks.settings.sourceRunnable.mockImplementation((_sourceId: string) => true)
})

describe("scheduler", () => {
  it("resolves enabled adapters at execution time", async () => {
    mocks.settings.sourceRunnable.mockImplementation((sourceId: string) => sourceId !== "tmdb")
    const { registerScheduler } = await import("../src/scheduler.js")

    registerScheduler()
    expect(mocks.schedule).toHaveBeenCalledWith(
      "0 * * * *",
      expect.any(Function),
      { timezone: "Asia/Shanghai" }
    )
    const scheduledJob = mocks.schedule.mock.calls.find((call) => {
      return call[0] === "0 * * * *"
    })?.[1] as () => Promise<void>
    await scheduledJob()

    expect(mocks.runSourceSync).not.toHaveBeenCalledWith(mocks.db, mocks.tmdbAdapter)
    expect(mocks.runSourceSync).not.toHaveBeenCalledWith(mocks.db, mocks.netflixAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tvmazeAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.traktPopularityAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tencentVideoAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledTimes(5)
    expect(mocks.enrichMissingPosters).not.toHaveBeenCalled()
    expect(mocks.reconcileMediaStatuses).toHaveBeenCalledWith({
      database: mocks.db,
      apply: true
    })
    expect(mocks.reconcileDuplicateTmdbIdentities).toHaveBeenCalledWith({
      database: mocks.db,
      apply: true
    })
    expect(mocks.reconcileUniqueTitleIdentities).toHaveBeenCalledWith({
      database: mocks.db,
      apply: true
    })
    expect(mocks.reconcileSharedDateTitles).toHaveBeenCalledWith({
      database: mocks.db,
      apply: true
    })
    expect(mocks.cleanupOrphanedMedia).not.toHaveBeenCalled()
    expect(mocks.verifyPosterImages).toHaveBeenCalledWith({
      database: mocks.db,
      limit: 20
    })
    expect(mocks.prunePosterVariantCache).not.toHaveBeenCalled()

    mocks.runSourceSync.mockClear()
    mocks.settings.sourceRunnable.mockReturnValue(true)
    await scheduledJob()

    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tmdbAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledTimes(6)
    expect(mocks.enrichMissingPosters).toHaveBeenCalledWith({
      database: mocks.db,
      limit: 40
    })
    expect(mocks.cleanupOrphanedMedia).not.toHaveBeenCalled()
  })

  it("runs only enabled daily adapters on the daily schedule", async () => {
    const { registerScheduler } = await import("../src/scheduler.js")

    registerScheduler()
    expect(mocks.schedule).toHaveBeenCalledWith(
      "15 9 * * *",
      expect.any(Function),
      { timezone: "Asia/Shanghai" }
    )
    const dailyJob = mocks.schedule.mock.calls.find((call) => {
      return call[0] === "15 9 * * *"
    })?.[1] as () => Promise<void>
    await dailyJob()

    expect(mocks.runSourceSync).toHaveBeenCalledTimes(11)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.netflixAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.primeVideoAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.traktCalendarAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.theTvdbAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.huluAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.disneyPlusAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.maxAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.bilibiliAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.appleTvPlusAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.doubanTopAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.doubanUpcomingAdapter)
    expect(mocks.enrichMissingPosters).toHaveBeenCalledWith({
      database: mocks.db,
      limit: 40
    })
    expect(mocks.reconcileMediaStatuses).toHaveBeenCalledWith({
      database: mocks.db,
      apply: true
    })
    expect(mocks.cleanupOrphanedMedia).toHaveBeenCalledWith({
      database: mocks.db,
      sources: ["disney_plus", "hulu", "max", "prime_video"],
      apply: true
    })
    expect(mocks.verifyPosterImages).toHaveBeenCalledWith({
      database: mocks.db,
      limit: 100
    })
    expect(mocks.prunePosterVariantCache).toHaveBeenCalledWith({ apply: true })

    mocks.runSourceSync.mockClear()
    mocks.settings.sourceRunnable.mockImplementation((sourceId: string) => {
      return !["netflix", "prime_video", "thetvdb", "hulu", "disney_plus", "max"].includes(sourceId)
    })
    await dailyJob()
    expect(mocks.runSourceSync).toHaveBeenCalledTimes(5)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.traktCalendarAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.bilibiliAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.appleTvPlusAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.doubanTopAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.doubanUpcomingAdapter)
  })

  it("re-registers future jobs when schedule settings change", async () => {
    const { refreshScheduler, registerScheduler } = await import("../src/scheduler.js")
    registerScheduler()
    const firstHourlyTask = mocks.schedule.mock.results[0]?.value as { stop: ReturnType<typeof vi.fn> }
    const firstDailyTask = mocks.schedule.mock.results[1]?.value as { stop: ReturnType<typeof vi.fn> }

    mocks.settings.get.mockImplementation((key: string, fallback = "") => {
      if (key === "SCHEDULER_HOURLY_INTERVAL_HOURS") return "3"
      if (key === "SCHEDULER_DAILY_TIME") return "06:40"
      return fallback
    })
    refreshScheduler()

    expect(firstHourlyTask.stop).toHaveBeenCalledOnce()
    expect(firstDailyTask.stop).toHaveBeenCalledOnce()
    expect(mocks.schedule).toHaveBeenCalledWith(
      "0 */3 * * *",
      expect.any(Function),
      { timezone: "Asia/Shanghai" }
    )
    expect(mocks.schedule).toHaveBeenCalledWith(
      "40 6 * * *",
      expect.any(Function),
      { timezone: "Asia/Shanghai" }
    )
  })

  it("resolves enabled adapters for initial sync", async () => {
    mocks.env.SYNC_ON_START = true
    mocks.settings.sourceRunnable.mockImplementation((sourceId: string) => sourceId !== "iqiyi")
    const { registerScheduler } = await import("../src/scheduler.js")

    registerScheduler()

    await vi.waitFor(() => {
      expect(mocks.runSourceSync).not.toHaveBeenCalledWith(mocks.db, mocks.iqiyiAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tvmazeAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tmdbAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.traktPopularityAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.traktCalendarAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.theTvdbAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.youkuAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tencentVideoAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.netflixAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.primeVideoAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.huluAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.disneyPlusAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.maxAdapter)
      expect(mocks.runSourceSync).not.toHaveBeenCalledWith(mocks.db, mocks.mgtvAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.bilibiliAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.appleTvPlusAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.doubanTopAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.doubanUpcomingAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledTimes(16)
      expect(mocks.enrichMissingPosters).toHaveBeenCalledWith({
        database: mocks.db,
        limit: 40
      })
      expect(mocks.reconcileMediaStatuses).toHaveBeenCalledWith({
        database: mocks.db,
        apply: true
      })
      expect(mocks.reconcileDuplicateTmdbIdentities).toHaveBeenCalledWith({
        database: mocks.db,
        apply: true
      })
      expect(mocks.reconcileUniqueTitleIdentities).toHaveBeenCalledWith({
        database: mocks.db,
        apply: true
      })
      expect(mocks.reconcileSharedDateTitles).toHaveBeenCalledWith({
        database: mocks.db,
        apply: true
      })
      expect(mocks.cleanupOrphanedMedia).toHaveBeenCalledWith({
        database: mocks.db,
        sources: ["disney_plus", "hulu", "max", "prime_video"],
        apply: true
      })
      expect(mocks.verifyPosterImages).toHaveBeenCalledWith({
        database: mocks.db,
        limit: 100
      })
      expect(mocks.prunePosterVariantCache).toHaveBeenCalledWith({ apply: true })
    })
  })

  it("registers adapters by source and schedule group", async () => {
    const {
      getEnabledAdaptersForSource,
      getImplementedAdaptersForSource,
      registeredAdapters
    } = await import("../src/adapters/adapterRegistry.js")

    expect(registeredAdapters.map(({ sourceId, scheduleGroup }) => ({ sourceId, scheduleGroup }))).toEqual([
      { sourceId: "tvmaze", scheduleGroup: "hourly" },
      { sourceId: "tmdb", scheduleGroup: "hourly" },
      { sourceId: "trakt", scheduleGroup: "hourly" },
      { sourceId: "trakt", scheduleGroup: "daily" },
      { sourceId: "thetvdb", scheduleGroup: "daily" },
      { sourceId: "netflix", scheduleGroup: "daily" },
      { sourceId: "prime_video", scheduleGroup: "daily" },
      { sourceId: "hulu", scheduleGroup: "daily" },
      { sourceId: "disney_plus", scheduleGroup: "daily" },
      { sourceId: "max", scheduleGroup: "daily" },
      { sourceId: "apple_tv_plus", scheduleGroup: "daily" },
      { sourceId: "youku", scheduleGroup: "hourly" },
      { sourceId: "iqiyi", scheduleGroup: "hourly" },
      { sourceId: "tencent", scheduleGroup: "hourly" },
      { sourceId: "bilibili", scheduleGroup: "daily" },
      { sourceId: "douban", scheduleGroup: "daily" },
      { sourceId: "douban", scheduleGroup: "daily" }
    ])
    expect(getImplementedAdaptersForSource("tmdb")).toHaveLength(1)
    expect(getImplementedAdaptersForSource("trakt")).toHaveLength(2)
    expect(getImplementedAdaptersForSource("douban")).toHaveLength(2)

    mocks.settings.sourceRunnable.mockImplementation((sourceId: string) => sourceId !== "tmdb")
    expect(getEnabledAdaptersForSource("tmdb")).toEqual([])
  })
})
