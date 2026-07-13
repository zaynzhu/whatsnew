import { afterEach, describe, expect, it, vi } from "vitest"
import { createHuluAdapter } from "../src/adapters/huluAdapter.js"
import { parseHuluSchedule } from "../src/adapters/huluScheduleParser.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function fakeSettings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-hulu-env"), values)
}

const scheduleHtml = `
  <html>
    <body>
      <table>
        <tr><th>Date</th><th>Title</th><th>Network</th><th>Status</th></tr>
        <tr>
          <td>July 1</td>
          <td>The Bear: Complete Season 5</td>
          <td>FX</td>
          <td>Added</td>
        </tr>
        <tr>
          <td>July 2, 2026</td>
          <td>Sci-Fi Movie</td>
          <td>Hulu Original</td>
          <td>Premiere</td>
        </tr>
        <tr>
          <td>July 3</td>
          <td>Ambiguous Showcase</td>
          <td>Hulu</td>
          <td>Added</td>
        </tr>
      </table>
    </body>
  </html>
`

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("Hulu schedule parser", () => {
  it("parses schedule table rows into dated release candidates", () => {
    const rows = parseHuluSchedule(scheduleHtml, "https://press.hulu.com/schedule/", 2026)

    expect(rows).toEqual([
      expect.objectContaining({
        title: "The Bear",
        titleAliases: ["The Bear: Complete Season 5"],
        sourceContentType: "series",
        releaseDate: "2026-07-01",
        labels: expect.arrayContaining(["FX", "Added"])
      }),
      expect.objectContaining({
        title: "Sci-Fi Movie",
        sourceContentType: "movie",
        releaseDate: "2026-07-02"
      }),
      expect.objectContaining({
        title: "Ambiguous Showcase",
        sourceContentType: "unknown",
        releaseDate: "2026-07-03"
      })
    ])
  })

  it("ignores dated rows from unrelated tables", () => {
    const rows = parseHuluSchedule(`
      <html>
        <body>
          <table>
            <tr><th>Foo</th><th>Bar</th></tr>
            <tr>
              <td>July 9</td>
              <td>Random Movie</td>
            </tr>
          </table>
          <table>
            <tr><th>Date</th><th>Title</th><th>Network</th><th>Status</th></tr>
            <tr>
              <td>July 10</td>
              <td>Only Murders in the Building: Season 5 Premiere</td>
              <td>Hulu Original</td>
              <td>Premiere</td>
            </tr>
          </table>
        </body>
      </html>
    `, "https://press.hulu.com/schedule/", 2026)

    expect(rows).toEqual([
      expect.objectContaining({
        title: "Only Murders in the Building",
        titleAliases: ["Only Murders in the Building: Season 5 Premiere"],
        sourceContentType: "series",
        releaseDate: "2026-07-10",
        labels: ["Hulu Original", "Premiere"]
      })
    ])
  })

  it("parses the live Hulu schedule table header shape", () => {
    const rows = parseHuluSchedule(`
      <html>
        <body>
          <article>
            <table>
              <thead>
                <tr>
                  <td>Date</td>
                  <td>Show</td>
                  <td>Category</td>
                  <td>Status</td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-sort="1782864000"><span data-month="July"></span> July 1</td>
                  <td>GMA First Listen: Complete Season 1</td>
                  <td>ABC News</td>
                  <td>Added</td>
                </tr>
                <tr>
                  <td data-sort="1782864000"><span data-month="July"></span> July 1</td>
                  <td>Bad Boys (1995)</td>
                  <td></td>
                  <td>Added</td>
                </tr>
              </tbody>
            </table>
          </article>
        </body>
      </html>
    `, "https://press.hulu.com/schedule/", 2026)

    expect(rows).toEqual([
      expect.objectContaining({
        title: "GMA First Listen",
        titleAliases: ["GMA First Listen: Complete Season 1"],
        sourceContentType: "series",
        releaseDate: "2026-07-01"
      }),
      expect.objectContaining({
        title: "Bad Boys",
        titleAliases: ["Bad Boys (1995)"],
        originalReleaseYear: 1995,
        sourceContentType: "movie",
        releaseDate: "2026-07-01",
        releasePattern: "catalog_addition"
      })
    ])
  })

  it("throws when the schedule page contains no usable dated rows", () => {
    expect(() => parseHuluSchedule("<html><table></table></html>", "https://press.hulu.com/schedule/", 2026))
      .toThrow("Hulu schedule 没有可解析条目")
  })
})

describe("Hulu adapter", () => {
  it("fetches the official schedule and maps only classifiable dated rows", async () => {
    const fetchText = vi.fn(async () => scheduleHtml)
    const adapter = createHuluAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      settings: fakeSettings({ HTTPS_PROXY: "http://proxy.test:7890" }),
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    const batch = await adapter.fetchItems()
    const items = batch.items

    expect(fetchText).toHaveBeenCalledWith(
      "hulu",
      "https://press.hulu.com/schedule/",
      expect.objectContaining({
        timeoutMs: 30000,
        settingsOverride: expect.objectContaining({
          HTTPS_PROXY: "http://proxy.test:7890",
          SOURCE_HULU_PROXY_MODE: "inherit"
        })
      })
    )
    expect(batch.completeReleaseSources).toEqual(["hulu"])
    expect(batch.completeMediaSources).toEqual(["hulu"])
    expect(items).toHaveLength(2)
    expect(items[0].media).toMatchObject({
      source: "hulu",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "The Bear",
      titleAliases: ["The Bear: Complete Season 5"],
      originalLanguage: null,
      firstReleaseDate: null
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "Hulu",
      region: "US",
      releaseDate: "2026-07-01",
      releaseStatus: "airing_today",
      sourceUrl: "https://press.hulu.com/schedule/"
    })
    expect(items[0].popularitySignals).toEqual([])
  })
})
