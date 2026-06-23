import { PrismaClient } from "@prisma/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter.js"
import type { SourceAdapter, SourceFetchBatch } from "../src/domain/types.js"
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

function adapterWithUnmatchableLanguage(titles: string[]): SourceAdapter {
  return {
    source: "source_identity_test",
    async fetchItems() {
      const [base] = await demoSeedAdapter.fetchItems()
      return titles.map((title, index) => ({
        ...base,
        media: {
          ...base.media,
          source: "source_identity_test",
          sourceId: `stable-${title}`,
          titleDisplay: title,
          titleOriginal: null,
          titleAliases: [],
          firstReleaseDate: null,
          originalLanguage: null,
          tmdbId: null,
          tvmazeId: null,
          imdbId: null
        },
        releases: [],
        popularitySignals: [{
          ...base.popularitySignals[0],
          source: "source_identity_rank",
          rank: index + 1,
          capturedAt: new Date("2026-06-21T00:00:00Z")
        }]
      }))
    }
  }
}

describe("runSourceSync", () => {
  it("serializes concurrent runs for the same source", async () => {
    let activeFetches = 0
    let maxActiveFetches = 0
    const adapter: SourceAdapter = {
      source: "concurrent_source",
      async fetchItems() {
        activeFetches += 1
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
        await new Promise((resolve) => setTimeout(resolve, 20))
        activeFetches -= 1
        const [item] = await demoSeedAdapter.fetchItems()
        return [{
          ...item,
          media: {
            ...item.media,
            source: "concurrent_source",
            sourceId: "stable-one",
            tmdbId: null,
            tvmazeId: null,
            imdbId: null
          },
          releases: [],
          popularitySignals: []
        }]
      }
    }

    await Promise.all([
      runSourceSync(prisma, adapter),
      runSourceSync(prisma, adapter)
    ])

    expect(maxActiveFetches).toBe(1)
    expect(await prisma.mediaItem.count()).toBe(1)
    expect(await prisma.mediaSourceRef.count()).toBe(1)
  })

  it("removes releases missing from a complete source snapshot", async () => {
    const [first, second] = await demoSeedAdapter.fetchItems()
    const items = [first, second].map((item, index) => ({
      ...item,
      media: {
        ...item.media,
        source: "trakt",
        sourceId: `trakt:snapshot:${index}`
      },
      releases: item.releases.map((release) => ({ ...release, source: "trakt" })),
      popularitySignals: []
    }))
    const adapter = (currentItems: typeof items): SourceAdapter<SourceFetchBatch> => ({
      source: "trakt",
      scope: "calendar",
      async fetchItems() {
        return { items: currentItems, completeReleaseSources: ["trakt"] }
      }
    })

    await runSourceSync(prisma, adapter(items))
    await runSourceSync(prisma, adapter([items[0]]))

    expect(await prisma.mediaItem.count()).toBe(2)
    expect(await prisma.release.count({ where: { source: "trakt" } })).toBe(1)
  })

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

  it("persists episode titles and sync scope", async () => {
    const adapter: SourceAdapter = {
      source: "trakt",
      scope: "calendar",
      async fetchItems() {
        const [base] = await demoSeedAdapter.fetchItems()
        return [{
          ...base,
          releases: [{
            ...base.releases[0],
            source: "trakt",
            episodeTitle: "新的开始"
          }]
        }]
      }
    }

    const run = await runSourceSync(prisma, adapter)
    expect(run.scope).toBe("calendar")
    expect((await prisma.release.findFirstOrThrow()).episodeTitle).toBe("新的开始")
  })

  it("deactivates an explicitly complete empty popularity snapshot", async () => {
    await runSourceSync(prisma, adapterWithRank(2))
    await runSourceSync(prisma, {
      source: "history_test",
      scope: "popularity",
      async fetchItems() {
        return { items: [], completePopularitySources: ["history_test_rank"] }
      }
    })

    expect(await prisma.popularitySignal.count({ where: { isCurrent: true } })).toBe(0)
    expect((await prisma.mediaItem.findFirstOrThrow()).heatScore).toBe(0)
  })

  it("retires a deleted source ref without deleting the media item", async () => {
    await runSourceSync(prisma, adapterWithoutSignals())
    await runSourceSync(prisma, {
      source: "metadata_only",
      scope: "updates",
      async fetchItems() {
        return {
          items: [],
          retiredSourceRefs: [{ source: "metadata_only", sourceId: "demo-movie-1" }]
        }
      }
    })

    expect((await prisma.mediaSourceRef.findFirstOrThrow()).isActive).toBe(false)
    expect(await prisma.mediaItem.count()).toBe(1)
  })

  it("does not create an unmatched enrichment-only item", async () => {
    const [base] = await demoSeedAdapter.fetchItems()
    await runSourceSync(prisma, {
      source: "metadata_only",
      scope: "updates",
      async fetchItems() {
        return [{ ...base, media: { ...base.media, sourceId: "old-record" }, createIfMissing: false }]
      }
    })

    expect(await prisma.mediaItem.count()).toBe(0)
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

  it("uses stable source IDs when title matching is insufficient", async () => {
    await runSourceSync(prisma, adapterWithUnmatchableLanguage(["非英语作品"]))
    await runSourceSync(prisma, adapterWithUnmatchableLanguage(["非英语作品"]))

    expect(await prisma.mediaItem.count()).toBe(1)
    expect(await prisma.popularitySignal.count()).toBe(1)
    expect(await prisma.popularitySignal.count({
      where: { isCurrent: true }
    })).toBe(1)
  })

  it("marks source signals missing from the next complete snapshot as historical", async () => {
    await runSourceSync(prisma, adapterWithUnmatchableLanguage(["作品甲", "作品乙"]))
    await runSourceSync(prisma, adapterWithUnmatchableLanguage(["作品甲"]))

    const missingMedia = await prisma.mediaItem.findFirstOrThrow({
      where: { titleDisplay: "作品乙" },
      include: { popularitySignals: true }
    })
    expect(missingMedia.popularitySignals).toHaveLength(1)
    expect(missingMedia.popularitySignals[0].isCurrent).toBe(false)
    expect(missingMedia.heatScore).toBe(0)
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
