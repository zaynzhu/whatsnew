import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: { name: "test-db" },
  tvmazeAdapter: { source: "tvmaze" },
  tmdbAdapter: { source: "tmdb" },
  traktPopularityAdapter: { source: "trakt", scope: "popularity" },
  traktCalendarAdapter: { source: "trakt", scope: "calendar" },
  youkuAdapter: { source: "youku" },
  iqiyiAdapter: { source: "iqiyi" },
  netflixAdapter: { source: "netflix" },
  env: { SYNC_ON_START: false },
  settings: { sourceRunnable: vi.fn((_sourceId: string) => true) },
  runSourceSync: vi.fn(async () => ({ status: "success" })),
  schedule: vi.fn()
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

vi.mock("../src/adapters/youkuAdapter.js", () => ({
  youkuAdapter: mocks.youkuAdapter
}))

vi.mock("../src/adapters/iqiyiAdapter.js", () => ({
  iqiyiAdapter: mocks.iqiyiAdapter
}))

vi.mock("../src/adapters/netflixTop10Adapter.js", () => ({
  netflixTop10Adapter: mocks.netflixAdapter
}))

vi.mock("../src/services/sourceSyncService.js", () => ({
  runSourceSync: mocks.runSourceSync
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.env.SYNC_ON_START = false
  mocks.settings.sourceRunnable.mockImplementation((_sourceId: string) => true)
})

describe("scheduler", () => {
  it("resolves enabled adapters at execution time", async () => {
    mocks.settings.sourceRunnable.mockImplementation((sourceId: string) => sourceId !== "tmdb")
    const { registerScheduler } = await import("../src/scheduler.js")

    registerScheduler()
    expect(mocks.schedule).toHaveBeenCalledWith("0 * * * *", expect.any(Function))
    const scheduledJob = mocks.schedule.mock.calls.find((call) => {
      return call[0] === "0 * * * *"
    })?.[1] as () => Promise<void>
    await scheduledJob()

    expect(mocks.runSourceSync).not.toHaveBeenCalledWith(mocks.db, mocks.tmdbAdapter)
    expect(mocks.runSourceSync).not.toHaveBeenCalledWith(mocks.db, mocks.netflixAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tvmazeAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.traktPopularityAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledTimes(4)

    mocks.runSourceSync.mockClear()
    mocks.settings.sourceRunnable.mockReturnValue(true)
    await scheduledJob()

    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tmdbAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledTimes(5)
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

    expect(mocks.runSourceSync).toHaveBeenCalledTimes(2)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.netflixAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.traktCalendarAdapter)

    mocks.runSourceSync.mockClear()
    mocks.settings.sourceRunnable.mockImplementation((sourceId: string) => sourceId !== "netflix")
    await dailyJob()
    expect(mocks.runSourceSync).toHaveBeenCalledTimes(1)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.traktCalendarAdapter)
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
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.youkuAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.netflixAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledTimes(6)
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
      { sourceId: "netflix", scheduleGroup: "daily" },
      { sourceId: "youku", scheduleGroup: "hourly" },
      { sourceId: "iqiyi", scheduleGroup: "hourly" }
    ])
    expect(getImplementedAdaptersForSource("tmdb")).toHaveLength(1)
    expect(getImplementedAdaptersForSource("trakt")).toHaveLength(2)

    mocks.settings.sourceRunnable.mockImplementation((sourceId: string) => sourceId !== "tmdb")
    expect(getEnabledAdaptersForSource("tmdb")).toEqual([])
  })
})
