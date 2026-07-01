import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDoubanAdapter } from "../src/adapters/doubanAdapter.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

const chartJson = JSON.stringify([
  {
    rating: ["9.5", "50"],
    rank: 1,
    cover_url: "https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2578474613.jpg",
    is_playable: true,
    id: "1292063",
    types: ["剧情", "喜剧", "爱情", "战争"],
    regions: ["意大利"],
    title: "美丽人生",
    url: "https://movie.douban.com/subject/1292063/"
  },
  {
    rating: null,
    rank: 2,
    cover_url: "https://img3.doubanio.com/x.jpg",
    is_playable: false,
    id: "1292064",
    types: ["剧情"],
    regions: ["美国"],
    title: "无评分候选",
    url: "https://movie.douban.com/subject/1292064/"
  }
])

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("适配器不得使用全局 fetch")
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("doubanAdapter", () => {
  it("parses Douban TOP250 chart into rating signals without releases", async () => {
    const fetchText = vi.fn(async (sourceId: string, url: string) => {
      expect(sourceId).toBe("douban")
      expect(url).toContain("type=24")
      expect(url).toContain("limit=20")
      return chartJson
    })

    const adapter = createDoubanAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()

    expect(result.completePopularitySources).toEqual(["douban_top"])
    expect(result.items).toHaveLength(2)

    expect(result.items[0].media).toMatchObject({
      source: "douban",
      sourceId: "douban-1292063",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      sourceContentType: "电影",
      titleDisplay: "美丽人生",
      posterUrl: "https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2578474613.jpg",
      productionCountries: ["意大利"],
      genres: ["剧情", "喜剧", "爱情", "战争"]
    })
    expect(result.items[0].releases).toEqual([])
    expect(result.items[0].popularitySignals[0]).toMatchObject({
      source: "douban_top",
      sourceCategory: "chinese_reputation",
      platform: "豆瓣",
      region: "CN",
      window: "current",
      rank: 1,
      value: 9.5,
      valueLabel: "豆瓣评分",
      sourceUrl: "https://movie.douban.com/subject/1292063/"
    })

    // rating 为 null 的条目不输出 signal
    expect(result.items[1].media.sourceId).toBe("douban-1292064")
    expect(result.items[1].popularitySignals).toEqual([])
  })

  it("returns no items when the response is not a JSON array", async () => {
    const fetchText = vi.fn(async () => "Bad Request")

    const adapter = createDoubanAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()
    expect(result.items).toEqual([])
    expect(result.completePopularitySources).toEqual(["douban_top"])
  })
})