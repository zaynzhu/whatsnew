import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createYoukuAdapter } from "../src/adapters/youkuAdapter.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

const MS_CODE = "2019041100"

function response(body: unknown, cookie = false): Response {
  return new Response(JSON.stringify(body), {
    headers: cookie ? {
      "content-type": "application/json",
      "set-cookie": "_m_h5_tk=test-token_1999999999999; Path=/, _m_h5_tk_enc=test-enc; Path=/"
    } : {
      "content-type": "application/json"
    }
  })
}

function tokenResponse(): Response {
  return response({ ret: ["FAIL_SYS_TOKEN_EMPTY::令牌为空"], data: {} }, true)
}

function itemNode(input: {
  id: string
  title: string
  label?: string
  count: number
  category?: string
}) {
  return {
    data: {
      title: input.title,
      desc: `${input.title}简介`,
      img: `https://img.example/${input.id}.jpg`,
      onlineDesc: "即将上线",
      reason: { text: { title: input.label ?? "敬请期待" } },
      tags: [
        { uiType: 11, text: { title: "预告" } },
        { uiType: 2, text: { title: input.category ?? "剧情 · 悬疑" } }
      ],
      reserve: { count: input.count },
      action: { type: "JUMP_TO_SHOW", value: input.id }
    }
  }
}

function pageResponse(nodes: unknown[], more = false, subIndex = nodes.length): Response {
  return response({
    ret: ["SUCCESS::调用成功"],
    data: {
      [MS_CODE]: {
        data: {
          nodes: [{
            nodes: [{
              typeName: "KU_FLIX_V_GRID_PIANDAN_COMPONENT",
              more,
              data: { session: { subIndex } },
              nodes
            }]
          }]
        }
      }
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

describe("youkuAdapter", () => {
  it("通过优酷 MTop 独立待播节点采集电影和剧集预约", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(pageResponse([
        itemNode({ id: "show-tv", title: "九门", count: 2800000 })
      ]))
      .mockResolvedValueOnce(pageResponse([
        itemNode({ id: "show-movie", title: "蚌家镇怪谈", label: "明天16:00上线", count: 7600 })
      ]))
    const adapter = createYoukuAdapter({
      endpoint: "https://acs.youku.test/h5/mtop/1.0/",
      httpClient: { request } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      today: () => "2026-07-12"
    })

    const result = await adapter.fetchItems()

    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls[0][0]).toBe("youku")
    expect(request.mock.calls[1][1]).toContain("sign=")
    expect(result).toMatchObject({
      completeMediaSources: ["youku"],
      completePopularitySources: ["youku_hot", "youku_reserve"],
      completeReleaseSources: ["youku"]
    })
    expect(result.items).toHaveLength(2)
    expect(result.items[0].media).toMatchObject({
      sourceId: "youku-show-tv",
      mediaType: "series",
      releaseForm: "web_series",
      titleDisplay: "九门",
      firstReleaseDate: null,
      status: "upcoming"
    })
    expect(result.items[0].popularitySignals[0]).toMatchObject({
      source: "youku_reserve",
      rank: 1,
      value: 2800000,
      window: "upcoming"
    })
    expect(result.items[1].media).toMatchObject({
      sourceId: "youku-show-movie",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      firstReleaseDate: "2026-07-13",
      status: "upcoming"
    })
    expect(result.items[1].releases[0]).toMatchObject({
      releaseDate: "2026-07-13",
      releaseTime: "16:00",
      releaseStatus: "upcoming"
    })
  })

  it("使用响应 session 分页读取完整待播片单", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(pageResponse([
        itemNode({ id: "page-1", title: "第一页", count: 10 })
      ], true, 20))
      .mockResolvedValueOnce(pageResponse([
        itemNode({ id: "page-2", title: "第二页", count: 20 })
      ]))
    const adapter = createYoukuAdapter({
      endpoint: "https://acs.youku.test/h5/mtop/1.0/",
      feeds: [{ entityId: 22916606, category: "电视剧", referer: "https://tv.youku.com/" }],
      httpClient: { request } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()
    const secondPageUrl = new URL(request.mock.calls[2][1])
    const requestData = JSON.parse(secondPageUrl.searchParams.get("data")!)
    const params = JSON.parse(requestData.params)

    expect(result.items.map((item) => item.media.titleDisplay)).toEqual(["第一页", "第二页"])
    expect(params.pageNo).toBe(2)
    expect(JSON.parse(params.session)).toEqual({ subIndex: 20 })
    expect(result.items.map((item) => item.popularitySignals[0]?.rank)).toEqual([2, 1])
  })

  it("响应结构变化时失败，避免用空快照覆盖现有待播数据", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response({
        ret: ["SUCCESS::调用成功"],
        data: { [MS_CODE]: { data: { nodes: [] } } }
      }))
    const adapter = createYoukuAdapter({
      endpoint: "https://acs.youku.test/h5/mtop/1.0/",
      feeds: [{ entityId: 22916606, category: "电视剧", referer: "https://tv.youku.com/" }],
      httpClient: { request } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    await expect(adapter.fetchItems()).rejects.toThrow("优酷待播响应缺少预约组件")
  })
})
