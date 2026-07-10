import { afterEach, describe, expect, it, vi } from "vitest"
import { createDisneyPlusAdapter } from "../src/adapters/disneyPlusAdapter.js"
import { parseDisneyPlusNewReleases } from "../src/adapters/disneyPlusParser.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function fakeSettings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-disney-env"), values)
}

const disneyHtml = `
  <main>
    <h1>New on Disney+ in July 2026</h1>
    <h2>July 2</h2>
    <h3>Ocean Movie</h3>
    <p>Original movie premiere.</p>
    <h2>July 9</h2>
    <h3>Galaxy Adventures Season 2</h3>
    <p>New series episodes arrive weekly.</p>
    <h2>Coming Later This Month</h2>
    <h3>Undated Feature</h3>
  </main>
`

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Disney+ parser", () => {
  it("parses dated article sections into platform candidates", () => {
    const rows = parseDisneyPlusNewReleases(
      disneyHtml,
      "https://www.disneyplus.com/explore/articles/new-to-disney-plus",
      2026
    )

    expect(rows).toEqual([
      expect.objectContaining({
        title: "Ocean Movie",
        sourceContentType: "movie",
        releaseDate: "2026-07-02",
        description: "Original movie premiere."
      }),
      expect.objectContaining({
        title: "Galaxy Adventures Season 2",
        sourceContentType: "series",
        releaseDate: "2026-07-09"
      })
    ])
  })

  it("throws when no dated titles can be parsed", () => {
    expect(() => parseDisneyPlusNewReleases("<main><h1>Marketing</h1></main>", "https://example.test", 2026))
      .toThrow("Disney+ 页面没有可解析条目")
  })

  it("ignores navigation and footer lists outside the article body", () => {
    const html = `
      <body>
        <nav>
          <ul>
            <li>Movie News</li>
          </ul>
        </nav>
        <article>
          <h1>New on Disney+ in July 2026</h1>
          <h2>July 2</h2>
          <h3>Ocean Movie</h3>
          <p>Original movie premiere.</p>
        </article>
        <footer>
          <ul>
            <li>Footer Promo</li>
          </ul>
        </footer>
      </body>
    `

    const rows = parseDisneyPlusNewReleases(html, "https://example.test/disney", 2026)

    expect(rows).toEqual([
      expect.objectContaining({
        title: "Ocean Movie",
        releaseDate: "2026-07-02"
      })
    ])
  })

  it("ignores editorial cards nested inside grid list items", () => {
    const rows = parseDisneyPlusNewReleases(`
      <main>
        <h2>July 9</h2>
        <ul><li>Project Runway Season 22, Disney+ &amp; Hulu</li></ul>
        <ul>
          <li class="grid-item">
            <article>
              <p>Movies &amp; Shows</p>
              <h3>How To Watch Desperate Housewives</h3>
              <time>July 9, 2026</time>
            </article>
          </li>
        </ul>
      </main>
    `, "https://example.test/disney", 2026)

    expect(rows).toEqual([
      expect.objectContaining({
        title: "Project Runway Season 22",
        titleAliases: ["Project Runway Season 22, Disney+ & Hulu"],
        releaseDate: "2026-07-09",
        releasePattern: "catalog_addition"
      })
    ])
  })
})

describe("Disney+ adapter", () => {
  it("fetches the New to Disney+ article and maps dated titles", async () => {
    const fetchText = vi.fn(async () => disneyHtml)
    const adapter = createDisneyPlusAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      settings: fakeSettings({ HTTPS_PROXY: "http://proxy.test:7890" }),
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    const batch = await adapter.fetchItems()
    const items = batch.items

    expect(fetchText).toHaveBeenCalledWith(
      "disney_plus",
      "https://www.disneyplus.com/explore/articles/new-to-disney-plus",
      expect.objectContaining({
        timeoutMs: 30000,
        settingsOverride: expect.objectContaining({
          HTTPS_PROXY: "http://proxy.test:7890",
          SOURCE_DISNEY_PLUS_PROXY_MODE: "inherit"
        })
      })
    )
    expect(batch.completeReleaseSources).toEqual(["disney_plus"])
    expect(items).toHaveLength(2)
    expect(items[0].popularitySignals).toEqual([])
    expect(items[0].media).toMatchObject({
      source: "disney_plus",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      titleDisplay: "Ocean Movie"
    })
    expect(items[1].media).toMatchObject({
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "Galaxy Adventures Season 2"
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "Disney+",
      region: "US",
      releaseDate: "2026-07-02",
      releaseStatus: "upcoming",
      releasePattern: "catalog_addition"
    })
  })
})
