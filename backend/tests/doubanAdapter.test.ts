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

const movieModulesJson = JSON.stringify({
  modules: [
    {
      key: "movie_coming_soon",
      module_name: "movie_coming_soon",
      data: [
        {
          title: "国内即将上映",
          type: "movie",
          items: [
            {
              id: "36246195",
              title: "蜘蛛侠：崭新之日",
              type: "movie",
              subtype: "movie",
              cover_url: "https://img1.doubanio.com/view/photo/m_ratio_poster/public/p2933887440.jpg",
              genres: ["动作", "科幻", "奇幻"],
              pubdate: ["2026-07-29(中国大陆)"],
              release_date: "2026-07-29",
              rating: { count: 0, value: 0 },
              url: "https://movie.douban.com/subject/36246195/",
              year: "2026"
            },
            {
              id: "36179101",
              title: "希望",
              type: "movie",
              subtype: "movie",
              cover_url: "https://img2.doubanio.com/view/photo/m_ratio_poster/public/p2933326871.jpg",
              card_subtitle: "2026 / 韩国 / 喜剧 动作 科幻 / 罗泓轸",
              genres: ["喜剧", "动作", "科幻"],
              pubdate: ["2026-05-17(戛纳电影节)"],
              release_date: null,
              rating: { count: 421, value: 6 },
              url: "https://movie.douban.com/subject/36179101/",
              year: "2026"
            }
          ]
        }
      ]
    }
  ]
})

const tvModulesJson = JSON.stringify({
  modules: [
    {
      key: "coming_soon",
      module_name: "tv_coming_soon",
      data: {
        title: "即将播出",
        type: "tv",
        items: [
          {
            id: "37185797",
            title: "百年孤独 第二季",
            type: "tv",
            subtype: "tv",
            cover_url: "https://img3.doubanio.com/view/photo/m_ratio_poster/public/p2927993523.jpg",
            card_subtitle: "2026 / 哥伦比亚 / 剧情 历史 奇幻 / 劳拉·莫拉·奥尔特加",
            genres: ["剧情", "历史", "奇幻"],
            pubdate: ["2026-08-05(哥伦比亚)"],
            release_date: null,
            rating: { count: 0, value: 0 },
            url: "https://movie.douban.com/subject/37185797/",
            year: "2026"
          }
        ]
      }
    }
  ]
})

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("适配器不得使用全局 fetch")
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("doubanAdapter", () => {
  it("parses Douban TOP250 and mobile coming soon modules", async () => {
    const fetchText = vi.fn(async (sourceId: string, url: string) => {
      expect(sourceId).toBe("douban")
      if (url.includes("top_list")) {
        expect(url).toContain("type=24")
        expect(url).toContain("limit=20")
        return chartJson
      }
      if (url.includes("/movie/modules")) return movieModulesJson
      if (url.includes("/tv/modules")) return tvModulesJson

      throw new Error(`未预期的豆瓣 URL: ${url}`)
    })

    const adapter = createDoubanAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      now: new Date("2026-07-10T00:00:00")
    })

    const result = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledTimes(3)
    expect(result.completePopularitySources).toEqual(["douban_top", "douban_upcoming"])
    expect(result.completeReleaseSources).toEqual(["douban"])
    expect(result.items).toHaveLength(5)

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

    expect(result.items[2].media).toMatchObject({
      sourceId: "douban-36246195",
      mediaType: "movie",
      sourceContentType: "电影",
      titleDisplay: "蜘蛛侠：崭新之日",
      firstReleaseDate: "2026-07-29",
      status: "upcoming",
      productionCountries: ["中国大陆"]
    })
    expect(result.items[2].releases[0]).toMatchObject({
      platform: "豆瓣",
      region: "中国大陆",
      releaseDate: "2026-07-29",
      releasePattern: "theatrical_coming_soon",
      releaseStatus: "upcoming",
      source: "douban",
      sourceUrl: "https://movie.douban.com/subject/36246195/"
    })
    expect(result.items[2].popularitySignals[0]).toMatchObject({
      source: "douban_upcoming",
      sourceCategory: "chinese_interest",
      platform: "豆瓣",
      region: "中国大陆",
      window: "国内即将上映",
      rank: 1,
      valueLabel: "豆瓣即将播出排序"
    })

    expect(result.items[3].media).toMatchObject({
      sourceId: "douban-36179101",
      titleDisplay: "希望",
      firstReleaseDate: null,
      status: "upcoming",
      productionCountries: ["韩国"]
    })
    expect(result.items[3].releases[0]).toMatchObject({
      releaseDate: null,
      releaseStatus: "announced",
      region: "韩国"
    })

    expect(result.items[4].media).toMatchObject({
      sourceId: "douban-37185797",
      mediaType: "series",
      releaseForm: "tv_series",
      sourceContentType: "剧集",
      titleDisplay: "百年孤独 第二季",
      firstReleaseDate: "2026-08-05",
      status: "upcoming",
      productionCountries: ["哥伦比亚"]
    })
    expect(result.items[4].releases[0]).toMatchObject({
      region: "哥伦比亚",
      releaseDate: "2026-08-05",
      releasePattern: "tv_coming_soon",
      releaseStatus: "upcoming"
    })
  })

  it("returns no items when the responses are not supported JSON", async () => {
    const fetchText = vi.fn(async () => "Bad Request")

    const adapter = createDoubanAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledTimes(3)
    expect(result.items).toEqual([])
    expect(result.completePopularitySources).toEqual([])
    expect(result.completeReleaseSources).toEqual([])
  })

  it("fetches only upcoming modules in upcoming scope", async () => {
    const fetchText = vi.fn(async (_sourceId: string, _url: string) => JSON.stringify({ modules: [] }))
    const adapter = createDoubanAdapter({
      scope: "upcoming",
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()

    expect(adapter.scope).toBe("upcoming")
    expect(fetchText).toHaveBeenCalledTimes(2)
    expect(fetchText.mock.calls.every((call) => String(call[1]).includes("/modules"))).toBe(true)
    expect(result.items).toEqual([])
  })
})
