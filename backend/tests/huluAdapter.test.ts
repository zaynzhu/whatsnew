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
        title: "The Bear: Complete Season 5",
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

    const items = await adapter.fetchItems()

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
    expect(items).toHaveLength(2)
    expect(items[0].media).toMatchObject({
      source: "hulu",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "The Bear: Complete Season 5",
      firstReleaseDate: "2026-07-01"
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
