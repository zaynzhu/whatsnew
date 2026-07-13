import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAppleTvPlusAdapter } from "../src/adapters/appleTvPlusAdapter.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title><![CDATA[Sugar Season 2 debuts on Apple TV+]]></title>
    <updated><![CDATA[2026-06-22T00:00:00.000Z]]></updated>
    <id><![CDATA[https://www.apple.com/tv-pr/news/2026/06/sugar-s2/]]></id>
    <link href="https://www.apple.com/tv-pr/news/2026/06/sugar-s2/"/>
    <link href="https://www.apple.com/tv-pr/articles/2026/06/sugar-s2/images/big-image/big-image-01/sugar.jpg" rel="enclosure" title="Sugar Season 2" type="image/jpeg"/>
    <category term="Press Release"/>
    <content><![CDATA[Sugar returns for a second season on Apple TV+.]]></content>
  </entry>
  <entry>
    <title><![CDATA[Apple's Eddy Cue honored as Person of the Year]]></title>
    <updated><![CDATA[2026-06-21T00:00:00.000Z]]></updated>
    <id><![CDATA[https://www.apple.com/tv-pr/news/2026/06/eddy-cue/]]></id>
    <link href="https://www.apple.com/tv-pr/news/2026/06/eddy-cue/"/>
    <category term="Press Release"/>
    <content><![CDATA[Eddy Cue honored at Cannes Lions.]]></content>
  </entry>
</feed>`

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("适配器不得使用全局 fetch")
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("appleTvPlusAdapter", () => {
  it("parses Apple TV+ RSS and keeps only film/series entries", async () => {
    const fetchText = vi.fn(async (sourceId: string) => {
      expect(sourceId).toBe("apple_tv_plus")
      return feedXml
    })

    const adapter = createAppleTvPlusAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    const result = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledWith("apple_tv_plus", "https://www.apple.com/tv-pr/news-feed.xml", expect.any(Object))
    expect(result.completeReleaseSources).toEqual(["apple_tv_plus"])

    // 第二条是行业新闻（无 series/movie/documentary/special 关键词），被过滤
    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    expect(item.media).toMatchObject({
      source: "apple_tv_plus",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "Sugar Season 2 debuts on Apple TV+",
      originalLanguage: null,
      firstReleaseDate: "2026-06-22",
      status: "released"
    })
    expect(item.releases[0]).toMatchObject({
      platform: "Apple TV+",
      region: "US",
      releaseDate: "2026-06-22",
      releaseStatus: "available",
      source: "apple_tv_plus",
      sourceUrl: "https://www.apple.com/tv-pr/news/2026/06/sugar-s2/"
    })
  })

  it("throws when the RSS feed has no entries", async () => {
    const fetchText = vi.fn(async () => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`)

    const adapter = createAppleTvPlusAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    await expect(adapter.fetchItems()).rejects.toThrow(/没有可解析条目/)
  })
})
