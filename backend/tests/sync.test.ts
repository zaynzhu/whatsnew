import { PrismaClient } from "@prisma/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter.js"
import type { SourceAdapter } from "../src/domain/types.js"
import { PopularitySnapshotService } from "../src/services/popularitySnapshotService.js"
import { runSourceSync } from "../src/services/sourceSyncService.js"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"

const prisma: PrismaClient = testPrisma

beforeEach(async () => {
  await resetTestDatabase()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function adapterWithRank(rank: number | null): SourceAdapter {
  return {
    source: "history_test",
    async fetchItems() {
      const [item] = await demoSeedAdapter.fetchItems()
      return [{
        ...item,
        media: {
          ...item.media,
          source: "history_test"
        },
        releases: item.releases.map((release) => ({
          ...release,
          source: "history_test"
        })),
        popularitySignals: [{
          ...item.popularitySignals[0],
          source: "history_test_rank",
          rank
        }]
      }]
    }
  }
}

function adapterWithoutSignals(): SourceAdapter {
  return {
    source: "metadata_only",
    async fetchItems() {
      const [item] = await demoSeedAdapter.fetchItems()
      return [{
        ...item,
        media: {
          ...item.media,
          source: "metadata_only"
        },
        releases: [],
        popularitySignals: []
      }]
    }
  }
}

describe("runSourceSync", () => {
  it("persists demo media, releases, popularity signals, source run, and events", async () => {
    const result = await runSourceSync(prisma, demoSeedAdapter)

    expect(result.status).toBe("success")
    expect(result.itemCount).toBeGreaterThan(0)

    const mediaCount = await prisma.mediaItem.count()
    const releaseCount = await prisma.release.count()
    const popularityCount = await prisma.popularitySignal.count()
    const eventCount = await prisma.changeEvent.count()
    const runCount = await prisma.sourceSyncRun.count()

    expect(mediaCount).toBeGreaterThanOrEqual(4)
    expect(releaseCount).toBeGreaterThanOrEqual(4)
    expect(popularityCount).toBeGreaterThanOrEqual(4)
    expect(eventCount).toBeGreaterThanOrEqual(4)
    expect(runCount).toBe(1)
  })

  it("keeps release rows idempotent and appends popularity history", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-06-20T00:00:00Z"))
    await runSourceSync(prisma, adapterWithRank(12))
    vi.setSystemTime(new Date("2026-06-21T00:00:00Z"))
    await runSourceSync(prisma, adapterWithRank(7))

    const signals = await prisma.popularitySignal.findMany({
      orderBy: { capturedAt: "asc" }
    })
    expect(await prisma.mediaItem.count()).toBe(1)
    expect(await prisma.release.count()).toBe(1)
    expect(signals).toHaveLength(2)
    expect(signals.map((signal) => signal.isCurrent)).toEqual([false, true])
    expect(signals[1].previousRank).toBe(12)
    expect(signals[1].rankDelta).toBe(5)
    expect(await prisma.sourceSyncRun.count()).toBe(2)
  }, 15000)

  it("preserves heat when a matching source has no popularity signals", async () => {
    await runSourceSync(prisma, adapterWithRank(3))
    const before = await prisma.mediaItem.findFirstOrThrow()

    await runSourceSync(prisma, adapterWithoutSignals())
    const after = await prisma.mediaItem.findUniqueOrThrow({
      where: { id: before.id }
    })

    expect(before.heatScore).toBe(98)
    expect(after.heatScore).toBe(98)
  })

  it("returns warning without rolling back data when retention fails", async () => {
    vi.spyOn(PopularitySnapshotService.prototype, "pruneHistory").mockRejectedValueOnce(
      new Error("cleanup failed for https://example.test?api_key=secret-key")
    )

    const result = await runSourceSync(prisma, adapterWithRank(5))

    expect(result.status).toBe("warning")
    expect(result.errorMessage).toContain("api_key=[REDACTED]")
    expect(result.errorMessage).not.toContain("secret-key")
    expect(await prisma.mediaItem.count()).toBe(1)
    expect(await prisma.popularitySignal.count()).toBe(1)
  })

  it("loads matching candidates only once per source sync", async () => {
    const queryPrisma = new PrismaClient({
      log: [{ emit: "event", level: "query" }]
    })
    let candidateQueryCount = 0

    queryPrisma.$on("query", (event) => {
      if (event.query.startsWith("SELECT") && event.query.includes("MediaItem") && event.query.includes("WHERE 1=1")) {
        candidateQueryCount += 1
      }
    })

    await runSourceSync(queryPrisma, demoSeedAdapter)
    await queryPrisma.$disconnect()

    expect(candidateQueryCount).toBe(1)
  })

  it("redacts API keys from failed source sync error messages", async () => {
    const result = await runSourceSync(prisma, {
      source: "broken",
      async fetchItems() {
        throw new Error("HTTP 401 for https://api.example.test/movie?api_key=secret-key&language=zh-CN")
      }
    })

    expect(result.status).toBe("failed")
    expect(result.errorMessage).toContain("api_key=[REDACTED]")
    expect(result.errorMessage).not.toContain("secret-key")
  })
})
