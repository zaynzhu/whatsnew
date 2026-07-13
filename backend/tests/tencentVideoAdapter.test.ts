import { describe, expect, it, vi } from "vitest"
import { createTencentVideoAdapter } from "../src/adapters/tencentVideoAdapter.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function filterCard(value: string) {
  return {
    type: "searchlist_filter_card",
    params: {
      filter_key: "iyear",
      option_name: "即将上线",
      option_value: value
    }
  }
}

function posterCard(input: {
  cid: string
  title: string
  countLabel?: string
  poster?: string
  publishDate?: string
  category?: string
}) {
  return {
    type: "searchlist_poster_card",
    params: {
      cid: input.cid,
      title: input.title,
      second_title: `${input.title}简介`,
      publish_date: input.publishDate ?? "",
      new_pic_vt: input.poster ?? `https://images.test/${input.cid}.jpg`,
      main_genre: input.category ?? "剧情",
      area_name: "内地",
      langue: "普通话",
      chnlist_search_label: JSON.stringify(input.countLabel ? [{
        category: 10,
        label: input.countLabel
      }] : [])
    }
  }
}

function page(input: {
  filterValue?: string
  cards?: unknown[]
  hasNext?: boolean
  pageContext?: Record<string, string>
}) {
  return {
    ret: 0,
    msg: "",
    data: {
      modules: {
        normal: {
          cards: [
            ...(input.filterValue ? [filterCard(input.filterValue)] : []),
            ...(input.cards ?? [])
          ]
        }
      },
      has_next_page: input.hasNext ?? false,
      page_context: input.pageContext
    }
  }
}

describe("tencentVideoAdapter", () => {
  it("采集腾讯视频电影和剧集即将上线片单及预约下限", async () => {
    const fetchJson = vi.fn()
      .mockResolvedValueOnce(page({
        filterValue: "1",
        cards: [posterCard({
          cid: "tv-1",
          title: "小芳",
          countLabel: "预约破50万",
          publishDate: "2026-07-13"
        })]
      }))
      .mockResolvedValueOnce(page({
        filterValue: "999",
        cards: [posterCard({
          cid: "movie-1",
          title: "功夫女足",
          countLabel: "预约破1.2万",
          poster: "http://images.test/movie-1.jpg",
          category: "喜剧"
        })]
      }))
    const adapter = createTencentVideoAdapter({
      endpoint: "https://pbaccess.test/getMVLPage?vversion_platform=2",
      httpClient: { fetchJson } as Pick<SourceHttpClient, "fetchJson">,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()

    expect(fetchJson).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchJson.mock.calls[0][2].body as string)).toMatchObject({
      page_params: {
        channel_id: "100113",
        filter_params: "iyear=1"
      }
    })
    expect(result).toMatchObject({
      completeMediaSources: ["tencent"],
      completePopularitySources: ["tencent_reserve"],
      completeReleaseSources: ["tencent"]
    })
    expect(result.items).toHaveLength(2)
    expect(result.items[0].media).toMatchObject({
      sourceId: "tencent-tv-1",
      mediaType: "series",
      releaseForm: "web_series",
      titleDisplay: "小芳",
      posterUrl: "https://images.test/tv-1.jpg",
      firstReleaseDate: "2026-07-13",
      status: "upcoming"
    })
    expect(result.items[0].releases[0]).toMatchObject({
      platform: "腾讯视频",
      releaseDate: null,
      releasePattern: "streaming_release",
      releaseStatus: "upcoming"
    })
    expect(result.items[0].popularitySignals[0]).toMatchObject({
      source: "tencent_reserve",
      rank: 1,
      value: 500000,
      valueLabel: "预约破50万"
    })
    expect(result.items[1].media).toMatchObject({
      sourceId: "tencent-movie-1",
      mediaType: "movie",
      posterUrl: "https://images.test/movie-1.jpg"
    })
    expect(result.items[1].popularitySignals[0]).toMatchObject({ rank: 2, value: 12000 })
  })

  it("使用服务端 page_context 读取完整待播片单", async () => {
    const fetchJson = vi.fn()
      .mockResolvedValueOnce(page({
        filterValue: "1",
        cards: [posterCard({ cid: "page-1", title: "第一页" })],
        hasNext: true,
        pageContext: { page_index: "1", poster_offset: "12" }
      }))
      .mockResolvedValueOnce(page({
        cards: [posterCard({ cid: "page-2", title: "第二页" })]
      }))
    const adapter = createTencentVideoAdapter({
      feeds: [{ category: "电视剧", channelId: "100113", upcomingFilter: "iyear=1" }],
      httpClient: { fetchJson } as Pick<SourceHttpClient, "fetchJson">,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()
    const secondBody = JSON.parse(fetchJson.mock.calls[1][2].body as string)

    expect(secondBody.page_context).toEqual({ page_index: "1", poster_offset: "12" })
    expect(result.items.map((item) => item.media.titleDisplay)).toEqual(["第一页", "第二页"])
  })

  it("即将上线筛选值变化时失败，避免把历史年份写入待播片单", async () => {
    const fetchJson = vi.fn().mockResolvedValue(page({
      filterValue: "2017",
      cards: [posterCard({ cid: "old", title: "历史影片", publishDate: "2017-01-01" })]
    }))
    const adapter = createTencentVideoAdapter({
      feeds: [{ category: "电影", channelId: "100173", upcomingFilter: "iyear=999" }],
      httpClient: { fetchJson } as Pick<SourceHttpClient, "fetchJson">,
      minIntervalMs: 0
    })

    await expect(adapter.fetchItems()).rejects.toThrow("“即将上线”筛选契约变化")
  })

  it("分页未完成时失败，避免用截断快照淘汰旧数据", async () => {
    const fetchJson = vi.fn().mockResolvedValue(page({
      filterValue: "1",
      cards: [posterCard({ cid: "page-1", title: "第一页" })],
      hasNext: true,
      pageContext: { page_index: "1" }
    }))
    const adapter = createTencentVideoAdapter({
      feeds: [{ category: "电视剧", channelId: "100113", upcomingFilter: "iyear=1" }],
      httpClient: { fetchJson } as Pick<SourceHttpClient, "fetchJson">,
      minIntervalMs: 0,
      maxPages: 1
    })

    await expect(adapter.fetchItems()).rejects.toThrow("超过分页上限")
  })
})
