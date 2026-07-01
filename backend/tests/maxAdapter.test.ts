import { afterEach, describe, expect, it, vi } from "vitest"
import { createMaxAdapter } from "../src/adapters/maxAdapter.js"
import { parseMaxWhatsNew } from "../src/adapters/maxPressParser.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function fakeSettings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-max-env"), values)
}

const maxHtml = `
  <article>
    <h1>What's New On HBO Max This July</h1>
    <p>July 1</p>
    <ul>
      <li>Sinners, 2025 (HBO)</li>
      <li>Rage: Season 1 (HBO Original)</li>
    </ul>
    <p>July 15, 2026</p>
    <p>Feature Film: Opus</p>
    <p>Coming later this month</p>
    <p>Last Chance</p>
    <p>Movie Leaving Soon</p>
    <p>Undated Promo</p>
  </article>
`

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Max press parser", () => {
  it("parses dated WBD press sections into platform candidates", () => {
    const rows = parseMaxWhatsNew(
      maxHtml,
      "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july",
      2026
    )

    expect(rows).toEqual([
      expect.objectContaining({
        title: "Sinners",
        sourceContentType: "movie",
        releaseDate: "2026-07-01"
      }),
      expect.objectContaining({
        title: "Rage: Season 1",
        sourceContentType: "series",
        releaseDate: "2026-07-01"
      }),
      expect.objectContaining({
        title: "Opus",
        sourceContentType: "movie",
        releaseDate: "2026-07-15"
      })
    ])
  })

  it("throws when the press page has no dated titles", () => {
    expect(() =>
      parseMaxWhatsNew("<article><p>Only marketing copy</p></article>", "https://example.test", 2026)
    ).toThrow("Max press 页面没有可解析条目")
  })

  it("rejects synopsis-sized lines as title candidates", () => {
    const longSynopsis = [
      "A team investigates a remote coastline and follows multiple witnesses across several towns",
      "collecting interviews, archival footage and expert commentary that should remain overview copy",
      "instead of becoming a media title in the database."
    ].join(" ")

    expect(() =>
      parseMaxWhatsNew(
        `<article><p>July 1</p><p>${longSynopsis}</p></article>`,
        "https://example.test/max",
        2026
      )
    ).toThrow("Max press 页面没有可解析条目")
  })

  it("prefers article content over dated rows elsewhere in the body", () => {
    const html = `
      <html>
        <body>
          <nav>
            <p>July 30</p>
            <ul>
              <li>Nav Promo Title</li>
            </ul>
          </nav>
          <article>
            <h1>What's New On Max</h1>
            <p>July 1</p>
            <ul>
              <li>Article Release, 2025 (HBO)</li>
            </ul>
          </article>
          <footer>
            <p>August 2</p>
            <p>Footer Promo Title</p>
          </footer>
        </body>
      </html>
    `

    const rows = parseMaxWhatsNew(html, "https://example.test/max", 2026)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({
        title: "Article Release",
        releaseDate: "2026-07-01"
      })
    )
  })

  it("does not resume collection from leaving sections until a new release heading appears", () => {
    const html = `
      <article>
        <h1>What's New On Max</h1>
        <h2>Last Chance</h2>
        <p>July 31</p>
        <ul>
          <li>Leaving Soon Movie</li>
        </ul>
        <h2>What's New This Month</h2>
        <p>August 1</p>
        <ul>
          <li>Fresh Drop, 2025 (HBO)</li>
        </ul>
      </article>
    `

    const rows = parseMaxWhatsNew(html, "https://example.test/max", 2026)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({
        title: "Fresh Drop",
        releaseDate: "2026-08-01"
      })
    )
  })

  it("blocks dated rows after paragraph blocked markers until a release heading appears", () => {
    const html = `
      <article>
        <h1>What's New On Max</h1>
        <p>Coming later this month</p>
        <p>July 31</p>
        <ul>
          <li>Future Promo Movie</li>
        </ul>
        <p>Leaving</p>
        <p>July 31</p>
        <ul>
          <li>Leaving Movie</li>
        </ul>
        <h2>What's New This Month</h2>
        <p>August 1</p>
        <ul>
          <li>Fresh Drop, 2025 (HBO)</li>
        </ul>
      </article>
    `

    const rows = parseMaxWhatsNew(html, "https://example.test/max", 2026)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({
        title: "Fresh Drop",
        releaseDate: "2026-08-01"
      })
    )
  })

  it("parses rich WBD pressroom paragraphs split by br tags", () => {
    const html = `
      <main>
        <article class="o-article-header__item">
          <h2>Hero only</h2>
        </article>
        <article class="p-media-release__content">
          <div class="pressroom-content">
            <p>
              <strong>Series</strong><br>
              <em>Debuts July 23</em><br>
              Max Original Comedy Series<br>
              <strong>STUART FAILS TO SAVE THE UNIVERSE</strong><br>
              A multiverse comedy follows a team of unlikely heroes across several timelines and should be treated as synopsis copy rather than a title candidate.<br>
              10 Episodes<br>
              <strong>Logline:</strong> A multiverse comedy.
            </p>
            <p>
              <strong>Films</strong><br>
              <em>Debuts July 10</em><br>
              Lionsgate Film<br>
              <strong>The Long Walk&nbsp;</strong><br>
              <strong>Cast:</strong> Cooper Hoffman.
            </p>
          </div>
        </article>
      </main>
    `

    const rows = parseMaxWhatsNew(html, "https://example.test/max", 2026)

    expect(rows).toEqual([
      expect.objectContaining({
        title: "STUART FAILS TO SAVE THE UNIVERSE",
        sourceContentType: "series",
        releaseDate: "2026-07-23"
      }),
      expect.objectContaining({
        title: "The Long Walk",
        sourceContentType: "movie",
        releaseDate: "2026-07-10"
      })
    ])
  })

  it("ignores category headings as candidates within an active date section", () => {
    const html = `
      <article>
        <h1>What's New On Max</h1>
        <p>July 1</p>
        <h2>Comedy</h2>
        <p>Feature Film: The Great Feature</p>
      </article>
    `

    const rows = parseMaxWhatsNew(html, "https://example.test/max", 2026)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({
        title: "The Great Feature"
      })
    )
  })
})

describe("Max adapter", () => {
  it("fetches the configured WBD press page and maps dated titles", async () => {
    const fetchText = vi.fn(async () => maxHtml)
    const adapter = createMaxAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      settings: fakeSettings({ HTTPS_PROXY: "http://proxy.test:7890" }),
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    const batch = await adapter.fetchItems()
    const items = batch.items

    expect(fetchText).toHaveBeenCalledWith(
      "max",
      "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july",
      expect.objectContaining({
        timeoutMs: 30000,
        settingsOverride: expect.objectContaining({
          HTTPS_PROXY: "http://proxy.test:7890",
          SOURCE_MAX_PROXY_MODE: "inherit"
        })
      })
    )
    expect(batch.completeReleaseSources).toEqual(["max"])
    expect(items).toHaveLength(3)
    expect(items[0].popularitySignals).toEqual([])
    expect(items[0].media).toMatchObject({
      source: "max",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      titleDisplay: "Sinners"
    })
    expect(items[1].media).toMatchObject({
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "Rage: Season 1"
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "Max",
      region: "US",
      releaseDate: "2026-07-01"
    })
  })
})
