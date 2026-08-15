import { PrismaClient } from "@prisma/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter.js"
import type { SourceAdapter, SourceFetchBatch } from "../src/domain/types.js"
import { PopularitySnapshotService } from "../src/services/popularitySnapshotService.js"
import { recoverInterruptedSourceRuns, runSourceSync } from "../src/services/sourceSyncService.js"
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

function adapterWithLongTitleAliases(): SourceAdapter {
  return {
    source: "alias_overflow",
    async fetchItems() {
      const [base] = await demoSeedAdapter.fetchItems()

      return [{
        ...base,
        media: {
          ...base.media,
          source: "alias_overflow",
          sourceId: "alias-overflow-1",
          titleDisplay: "Alias Overflow",
          titleOriginal: null,
          titleAliases: [
            "Short alias",
            ...Array.from({ length: 20 }, (_, index) => `Alias overflow ${index} ${"long-title-fragment".repeat(4)}`)
          ],
          tmdbId: null,
          tvmazeId: null,
          imdbId: null,
          traktId: null,
          tvdbId: null
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

function adapterWithFutureRelease(releaseDate: string, releaseStatus = "upcoming"): SourceAdapter {
  return {
    source: "schedule_test",
    async fetchItems() {
      const [base] = await demoSeedAdapter.fetchItems()
      return [{
        ...base,
        media: {
          ...base.media,
          source: "schedule_test",
          sourceId: "stable-schedule-1",
          tmdbId: null,
          tvmazeId: null,
          imdbId: null,
          traktId: null,
          tvdbId: null
        },
        releases: [{
          platform: "hbo",
          region: "US",
          releaseDate,
          releaseTime: null,
          releasePattern: "streaming_drop",
          releaseStatus,
          seasonNumber: null,
          episodeNumber: null,
          source: "schedule_test",
          sourceUrl: "https://example.test/schedule"
        }],
        popularitySignals: []
      }]
    }
  }
}

function adapterWithPoster(posterUrl: string): SourceAdapter {
  return {
    source: "poster_test",
    async fetchItems() {
      const [base] = await demoSeedAdapter.fetchItems()
      return [{
        ...base,
        media: {
          ...base.media,
          source: "poster_test",
          sourceId: "stable-poster-1",
          posterUrl
        },
        releases: [],
        popularitySignals: []
      }]
    }
  }
}

function iqiyiAdapterWithPoster(posterUrl: string): SourceAdapter {
  return {
    source: "iqiyi",
    async fetchItems() {
      const [base] = await demoSeedAdapter.fetchItems()
      return [{
        ...base,
        media: {
          ...base.media,
          source: "iqiyi",
          sourceId: "iqiyi-stable-poster-1",
          posterUrl
        },
        releases: [],
        popularitySignals: []
      }]
    }
  }
}

function doubanAdapterWithPoster(posterUrl: string | null): SourceAdapter {
  return {
    source: "douban",
    async fetchItems() {
      const [base] = await demoSeedAdapter.fetchItems()
      return [{
        ...base,
        media: {
          ...base.media,
          source: "douban",
          sourceId: "douban-stable-poster-1",
          posterUrl
        },
        releases: [],
        popularitySignals: []
      }]
    }
  }
}

describe("runSourceSync", () => {
  it("replaces a broken poster when its source provides a different URL", async () => {
    await runSourceSync(prisma, adapterWithPoster("https://img.example.test/old.jpg"))
    const media = await prisma.mediaItem.findFirstOrThrow()
    await prisma.mediaItem.update({
      where: { id: media.id },
      data: {
        posterStatus: "broken",
        posterCheckedAt: new Date("2026-07-01T00:00:00Z"),
        posterFailureCount: 2,
        posterFailureReason: "upstream_unavailable"
      }
    })

    await runSourceSync(prisma, adapterWithPoster("https://img.example.test/new.jpg"))

    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({
      posterUrl: "https://img.example.test/new.jpg",
      posterStatus: "unverified",
      posterCheckedAt: null,
      posterFailureCount: 0,
      posterFailureReason: null
    })
  })

  it("用同一爱奇艺来源身份的高清等价地址替换已验证缩略图", async () => {
    const lowResolutionUrl = "https://pic9.iqiyipic.com/image/20260710/a_100841174_m_601_m5_141_188.jpg"
    const highResolutionUrl = "https://pic9.iqiyipic.com/image/20260713/a_100841174_m_601_m6_579_772.jpg"
    await runSourceSync(prisma, iqiyiAdapterWithPoster(lowResolutionUrl))
    const media = await prisma.mediaItem.findFirstOrThrow()
    await prisma.mediaItem.update({
      where: { id: media.id },
      data: {
        posterStatus: "healthy",
        posterCheckedAt: new Date("2026-07-13T00:00:00Z"),
        posterWidth: 141,
        posterHeight: 188,
        posterQuality: "undersized"
      }
    })

    await runSourceSync(prisma, iqiyiAdapterWithPoster(highResolutionUrl))

    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({
      posterUrl: highResolutionUrl,
      posterStatus: "unverified",
      posterCheckedAt: null,
      posterWidth: null,
      posterHeight: null,
      posterQuality: "unknown"
    })
  })

  it("用同一豆瓣来源身份的高清等价地址替换已验证缩略图", async () => {
    const lowResolutionUrl = "https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2578474613.jpg"
    const highResolutionUrl = "https://img3.doubanio.com/view/photo/l_ratio_poster/public/p2578474613.jpg"
    await runSourceSync(prisma, doubanAdapterWithPoster(lowResolutionUrl))
    const media = await prisma.mediaItem.findFirstOrThrow()
    await prisma.mediaItem.update({
      where: { id: media.id },
      data: {
        posterStatus: "healthy",
        posterCheckedAt: new Date("2026-07-13T00:00:00Z"),
        posterWidth: 270,
        posterHeight: 378,
        posterQuality: "undersized"
      }
    })

    await runSourceSync(prisma, doubanAdapterWithPoster(
      "https://img3.doubanio.com/view/photo/l_ratio_poster/public/p9999999999.jpg"
    ))
    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({
      posterUrl: lowResolutionUrl,
      posterStatus: "healthy",
      posterWidth: 270,
      posterHeight: 378,
      posterQuality: "undersized"
    })

    await runSourceSync(prisma, doubanAdapterWithPoster(highResolutionUrl))

    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({
      posterUrl: highResolutionUrl,
      posterStatus: "unverified",
      posterCheckedAt: null,
      posterWidth: null,
      posterHeight: null,
      posterQuality: "unknown"
    })
  })

  it("把同一豆瓣来源身份的通用占位图恢复为缺图状态", async () => {
    const placeholderUrl = "https://img2.doubanio.com/f/frodo/hash/pics/subject/tv_large.jpg"
    await runSourceSync(prisma, doubanAdapterWithPoster(placeholderUrl))
    const media = await prisma.mediaItem.findFirstOrThrow()
    await prisma.mediaItem.update({
      where: { id: media.id },
      data: {
        posterStatus: "healthy",
        posterCheckedAt: new Date("2026-07-13T00:00:00Z"),
        posterWidth: 540,
        posterHeight: 756,
        posterQuality: "adequate",
        posterLookupAttemptedAt: new Date("2026-07-12T00:00:00Z")
      }
    })

    await runSourceSync(prisma, doubanAdapterWithPoster(null))

    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({
      posterUrl: null,
      posterLookupAttemptedAt: null,
      posterStatus: "unverified",
      posterCheckedAt: null,
      posterWidth: null,
      posterHeight: null,
      posterQuality: "unknown"
    })
  })

  it("marks interrupted running source runs as failed on recovery", async () => {
    const now = new Date("2026-07-01T12:20:00Z")
    const interrupted = await prisma.sourceSyncRun.create({
      data: {
        source: "hulu",
        scope: "all",
        status: "running",
        startedAt: new Date("2026-07-01T12:09:00Z")
      }
    })
    const completed = await prisma.sourceSyncRun.create({
      data: {
        source: "trakt",
        scope: "calendar",
        status: "success",
        startedAt: new Date("2026-07-01T12:05:00Z"),
        finishedAt: new Date("2026-07-01T12:06:00Z"),
        durationMs: 60000,
        itemCount: 151
      }
    })

    const count = await recoverInterruptedSourceRuns(prisma, now)

    expect(count).toBe(1)
    await expect(prisma.sourceSyncRun.findUniqueOrThrow({
      where: { id: interrupted.id }
    })).resolves.toMatchObject({
      status: "failed",
      finishedAt: now,
      durationMs: 660000,
      errorMessage: "同步进程中断，已自动收尾；请重新触发同步"
    })
    await expect(prisma.sourceSyncRun.findUniqueOrThrow({
      where: { id: completed.id }
    })).resolves.toMatchObject({
      status: "success",
      finishedAt: new Date("2026-07-01T12:06:00Z"),
      itemCount: 151
    })
  })

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

  it("fails a source run when its total timeout expires", async () => {
    const adapter: SourceAdapter = {
      source: "timeout_source",
      async fetchItems() {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return []
      }
    }

    const run = await runSourceSync(prisma, adapter, { timeoutMs: 10 })

    expect(run).toMatchObject({
      status: "failed",
      itemCount: 0
    })
    expect(run.finishedAt).not.toBeNull()
    expect(run.errorMessage).toContain("来源同步超过总时限")
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

  it("keeps title aliases within the database storage limit", async () => {
    const result = await runSourceSync(prisma, adapterWithLongTitleAliases())

    expect(result.status).toBe("success")
    const item = await prisma.mediaItem.findFirstOrThrow()
    const aliases = JSON.parse(item.titleAliases) as string[]
    expect(item.titleAliases.length).toBeLessThanOrEqual(191)
    expect(aliases).toContain("Short alias")
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

  it("写入前按日期规范排期状态", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-13T08:00:00+08:00"))

    await runSourceSync(prisma, adapterWithFutureRelease("2026-07-12", "upcoming"))
    await expect(prisma.release.findFirstOrThrow()).resolves.toMatchObject({
      releaseDate: "2026-07-12",
      releaseStatus: "available"
    })

    await runSourceSync(prisma, adapterWithFutureRelease("2026-07-13", "upcoming"))
    await expect(prisma.release.findFirstOrThrow()).resolves.toMatchObject({
      releaseDate: "2026-07-13",
      releaseStatus: "airing_today"
    })

    await runSourceSync(prisma, adapterWithFutureRelease("2026-07-20", "available"))
    await expect(prisma.release.findFirstOrThrow()).resolves.toMatchObject({
      releaseDate: "2026-07-20",
      releaseStatus: "upcoming"
    })
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

  it("retires source refs missing from an explicitly complete media snapshot", async () => {
    const [base] = await demoSeedAdapter.fetchItems()
    await runSourceSync(prisma, {
      source: "platform_snapshot",
      async fetchItems() {
        return {
          items: [
            { ...base, media: { ...base.media, source: "platform_snapshot", sourceId: "keep" } },
            { ...base, media: { ...base.media, source: "platform_snapshot", sourceId: "retire", titleDisplay: "Retire" } }
          ],
          completeMediaSources: ["platform_snapshot"]
        }
      }
    })

    await runSourceSync(prisma, {
      source: "platform_snapshot",
      async fetchItems() {
        return {
          items: [{ ...base, media: { ...base.media, source: "platform_snapshot", sourceId: "keep" } }],
          completeMediaSources: ["platform_snapshot"]
        }
      }
    })

    const refs = await prisma.mediaSourceRef.findMany({
      where: { source: "platform_snapshot" },
      orderBy: { sourceId: "asc" }
    })
    expect(refs.map((ref) => ({ sourceId: ref.sourceId, isActive: ref.isActive }))).toEqual([
      { sourceId: "keep", isActive: true },
      { sourceId: "retire", isActive: false }
    ])
  })

  it("adopts cleaned platform titles only for source-owned records without external identity", async () => {
    const [base] = await demoSeedAdapter.fetchItems()
    const dirtyItem = {
      ...base,
      media: {
        ...base.media,
        source: "hulu",
        sourceId: "hulu-dirty",
        mediaType: "series" as const,
        releaseForm: "tv_series" as const,
        titleDisplay: "The Bear: Complete Season 5",
        titleAliases: [],
        firstReleaseDate: "2026-07-01",
        tmdbId: null,
        tvmazeId: null,
        imdbId: null,
        traktId: null,
        tvdbId: null
      },
      releases: [{
        ...base.releases[0],
        source: "hulu",
        platform: "Hulu",
        releaseDate: "2026-07-01",
        releasePattern: "platform_schedule"
      }]
    }
    await runSourceSync(prisma, { source: "hulu", async fetchItems() { return [dirtyItem] } })

    const cleanItem = {
      ...dirtyItem,
      media: {
        ...dirtyItem.media,
        sourceId: "hulu-clean",
        titleDisplay: "The Bear",
        titleAliases: ["The Bear: Complete Season 5"],
        firstReleaseDate: null
      },
      releases: [{ ...dirtyItem.releases[0], releasePattern: "catalog_addition" }]
    }
    await runSourceSync(prisma, {
      source: "hulu",
      async fetchItems() {
        return { items: [cleanItem], completeMediaSources: ["hulu"], completeReleaseSources: ["hulu"] }
      }
    })

    const media = await prisma.mediaItem.findFirstOrThrow({
      where: { sourceRefs: { some: { source: "hulu", sourceId: "hulu-clean" } } },
      include: { sourceRefs: { where: { source: "hulu" }, orderBy: { sourceId: "asc" } } }
    })
    expect(media).toMatchObject({ titleDisplay: "The Bear", firstReleaseDate: null })
    expect(media.sourceRefs.map((ref) => ({ sourceId: ref.sourceId, isActive: ref.isActive }))).toEqual([
      { sourceId: "hulu-clean", isActive: true },
      { sourceId: "hulu-dirty", isActive: false }
    ])
  })

  it("clears legacy inferred language on a source-owned platform record", async () => {
    const [base] = await demoSeedAdapter.fetchItems()
    const platformItem = {
      ...base,
      media: {
        ...base.media,
        source: "hulu",
        sourceId: "hulu-language",
        tmdbId: null,
        tvmazeId: null,
        imdbId: null,
        traktId: null,
        tvdbId: null,
        originalLanguage: "en"
      },
      popularitySignals: []
    }
    await runSourceSync(prisma, { source: "hulu", async fetchItems() { return [platformItem] } })
    await runSourceSync(prisma, {
      source: "hulu",
      async fetchItems() {
        return [{
          ...platformItem,
          media: { ...platformItem.media, originalLanguage: null }
        }]
      }
    })

    expect(await prisma.mediaItem.findFirstOrThrow()).toMatchObject({ originalLanguage: null })
  })

  it("clears legacy inferred locale metadata on a source-owned catalog record", async () => {
    const [base] = await demoSeedAdapter.fetchItems()
    const catalogItem = {
      ...base,
      media: {
        ...base.media,
        source: "youku",
        sourceId: "youku-locale",
        tmdbId: null,
        tvmazeId: null,
        imdbId: null,
        traktId: null,
        tvdbId: null,
        productionCountries: ["CN"],
        originalLanguage: "zh"
      },
      popularitySignals: []
    }
    await runSourceSync(prisma, { source: "youku", async fetchItems() { return [catalogItem] } })
    await runSourceSync(prisma, {
      source: "youku",
      async fetchItems() {
        return [{
          ...catalogItem,
          media: {
            ...catalogItem.media,
            productionCountries: [],
            originalLanguage: null
          }
        }]
      }
    })

    expect(await prisma.mediaItem.findFirstOrThrow()).toMatchObject({
      productionCountries: "[]",
      originalLanguage: null
    })
  })

  it("adds a trusted Chinese title without replacing the canonical identity title", async () => {
    const [base] = await demoSeedAdapter.fetchItems()
    const canonical = {
      ...base,
      media: {
        ...base.media,
        source: "metadata_only",
        sourceId: "english-title",
        titleDisplay: "Echoes Beyond",
        titleOriginal: "Echoes Beyond",
        titleAliases: [],
        posterUrl: null
      },
      releases: [],
      popularitySignals: []
    }
    await runSourceSync(prisma, {
      source: "metadata_only",
      async fetchItems() { return [canonical] }
    })
    await runSourceSync(prisma, {
      source: "douban",
      async fetchItems() {
        return [{
          ...canonical,
          media: {
            ...canonical.media,
            source: "douban",
            sourceId: "douban-chinese-title",
            titleDisplay: "星际回声",
            titleAliases: ["Echoes Beyond"]
          }
        }]
      }
    })

    expect(await prisma.mediaItem.findFirstOrThrow()).toMatchObject({
      titleDisplay: "Echoes Beyond",
      titleChinese: "星际回声",
      titleChineseSource: "douban"
    })
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

  it("同一来源身份再次同步时更新作品状态", async () => {
    const [base] = await demoSeedAdapter.fetchItems()
    const adapterForStatus = (status: "upcoming" | "released"): SourceAdapter => ({
      source: "status_transition",
      async fetchItems() {
        return [{
          ...base,
          media: {
            ...base.media,
            source: "status_transition",
            sourceId: "stable-status-1",
            status,
            titleOriginal: status === "released" ? "Original Status Title" : null,
            firstReleaseDate: null,
            tmdbId: null,
            tvmazeId: null,
            imdbId: null,
            traktId: null,
            tvdbId: null
          },
          releases: [],
          popularitySignals: []
        }]
      }
    })

    await runSourceSync(prisma, adapterForStatus("upcoming"))
    await runSourceSync(prisma, adapterForStatus("released"))

    await expect(prisma.mediaItem.findFirstOrThrow()).resolves.toMatchObject({
      status: "released",
      titleOriginal: "Original Status Title"
    })
  })

  it("同一国内待播来源身份再次同步时更新来源自有日期", async () => {
    const [base] = await demoSeedAdapter.fetchItems()
    const adapterForDate = (firstReleaseDate: string): SourceAdapter => ({
      source: "douban",
      async fetchItems() {
        return [{
          ...base,
          media: {
            ...base.media,
            source: "douban",
            sourceId: "douban-date-1",
            firstReleaseDate,
            tmdbId: null,
            tvmazeId: null,
            imdbId: null,
            traktId: null,
            tvdbId: null
          },
          releases: [{
            ...base.releases[0],
            source: "douban",
            releaseDate: firstReleaseDate
          }],
          popularitySignals: []
        }]
      }
    })

    await runSourceSync(prisma, adapterForDate("2026-08-20"))
    await runSourceSync(prisma, adapterForDate("2026-08-03"))

    await expect(prisma.mediaItem.findFirstOrThrow()).resolves.toMatchObject({
      firstReleaseDate: "2026-08-03"
    })
  })

  it("按首发日期阻止矛盾的作品状态写入", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-13T08:00:00+08:00"))
    const [base] = await demoSeedAdapter.fetchItems()
    const adapter: SourceAdapter = {
      source: "status_date_guard",
      async fetchItems() {
        return [
          {
            ...base,
            media: {
              ...base.media,
              source: "status_date_guard",
              sourceId: "past-upcoming",
              titleDisplay: "Past Upcoming",
              titleOriginal: "Past Upcoming",
              titleAliases: [],
              firstReleaseDate: "2026-07-12",
              status: "upcoming",
              tmdbId: null,
              tvmazeId: null,
              imdbId: null,
              traktId: null,
              tvdbId: null
            },
            releases: [],
            popularitySignals: []
          },
          {
            ...base,
            media: {
              ...base.media,
              source: "status_date_guard",
              sourceId: "future-released",
              titleDisplay: "Future Released",
              titleOriginal: "Future Released",
              titleAliases: [],
              firstReleaseDate: "2026-07-20",
              status: "released",
              tmdbId: null,
              tvmazeId: null,
              imdbId: null,
              traktId: null,
              tvdbId: null
            },
            releases: [],
            popularitySignals: []
          },
          {
            ...base,
            media: {
              ...base.media,
              source: "status_date_guard",
              sourceId: "past-unknown",
              titleDisplay: "Past Unknown",
              titleOriginal: "Past Unknown",
              titleAliases: [],
              firstReleaseDate: "2026-07-11",
              status: "unknown",
              tmdbId: null,
              tvmazeId: null,
              imdbId: null,
              traktId: null,
              tvdbId: null
            },
            releases: [],
            popularitySignals: []
          }
        ]
      }
    }

    await runSourceSync(prisma, adapter)

    const rows = await prisma.mediaItem.findMany({
      orderBy: { titleDisplay: "asc" },
      select: { titleDisplay: true, status: true }
    })
    expect(rows).toEqual([
      { titleDisplay: "Future Released", status: "upcoming" },
      { titleDisplay: "Past Unknown", status: "released" },
      { titleDisplay: "Past Upcoming", status: "released" }
    ])
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

  it("records a source_failed change event when a sync fails", async () => {
    const result = await runSourceSync(prisma, {
      source: "broken",
      async fetchItems() {
        throw new Error("HTTP 503 for https://api.example.test?api_key=secret-key")
      }
    })

    expect(result.status).toBe("failed")
    const events = await prisma.changeEvent.findMany({ where: { eventType: "source_failed" } })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      mediaItemId: null,
      source: "broken"
    })
    expect(events[0].eventAt).toBeInstanceOf(Date)
    expect(events[0].description).toContain("api_key=[REDACTED]")
    expect(events[0].description).not.toContain("secret-key")
    const payload = JSON.parse(events[0].payload)
    expect(payload.runId).toBe(result.id)
    expect(payload.source).toBe("broken")
  })

  it("records a release_announced event for a new future-dated release and does not repeat", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"))

    await runSourceSync(prisma, adapterWithFutureRelease("2026-08-01"))
    const announced = await prisma.changeEvent.findMany({ where: { eventType: "release_announced" } })
    expect(announced).toHaveLength(1)
    expect(announced[0].title).toContain("2026-08-01")
    expect(announced[0].source).toBe("schedule_test")
    expect(announced[0].mediaItemId).not.toBeNull()

    // 第二次同步相同档期，槽位已存在，不再重复生成定档事件
    await runSourceSync(prisma, adapterWithFutureRelease("2026-08-01"))
    const announcedAfter = await prisma.changeEvent.findMany({ where: { eventType: "release_announced" } })
    expect(announcedAfter).toHaveLength(1)
  })

  it("records a delayed event when a release date moves later and does not repeat", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"))

    await runSourceSync(prisma, adapterWithFutureRelease("2026-08-01"))
    await runSourceSync(prisma, adapterWithFutureRelease("2026-09-01"))

    const delayed = await prisma.changeEvent.findMany({ where: { eventType: "delayed" } })
    expect(delayed).toHaveLength(1)
    expect(delayed[0].title).toContain("2026-08-01")
    expect(delayed[0].title).toContain("2026-09-01")
    expect(delayed[0].title).toContain("延后")

    const delayedPayload = JSON.parse(delayed[0].payload)
    expect(delayedPayload.previousDate).toBe("2026-08-01")
    expect(delayedPayload.releaseDate).toBe("2026-09-01")
    expect(delayedPayload.direction).toBe("延后")

    // 第三次同步档期不变，不再重复生成改档事件
    await runSourceSync(prisma, adapterWithFutureRelease("2026-09-01"))
    const delayedAfter = await prisma.changeEvent.findMany({ where: { eventType: "delayed" } })
    expect(delayedAfter).toHaveLength(1)
  })

  it("records a delayed event when a release date moves earlier", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"))

    await runSourceSync(prisma, adapterWithFutureRelease("2026-09-01"))
    await runSourceSync(prisma, adapterWithFutureRelease("2026-08-15"))

    const delayed = await prisma.changeEvent.findMany({ where: { eventType: "delayed" } })
    expect(delayed).toHaveLength(1)
    expect(delayed[0].title).toContain("提前")
    expect(delayed[0].title).toContain("2026-09-01")
    expect(delayed[0].title).toContain("2026-08-15")
    expect(JSON.parse(delayed[0].payload).direction).toBe("提前")
  })

  it("does not record release_announced for a past release date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"))

    await runSourceSync(prisma, adapterWithFutureRelease("2026-06-01"))
    const announced = await prisma.changeEvent.findMany({ where: { eventType: "release_announced" } })
    expect(announced).toHaveLength(0)
  })

  it("records an airing_today event for a new release dated today and does not repeat", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"))

    await runSourceSync(prisma, adapterWithFutureRelease("2026-07-01", "airing_today"))
    const events = await prisma.changeEvent.findMany({ where: { eventType: "airing_today" } })
    expect(events).toHaveLength(1)
    expect(events[0].title).toContain("今日播出")

    // 第二次同步 prevDate 已是今天，不再重复
    await runSourceSync(prisma, adapterWithFutureRelease("2026-07-01", "airing_today"))
    const eventsAfter = await prisma.changeEvent.findMany({ where: { eventType: "airing_today" } })
    expect(eventsAfter).toHaveLength(1)
  })

  it("records an available_now event when a today-dated release is available", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"))

    await runSourceSync(prisma, adapterWithFutureRelease("2026-07-01", "available"))
    const events = await prisma.changeEvent.findMany({ where: { eventType: "available_now" } })
    expect(events).toHaveLength(1)
    expect(events[0].title).toContain("今日上架")
  })
})
