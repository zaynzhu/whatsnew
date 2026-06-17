import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: { name: "test-db" },
  demoSeedAdapter: { source: "demo" },
  tvmazeAdapter: { source: "tvmaze" },
  tmdbAdapter: { source: "tmdb" },
  youkuAdapter: { source: "youku" },
  iqiyiAdapter: { source: "iqiyi" },
  env: { SYNC_ON_START: false },
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

vi.mock("../src/adapters/demoSeedAdapter.js", () => ({
  demoSeedAdapter: mocks.demoSeedAdapter
}))

vi.mock("../src/adapters/tvmazeAdapter.js", () => ({
  tvmazeAdapter: mocks.tvmazeAdapter
}))

vi.mock("../src/adapters/tmdbAdapter.js", () => ({
  tmdbAdapter: mocks.tmdbAdapter
}))

vi.mock("../src/adapters/youkuAdapter.js", () => ({
  youkuAdapter: mocks.youkuAdapter
}))

vi.mock("../src/adapters/iqiyiAdapter.js", () => ({
  iqiyiAdapter: mocks.iqiyiAdapter
}))

vi.mock("../src/services/sourceSyncService.js", () => ({
  runSourceSync: mocks.runSourceSync
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.env.SYNC_ON_START = false
})

describe("scheduler", () => {
  it("registers an hourly sync job for enabled sources", async () => {
    const { registerScheduler } = await import("../src/scheduler.js")

    registerScheduler()

    expect(mocks.schedule).toHaveBeenCalledWith("0 * * * *", expect.any(Function))

    const scheduledJob = mocks.schedule.mock.calls[0][1] as () => Promise<void>
    await scheduledJob()

    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.demoSeedAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tvmazeAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tmdbAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.youkuAdapter)
    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.iqiyiAdapter)
  })

  it("runs initial sync when configured", async () => {
    mocks.env.SYNC_ON_START = true
    const { registerScheduler } = await import("../src/scheduler.js")

    registerScheduler()
    await vi.waitFor(() => {
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.demoSeedAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tvmazeAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tmdbAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.youkuAdapter)
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.iqiyiAdapter)
    })
  })
})
