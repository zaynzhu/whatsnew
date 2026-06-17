import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: { name: "test-db" },
  demoSeedAdapter: { source: "demo" },
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

vi.mock("../src/services/sourceSyncService.js", () => ({
  runSourceSync: mocks.runSourceSync
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.env.SYNC_ON_START = false
})

describe("scheduler", () => {
  it("registers an hourly demo sync job", async () => {
    const { registerScheduler } = await import("../src/scheduler.js")

    registerScheduler()

    expect(mocks.schedule).toHaveBeenCalledWith("0 * * * *", expect.any(Function))

    const scheduledJob = mocks.schedule.mock.calls[0][1] as () => Promise<void>
    await scheduledJob()

    expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.demoSeedAdapter)
  })

  it("runs initial sync when configured", async () => {
    mocks.env.SYNC_ON_START = true
    const { registerScheduler } = await import("../src/scheduler.js")

    registerScheduler()
    await vi.waitFor(() => {
      expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.demoSeedAdapter)
    })
  })
})
