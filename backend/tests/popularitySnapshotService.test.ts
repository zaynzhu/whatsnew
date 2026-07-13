import { beforeEach, describe, expect, it } from "vitest"
import type { PopularitySignalInput } from "../src/domain/types.js"
import {
  PopularitySnapshotService,
  type PersistSignalInput
} from "../src/services/popularitySnapshotService.js"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"

let mediaId: string
let runId: string
let service: PopularitySnapshotService

function input(
  overrides: Partial<PopularitySignalInput>,
  capturedAt: Date
): PersistSignalInput {
  return {
    mediaItemId: mediaId,
    mediaTitle: "示例剧",
    sourceSyncRunId: runId,
    capturedAt,
    signal: {
      source: "tmdb_trending",
      sourceCategory: "metadata_community",
      platform: "TMDb",
      region: "GLOBAL",
      window: "week",
      rank: null,
      rankDelta: null,
      value: null,
      valueLabel: null,
      sourceUrl: "https://example.test/source",
      ...overrides
    }
  }
}

beforeEach(async () => {
  await resetTestDatabase()

  const media = await testPrisma.mediaItem.create({
    data: {
      mediaType: "series",
      releaseForm: "series",
      titleDisplay: "示例剧"
    }
  })
  const run = await testPrisma.sourceSyncRun.create({
    data: {
      source: "tmdb",
      status: "running"
    }
  })

  mediaId = media.id
  runId = run.id
  service = new PopularitySnapshotService(testPrisma)
})

describe("PopularitySnapshotService", () => {
  it("appends history and leaves exactly one current snapshot", async () => {
    const first = await service.persistSignal(input(
      { rank: 12 },
      new Date("2026-06-20T00:00:00Z")
    ))
    const second = await service.persistSignal(input(
      { rank: 7 },
      new Date("2026-06-21T00:00:00Z")
    ))

    expect(first.rankDelta).toBeNull()
    expect(second.previousRank).toBe(12)
    expect(second.rankDelta).toBe(5)
    expect(await testPrisma.popularitySignal.count()).toBe(2)
    expect(await testPrisma.popularitySignal.count({
      where: { isCurrent: true }
    })).toBe(1)
  })

  it("updates rather than duplicates the same capturedAt", async () => {
    const capturedAt = new Date("2026-06-21T00:00:00Z")

    await service.persistSignal(input({ rank: 7, value: 100 }, capturedAt))
    await service.persistSignal(input({ rank: 7, value: 120 }, capturedAt))

    expect(await testPrisma.popularitySignal.count()).toBe(1)
    expect((await testPrisma.popularitySignal.findFirst())?.value).toBe(120)
    expect(await testPrisma.changeEvent.count()).toBe(1)
  })

  it("keeps independent chart scopes current for the same source", async () => {
    const capturedAt = new Date("2026-06-21T00:00:00Z")

    await service.persistSignal(input({
      source: "netflix_top10",
      platform: "Netflix",
      rankingScope: "films_english",
      rank: 1
    }, capturedAt))
    await service.persistSignal(input({
      source: "netflix_top10",
      platform: "Netflix",
      rankingScope: "films_non_english",
      rank: 1
    }, capturedAt))

    const signals = await testPrisma.popularitySignal.findMany({
      where: { isCurrent: true },
      orderBy: { rankingScope: "asc" }
    })
    expect(signals).toHaveLength(2)
    expect(signals.map((signal) => signal.rankingScope)).toEqual([
      "films_english",
      "films_non_english"
    ])
  })

  it("recomputes heat from every current source", async () => {
    const capturedAt = new Date("2026-06-21T00:00:00Z")

    await service.persistSignal(input({
      source: "tmdb_trending",
      platform: "TMDb",
      rank: 3
    }, capturedAt))
    await service.persistSignal(input({
      source: "iqiyi_reserve",
      platform: "iQIYI",
      region: "CN",
      rank: 20
    }, capturedAt))

    const media = await testPrisma.mediaItem.findUnique({ where: { id: mediaId } })
    expect(media?.heatScore).toBe(98)
  })

  it("preserves Douban ranks without treating them as Heat or movement events", async () => {
    const capturedAt = new Date("2026-06-21T00:00:00Z")

    await service.persistSignal(input({
      source: "douban_top",
      sourceCategory: "chinese_reputation",
      platform: "豆瓣",
      region: "CN",
      rank: 1,
      value: 9.7,
      valueLabel: "豆瓣评分"
    }, capturedAt))

    const signal = await testPrisma.popularitySignal.findFirstOrThrow()
    const media = await testPrisma.mediaItem.findUniqueOrThrow({ where: { id: mediaId } })

    expect(signal.rank).toBe(1)
    expect(media.heatScore).toBe(0)
    expect(await testPrisma.changeEvent.count()).toBe(0)
  })

  it("creates at most one event with an explainable payload", async () => {
    await service.persistSignal(input(
      { rank: 12 },
      new Date("2026-06-19T00:00:00Z")
    ))
    await service.persistSignal(input(
      { rank: 7 },
      new Date("2026-06-20T00:00:00Z")
    ))
    await service.persistSignal(input(
      { rank: 6 },
      new Date("2026-06-21T00:00:00Z")
    ))

    const events = await testPrisma.changeEvent.findMany()
    expect(events).toHaveLength(1)
    expect(events[0].eventType).toBe("heat_rising")
    expect(events[0].title).toBe("示例剧 升至第 7 名")
    expect(events[0].description).toBe("TMDb 电影趋势 · 从第 12 名上升 5 位")
    expect(JSON.parse(events[0].payload)).toEqual({
      source: "tmdb_trending",
      platform: "TMDb",
      region: "GLOBAL",
      window: "week",
      rankingScope: "overall",
      previousRank: 12,
      currentRank: 7,
      rankDelta: 5,
      capturedAt: "2026-06-20T00:00:00.000Z"
    })
  })

  it("prunes only expired non-current history from selected sources", async () => {
    await service.persistSignal(input(
      { rank: 15 },
      new Date("2026-01-01T00:00:00Z")
    ))
    await service.persistSignal(input(
      { rank: 10 },
      new Date("2026-06-21T00:00:00Z")
    ))
    await service.persistSignal(input({
      source: "iqiyi_reserve",
      platform: "iQIYI",
      region: "CN",
      rank: 5
    }, new Date("2026-01-01T00:00:00Z")))

    const deleted = await service.pruneHistory(
      ["tmdb_trending"],
      new Date("2026-03-01T00:00:00Z")
    )

    expect(deleted).toBe(1)
    expect(await testPrisma.popularitySignal.count()).toBe(2)
    expect(await testPrisma.popularitySignal.count({
      where: { isCurrent: true }
    })).toBe(2)
  })
})
