import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createIqiyiAdapter } from "../src/adapters/iqiyiAdapter.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function htmlWithNuxt(data: unknown): string {
  return `<!doctype html><script>window.__NUXT__=${JSON.stringify(data)};</script>`
}

const nuxtData = {
  data: [
    {
      allVideos: [
        {
          name: "镖人：风起大漠",
          desc: "大漠之上，多方势力暗潮涌动。",
          cid: 1,
          pageUrl: "//www.iqiyi.com/v_sbzhdgvx4k.html",
          imageUrl: "//pic9.iqiyipic.com/image/20260617/poster_480_270.jpg",
          thumbnail: "//pic9.iqiyipic.com/image/20260617/poster_120_160.jpg",
          publishText: "06月18日上线",
          id: 3071192221488000,
          sub: {
            count: 971143
          },
          isOnline: false,
          star: [
            { id: 202599805, name: "吴京" },
            { id: 200032205, name: "谢霆锋" }
          ]
        },
        {
          name: "道长请留步",
          desc: "落魄爱豆与蒙眼道士荒诞同行。",
          cid: 35,
          pageUrl: "//www.iqiyi.com/a_1jxa0g5so3h.html",
          imageUrl: "//pic9.iqiyipic.com/image/20260604/short_480_270.jpg",
          thumbnail: "//pic9.iqiyipic.com/image/20260604/short_141_188.jpg",
          publishText: "06月18日上线",
          id: 5727163340499601,
          sub: {
            count: 3108
          },
          isOnline: false,
          star: [
            { id: 8262809585076505, name: "周昊杉" }
          ]
        },
        {
          name: "问心2",
          desc: "三人小分队重磅集结。",
          cid: 2,
          pageUrl: "//www.iqiyi.com/v_violvi0tfw.html",
          imageUrl: "//pic5.iqiyipic.com/image/20260615/tv_480_270.jpg",
          thumbnail: "//pic5.iqiyipic.com/image/20260615/tv_141_188.jpg",
          publishText: "06月18日上线",
          id: 5952571943702101,
          sub: {
            count: 222901
          },
          isOnline: false,
          star: [
            { id: 200153405, name: "赵又廷" }
          ]
        }
      ]
    }
  ]
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("适配器不得使用全局 fetch")
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("iqiyiAdapter", () => {
  it("fetches iQIYI new releases and maps reservation signals", async () => {
    const fetchText = vi.fn(async (sourceId: string) => {
      expect(sourceId).toBe("iqiyi")
      return htmlWithNuxt(nuxtData)
    })

    const adapter = createIqiyiAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      today: () => "2026-06-17"
    })

    const items = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledWith("iqiyi", "https://www.iqiyi.com/newOnlinePCW", expect.any(Object))
    expect(items).toHaveLength(3)
    expect(items[0].media).toMatchObject({
      source: "iqiyi",
      sourceId: "iqiyi-3071192221488000",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      sourceContentType: "电影",
      titleDisplay: "镖人：风起大漠",
      overview: "大漠之上，多方势力暗潮涌动。",
      posterUrl: "https://pic9.iqiyipic.com/image/20260617/poster_120_160.jpg",
      productionCountries: ["CN"],
      originalLanguage: "zh",
      genres: ["电影"],
      firstReleaseDate: "2026-06-18",
      status: "upcoming"
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "爱奇艺",
      region: "CN",
      releaseDate: "2026-06-18",
      releasePattern: "streaming_release",
      releaseStatus: "upcoming",
      source: "iqiyi",
      sourceUrl: "https://www.iqiyi.com/v_sbzhdgvx4k.html"
    })
    expect(items[0].popularitySignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "iqiyi_reserve",
          sourceCategory: "official_platform",
          window: "current",
          rank: 1,
          value: 971143
        })
      ])
    )
    expect(items[1].media).toMatchObject({
      sourceId: "iqiyi-5727163340499601",
      mediaType: "short_drama",
      releaseForm: "micro_drama",
      sourceContentType: "短剧"
    })
    expect(items[2].media).toMatchObject({
      sourceId: "iqiyi-5952571943702101",
      mediaType: "series",
      releaseForm: "web_series",
      sourceContentType: "电视剧"
    })
  })

  it("returns no items when the page has no Nuxt release data", async () => {
    const fetchText = vi.fn(async () => "<!doctype html><div></div>")

    const adapter = createIqiyiAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    await expect(adapter.fetchItems()).resolves.toEqual([])
  })
})
