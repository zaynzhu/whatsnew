import { afterEach, describe, expect, it, vi } from "vitest"
import { createYoukuAdapter } from "../src/adapters/youkuAdapter.js"

function htmlWithInitialData(data: unknown): string {
  return `<!doctype html><script>window.__INITIAL_DATA__ =${JSON.stringify(data).replace(/"__undefined__"/g, "undefined")};</script>`
}

const tvInitialData = {
  moduleList: [
    {
      components: [
        {
          typeName: "KU_FLIX_FEED_SHOW_RESERVE_COMPONENT",
          spmC: "reserve_scroll_1",
          itemList: [
            {
              id: 317648,
              action_type: "JUMP_TO_SHOW",
              action_value: "07efbfbd394a39efbfbd",
              title: "云秀行",
              desc: "李一桐 曾舜晞｜名门穷小姐范云与白切黑城主齐峥携手破局。",
              subtitle: "6月20日 18:00上线",
              img: "http://m.ykimg.com/058400006A17D9392012C9143CCB2AFB",
              mark: { text: "预告" },
              topLeftMark: { text: { title: "新上线" } },
              reserve: { count: 214844 },
              previewInfo: { hotPoint: null },
              action: {
                extra: {
                  category: "电视剧"
                }
              }
            }
          ]
        },
        {
          typeName: "KU_FLIX_FEED_V_SCROLL_COMPONENT",
          spmC: "scg_scroll_2",
          itemList: [
            {
              id: 835369,
              action_type: "JUMP_TO_SHOW",
              action_value: "bbaf24dd38d240e0a0d0",
              title: "红了樱桃绿了芭蕉",
              desc: "常喆宽 翟一莹｜庶女顾铮重活一世。",
              img: "http://liangcang-material.alicdn.com/prod/upload/poster.webp.jpg",
              mark: { text: "独播" },
              topLeftMark: { text: { title: "有更新" } },
              trackShow: { count: 7890 },
              previewInfo: { hotPoint: 695517 },
              action: {
                extra: {
                  category: "短剧"
                }
              }
            }
          ]
        }
      ]
    }
  ]
}

const movieInitialData = {
  moduleList: [
    {
      components: [
        {
          typeName: "KU_FLIX_V_SCROLL_COMPONENT",
          spmC: "drawer2",
          itemList: [
            {
              id: 334515,
              action_type: "JUMP_TO_SHOW",
              action_value: "dbb0ecb3786549098484",
              title: "一出好戏",
              desc: "黄渤 舒淇｜一群人在封闭荒岛求生。",
              img: "http://liangcang-material.alicdn.com/prod/upload/movie.webp.jpg",
              mark: { text: "VIP" },
              topLeftMark: { text: { title: "票房破" } },
              trackShow: { count: 37676 },
              previewInfo: { hotPoint: 2352402 },
              action: {
                extra: {
                  category: "电影"
                }
              }
            }
          ]
        }
      ]
    }
  ]
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("youkuAdapter", () => {
  it("fetches Youku TV and movie pages and maps SSR items into media items", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const body = url.includes("movie.youku.com")
        ? htmlWithInitialData(movieInitialData)
        : htmlWithInitialData(tvInitialData)

      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/html" }
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createYoukuAdapter({
      minIntervalMs: 0,
      today: () => "2026-06-17"
    })

    const items = await adapter.fetchItems()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe("https://tv.youku.com/")
    expect(fetchMock.mock.calls[1][0]).toBe("https://movie.youku.com/")
    expect(items).toHaveLength(3)
    expect(items[0].media).toMatchObject({
      source: "youku",
      sourceId: "youku-07efbfbd394a39efbfbd",
      mediaType: "series",
      releaseForm: "web_series",
      sourceContentType: "电视剧",
      titleDisplay: "云秀行",
      overview: "李一桐 曾舜晞｜名门穷小姐范云与白切黑城主齐峥携手破局。",
      posterUrl: "http://m.ykimg.com/058400006A17D9392012C9143CCB2AFB",
      productionCountries: ["CN"],
      originalLanguage: "zh",
      genres: ["电视剧"],
      firstReleaseDate: "2026-06-20",
      status: "upcoming"
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "优酷",
      region: "CN",
      releaseDate: "2026-06-20",
      releaseTime: "18:00",
      releasePattern: "streaming_release",
      releaseStatus: "upcoming",
      source: "youku",
      sourceUrl: "https://www.youku.com/show_page/id_07efbfbd394a39efbfbd.html"
    })
    expect(items[0].popularitySignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "youku_reserve",
          sourceCategory: "official_platform",
          window: "current",
          rank: 1,
          value: 214844
        })
      ])
    )
    expect(items[1].media).toMatchObject({
      sourceId: "youku-bbaf24dd38d240e0a0d0",
      mediaType: "short_drama",
      releaseForm: "micro_drama",
      status: "ongoing"
    })
    expect(items[1].popularitySignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "youku_hot",
          rank: 1,
          value: 695517
        })
      ])
    )
    expect(items[2].media).toMatchObject({
      sourceId: "youku-dbb0ecb3786549098484",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      titleDisplay: "一出好戏",
      status: "released"
    })
  })

  it("returns no items when the Youku page does not include SSR initial data", async () => {
    const fetchMock = vi.fn(async () => new Response("<!doctype html><div></div>"))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createYoukuAdapter({
      minIntervalMs: 0
    })

    await expect(adapter.fetchItems()).resolves.toEqual([])
  })
})
