import ExcelJS from "exceljs"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createNetflixTop10Adapter
} from "../src/adapters/netflixTop10Adapter.js"
import {
  parseNetflixTop10Workbook
} from "../src/adapters/netflixTop10Parser.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

const COLUMNS = [
  "week",
  "category",
  "weekly_rank",
  "show_title",
  "season_title",
  "weekly_hours_viewed",
  "runtime",
  "weekly_views",
  "cumulative_weeks_in_top_10"
]

function fakeSettings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-whatsnew-env"), values)
}

async function workbookBuffer(options: {
  columns?: string[]
  rows?: unknown[][]
} = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Top 10")
  sheet.addRow(options.columns ?? COLUMNS)

  for (const row of options.rows ?? [
    ["2026-06-07", "Films (English)", 1, "Old Film", "N/A", 1_000, 1.5, 700, 1],
    ["2026-06-14", "Films (English)", 1, "Film One", "N/A", 20_000_000, 2, 10_000_000, 2],
    ["2026-06-14", "Films (Non-English)", 1, "Film Two", "", 18_000_000, 1.5, 12_000_000, 3],
    ["2026-06-14", "TV (English)", 1, "Series One", "Series One: Season 2", 25_000_000, 2, 12_500_000, 4],
    ["2026-06-14", "TV (Non-English)", 1, "Series Two", "N/A", 16_000_000, 1, 16_000_000, 1]
  ]) {
    sheet.addRow(row)
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("Netflix Top 10 parser", () => {
  it("returns only the latest week sorted by category and rank", async () => {
    const rows = await parseNetflixTop10Workbook(await workbookBuffer())

    expect(rows).toHaveLength(4)
    expect(rows.map((row) => row.category)).toEqual([
      "Films (English)",
      "Films (Non-English)",
      "TV (English)",
      "TV (Non-English)"
    ])
    expect(rows.every((row) => row.week === "2026-06-14")).toBe(true)
  })

  it("rejects a workbook with a missing required column", async () => {
    const columns = COLUMNS.filter((column) => column !== "weekly_views")
    await expect(parseNetflixTop10Workbook(
      await workbookBuffer({ columns, rows: [] })
    )).rejects.toThrow("Netflix Top 10 缺少列: weekly_views")
  })

  it("rejects workbooks without a valid week and invalid zip data", async () => {
    await expect(parseNetflixTop10Workbook(
      await workbookBuffer({ rows: [["", "Films (English)", 1, "No Week"]] })
    )).rejects.toThrow("Netflix Top 10 没有有效周次")
    await expect(parseNetflixTop10Workbook(Buffer.from("not-a-zip"))).rejects.toThrow(
      "Netflix Top 10 文件无法解析"
    )
  })
})

describe("Netflix Top 10 adapter", () => {
  it("maps all four official categories to movies and series", async () => {
    const httpClient = {
      fetchBuffer: vi.fn(async () => workbookBuffer())
    } as unknown as SourceHttpClient
    const adapter = createNetflixTop10Adapter({
      httpClient,
      settings: fakeSettings({ HTTPS_PROXY: "http://proxy.test:7890" }),
      minIntervalMs: 0
    })

    const items = await adapter.fetchItems()

    expect(items).toHaveLength(4)
    expect(items.map((item) => item.media.mediaType)).toEqual([
      "movie",
      "movie",
      "series",
      "series"
    ])
    expect(items.map((item) => item.media.releaseForm)).toEqual([
      "streaming_movie",
      "streaming_movie",
      "tv_series",
      "tv_series"
    ])
    expect(items[2].media.titleAliases).toEqual(["Series One: Season 2"])
    expect(items[2].popularitySignals[0]).toMatchObject({
      source: "netflix_top10",
      sourceCategory: "official_platform",
      platform: "Netflix",
      region: "GLOBAL",
      window: "week",
      rankingScope: "tv_english",
      rank: 1,
      value: 12_500_000,
      capturedAt: new Date("2026-06-14T00:00:00.000Z")
    })
    expect(items[2].popularitySignals[0].valueLabel).toContain("12,500,000 次观看")
    expect(httpClient.fetchBuffer).toHaveBeenCalledWith(
      "netflix",
      "https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx",
      {
        timeoutMs: 10000,
        settingsOverride: expect.objectContaining({
          HTTPS_PROXY: "http://proxy.test:7890",
          SOURCE_NETFLIX_PROXY_MODE: "inherit"
        })
      }
    )
  })

  it("starts consecutive downloads at least two seconds apart", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date("2026-06-21T00:00:10Z"))
    const starts: number[] = []
    const buffer = await workbookBuffer()
    const httpClient = {
      fetchBuffer: vi.fn(async () => {
        starts.push(Date.now())
        return buffer
      })
    } as unknown as SourceHttpClient
    const adapter = createNetflixTop10Adapter({
      httpClient,
      settings: fakeSettings({})
    })

    await adapter.fetchItems()
    const second = adapter.fetchItems()
    await vi.advanceTimersByTimeAsync(1999)
    expect(starts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await second

    expect(starts).toHaveLength(2)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(2000)
  })
})
