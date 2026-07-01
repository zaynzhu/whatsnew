import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBilibiliAdapter } from "../src/adapters/bilibiliAdapter.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function rankJson(seasonType: number): string {
  const seasonId = Number(seasonType) * 1000
  return JSON.stringify({
    code: 0,
    data: {
      note: `榜單数据窗口`,
      list: [
        {
          rank: 1,
          title: `剧${seasonType}`,
          season_id: seasonId,
          cover: "//i0.hdslb.com/bfs/bangumi/test.jpg",
          url: `https://www.bilibili.com/bangumi/play/ss${seasonId}`,
          rating: "9.5分",
          badge: "大会员",
          new_ep: { index_show: "更新至第10话" },
          stat: { view: 100000, follow: 5000, danmaku: 800 },
          desc: "测试剧集简介"
        }
      ]
    }
  })
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("适配器不得使用全局 fetch")
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("bilibiliAdapter", () => {
  it("fetches bangumi, guochuang and documentary rankings and maps signals", async () => {
    const fetchText = vi.fn(async (sourceId: string, url: string) => {
      expect(sourceId).toBe("bilibili")
      const match = url.match(/season_type=(\d+)/)
      return rankJson(Number(match ? match[1] : "1"))
    })

    const adapter = createBilibiliAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledTimes(3)
    expect(fetchText).toHaveBeenCalledWith("bilibili", expect.stringContaining("season_type=1&day=3"), expect.any(Object))
    expect(fetchText).toHaveBeenCalledWith("bilibili", expect.stringContaining("season_type=4&day=3"), expect.any(Object))
    expect(fetchText).toHaveBeenCalledWith("bilibili", expect.stringContaining("season_type=3&day=3"), expect.any(Object))
    expect(result.completePopularitySources).toEqual(["bilibili_rank"])

    const items = result.items
    expect(items).toHaveLength(3)

    // season_type=1 番剧
    expect(items[0].media).toMatchObject({
      source: "bilibili",
      sourceId: "bilibili-1000",
      mediaType: "anime",
      releaseForm: "animated_series",
      sourceContentType: "番剧",
      titleDisplay: "剧1",
      posterUrl: "https://i0.hdslb.com/bfs/bangumi/test.jpg",
      status: "ongoing"
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "哔哩哔哩",
      region: "CN",
      releaseDate: null,
      releasePattern: "weekly",
      releaseStatus: "available",
      episodeNumber: 10,
      source: "bilibili"
    })
    expect(items[0].popularitySignals[0]).toMatchObject({
      source: "bilibili_rank",
      sourceCategory: "official_platform",
      platform: "哔哩哔哩",
      region: "CN",
      window: "current",
      rank: 1,
      value: 100000,
      valueLabel: "B站播放量"
    })

    // season_type=4 国创：标记为中国作品
    expect(items[1].media).toMatchObject({
      sourceId: "bilibili-4000",
      mediaType: "anime",
      sourceContentType: "国创",
      productionCountries: ["CN"],
      originalLanguage: "zh"
    })

    // season_type=3 纪录片
    expect(items[2].media).toMatchObject({
      sourceId: "bilibili-3000",
      mediaType: "documentary",
      releaseForm: "documentary_series",
      sourceContentType: "纪录片"
    })
  })

  it("returns no items when the API responds with a non-zero code", async () => {
    const fetchText = vi.fn(async () => JSON.stringify({ code: -400, message: "请求错误" }))

    const adapter = createBilibiliAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()
    expect(result.items).toEqual([])
    expect(result.completePopularitySources).toEqual(["bilibili_rank"])
  })

  it("parses ended status from a completed series index show", async () => {
    const fetchText = vi.fn(async () => JSON.stringify({
      code: 0,
      data: {
        list: [{
          rank: 2,
          title: "完结番",
          season_id: 999,
          cover: null,
          url: "https://www.bilibili.com/bangumi/play/ss999",
          rating: null,
          new_ep: { index_show: "全12话" },
          stat: { view: null, follow: 100 }
        }]
      }
    }))

    const adapter = createBilibiliAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()
    expect(result.items[0].media.status).toBe("ended")
    expect(result.items[0].releases[0]).toMatchObject({ releaseStatus: "ended", episodeNumber: 12 })
    expect(result.items[0].popularitySignals[0].value).toBeNull()
  })
})