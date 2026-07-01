import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMgtvAdapter } from "../src/adapters/mgtvAdapter.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function htmlWithNuxt(data: unknown): string {
  return `<!doctype html><script>window.__NUXT__=${JSON.stringify(data)};</script>`
}

const nuxtData = {
  data: [
    {
      channelData: {
        moduleList: [
          {
            moduleTitle: "热播剧集",
            videoList: [
              { name: "剧A🔥顶级宣传语", jumpId: "111", videoUrl: "//www.mgtv.com/b/111/1.html", imgHUrl: "//1img.hitv.com/a.jpg" },
              { name: "剧B", jumpId: "222", videoUrl: "https://www.mgtv.com/b/222/2.html", imgHUrl: "//1img.hitv.com/b.jpg" }
            ]
          },
          {
            moduleTitle: "新剧速递",
            videoList: [
              { name: "剧A", desc: "剧A简介", jumpId: "111", videoUrl: "https://www.mgtv.com/l/111.html", imgHUrl: "//1img.hitv.com/a.jpg" },
              { name: "剧C", jumpId: "333", videoUrl: "https://www.mgtv.com/l/333.html", imgHUrl: "//1img.hitv.com/c.jpg" }
            ]
          }
        ]
      }
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

describe("mgtvAdapter", () => {
  it("parses hot drama ranking and new drama catalog, merging overlapping jumpIds", async () => {
    const fetchText = vi.fn(async (sourceId: string) => {
      expect(sourceId).toBe("mango_tv")
      return htmlWithNuxt(nuxtData)
    })

    const adapter = createMgtvAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledWith("mango_tv", "https://www.mgtv.com/tv/", expect.any(Object))
    expect(result.completePopularitySources).toEqual(["mgtv_hot"])

    const items = result.items
    expect(items).toHaveLength(3)

    // jumpId 111 同时在热播和新剧，合并为同一作品：release（新剧）+ signal（热播 rank 1）
    expect(items[0].media).toMatchObject({
      source: "mgtv",
      sourceId: "mgtv-111",
      mediaType: "series",
      releaseForm: "web_series",
      sourceContentType: "电视剧",
      titleDisplay: "剧A",
      posterUrl: "https://1img.hitv.com/a.jpg",
      productionCountries: ["CN"],
      originalLanguage: "zh"
    })
    expect(items[0].releases).toHaveLength(1)
    expect(items[0].releases[0]).toMatchObject({
      platform: "芒果TV",
      region: "CN",
      releaseDate: null,
      releasePattern: "streaming_release",
      releaseStatus: "unknown",
      source: "mgtv",
      sourceUrl: "https://www.mgtv.com/l/111.html"
    })
    expect(items[0].popularitySignals).toHaveLength(1)
    expect(items[0].popularitySignals[0]).toMatchObject({
      source: "mgtv_hot",
      sourceCategory: "official_platform",
      platform: "芒果TV",
      region: "CN",
      window: "current",
      rank: 1,
      valueLabel: "芒果TV 热播剧集",
      sourceUrl: "https://www.mgtv.com/b/111/1.html"
    })

    // jumpId 333 仅在新剧速递：只有 release，无 signal
    expect(items[1].media.sourceId).toBe("mgtv-333")
    expect(items[1].releases).toHaveLength(1)
    expect(items[1].popularitySignals).toHaveLength(0)

    // jumpId 222 仅在热播剧集：只有 signal，无 release
    expect(items[2].media.sourceId).toBe("mgtv-222")
    expect(items[2].releases).toHaveLength(0)
    expect(items[2].popularitySignals).toHaveLength(1)
    expect(items[2].popularitySignals[0]).toMatchObject({ rank: 2 })
  })

  it("returns no items when the page has no Nuxt data", async () => {
    const fetchText = vi.fn(async () => "<!doctype html><div></div>")

    const adapter = createMgtvAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    const result = await adapter.fetchItems()
    expect(result.items).toEqual([])
    expect(result.completePopularitySources).toEqual(["mgtv_hot"])
  })
})