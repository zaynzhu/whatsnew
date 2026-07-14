import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAppleTvPlusAdapter } from "../src/adapters/appleTvPlusAdapter.js"
import {
  parseAppleTvPlusNewsFeed,
  parseAppleTvPlusPressArticle
} from "../src/adapters/appleTvPlusParser.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title><![CDATA[Apple TV unveils trailer for “Lucky,” the new limited series]]></title>
    <updated><![CDATA[2026-06-22T00:00:00.000Z]]></updated>
    <id><![CDATA[https://www.apple.com/tv-pr/news/2026/06/lucky/]]></id>
    <link href="https://www.apple.com/tv-pr/news/2026/06/lucky/"/>
    <link href="https://www.apple.com/tv-pr/articles/2026/06/lucky/images/lucky-16-9.jpg" rel="enclosure" title="Lucky" type="image/jpeg"/>
    <category term="Press Release"/>
    <content><![CDATA[Lucky is a new limited series on Apple TV+.]]></content>
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

const articleHtml = `
  <html>
    <head>
      <meta property="og:title" content="Apple TV unveils trailer for “Lucky”" />
      <meta property="og:description" content="Anya Taylor-Joy stars in the new limited series." />
      <meta property="og:image" content="https://www.apple.com/lucky-16-9.jpg" />
    </head>
    <body>
      <article>
        <h1>Apple TV unveils trailer for “Lucky”</h1>
        <p>The new limited series is premiering globally Wednesday, July 15, 2026 on Apple TV.</p>
      </article>
    </body>
  </html>
`

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("适配器不得使用全局 fetch")
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("appleTvPlusAdapter", () => {
  it("uses RSS publication time for news and explicit article dates for releases", async () => {
    const fetchText = vi.fn()
      .mockResolvedValueOnce(feedXml)
      .mockResolvedValueOnce(articleHtml)

    const adapter = createAppleTvPlusAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    const result = await adapter.fetchItems()

    expect(fetchText.mock.calls.map((call) => call[1])).toEqual([
      "https://www.apple.com/tv-pr/news-feed.xml",
      "https://www.apple.com/tv-pr/news/2026/06/lucky/"
    ])
    expect(result.completePopularitySources).toEqual(["apple_tv_plus_news"])
    expect(result.completeReleaseSources).toBeUndefined()

    // 第二条是行业新闻（无 series/movie/documentary/special 关键词），被过滤
    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    expect(item.media).toMatchObject({
      source: "apple_tv_plus",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "Lucky",
      titleAliases: ["Apple TV unveils trailer for “Lucky,” the new limited series"],
      originalLanguage: null,
      firstReleaseDate: "2026-07-15",
      status: "upcoming"
    })
    expect(item.releases[0]).toMatchObject({
      platform: "Apple TV+",
      region: "US",
      releaseDate: "2026-07-15",
      releasePattern: "platform_premiere",
      releaseStatus: "upcoming",
      source: "apple_tv_plus",
      sourceUrl: "https://www.apple.com/tv-pr/news/2026/06/lucky/"
    })
    expect(item.popularitySignals[0]).toMatchObject({
      source: "apple_tv_plus_news",
      sourceCategory: "news_signal",
      platform: "Apple TV+",
      region: "US",
      rankingScope: "news",
      rank: null,
      valueLabel: "官方资讯",
      capturedAt: new Date("2026-06-22T00:00:00.000Z")
    })
    expect(item.media.posterUrl).toBeNull()
  })

  it("keeps a press item as news without inventing a release date", async () => {
    const singleEntryFeed = feedXml.replace(/\s*<entry>\s*<title><!\[CDATA\[Apple's Eddy Cue[\s\S]*?<\/entry>/, "")
    const fetchText = vi.fn()
      .mockResolvedValueOnce(singleEntryFeed)
      .mockResolvedValueOnce("<article><h1>Apple TV unveils trailer for “Lucky”</h1><p>Coming soon.</p></article>")
    const adapter = createAppleTvPlusAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    const result = await adapter.fetchItems()

    expect(result.items).toHaveLength(1)
    expect(result.items[0].media).toMatchObject({
      titleDisplay: "Lucky",
      firstReleaseDate: null,
      status: "unknown"
    })
    expect(result.items[0].releases).toEqual([])
    expect(result.items[0].popularitySignals).toHaveLength(1)
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

describe("Apple TV+ press parser", () => {
  it("keeps publication time separate and extracts an explicit premiere date", () => {
    const [entry] = parseAppleTvPlusNewsFeed(feedXml, "https://www.apple.com/tv-pr/news-feed.xml", 2026)
    const parsed = parseAppleTvPlusPressArticle(entry, articleHtml, 2026)

    expect(entry).toMatchObject({
      releaseDate: null,
      publishedAt: "2026-06-22T00:00:00.000Z"
    })
    expect(parsed).toMatchObject({
      title: "Lucky",
      titleAliases: ["Apple TV unveils trailer for “Lucky,” the new limited series"],
      releaseDate: "2026-07-15",
      releasePattern: "platform_premiere",
      posterUrl: null
    })
  })
})
