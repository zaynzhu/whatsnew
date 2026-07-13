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
const PAGE_CATEGORY_KEYS: Record<string, string> = {
  "Films (English)": "ENGLISH_MOVIES",
  "Films (Non-English)": "NONENGLISH_MOVIES",
  "TV (English)": "ENGLISH_SERIES",
  "TV (Non-English)": "NONENGLISH_SERIES"
}

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

function pageWithRows(
  category: keyof typeof PAGE_CATEGORY_KEYS,
  options: { count?: number; week?: string; rawAtRank?: number } = {}
): string {
  const count = options.count ?? 10
  const isSeries = category.startsWith("TV (")
  const prefix = category === "Films (English)"
    ? "English Film"
    : category === "Films (Non-English)"
      ? "International Film"
      : category === "TV (English)"
        ? "English Series"
        : "International Series"
  const data = Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const rank = index + 1
    const isRaw = options.rawAtRank === rank
    const displayTitle = isRaw ? "Raw" : `${prefix} ${rank}`
    const title = isRaw
      ? "Raw: 2026 - June 29, 2026"
      : isSeries ? `${displayTitle}: Season 2` : displayTitle
    return [`item-${rank}`, {
      __typename: "PulseTop10ItemEntity",
      top10: {
        weekEndDate: options.week ?? "2026-07-05",
        category: PAGE_CATEGORY_KEYS[category],
        weeklyRank: rank,
        weeklyHoursViewed: 20_000_000 - rank,
        runtime: 2,
        weeklyViews: 10_000_000 - rank,
        cumulativeWeeksInTop10: rank,
        videoId: 81_000_000 + rank
      },
      top10Video: {
        title,
        releaseYear: 2026,
        shortSynopsis: `${displayTitle} synopsis`
      },
      displayVideo: {
        ...(isRaw ? {} : { title: displayTitle }),
        titlePageSlug: isRaw ? "/wwe-raw" : `/title-${rank}`
      },
      artwork: {
        sdpArt: {
          'urlsSized({"sizes":{"height":219,"width":390}})': [{
            url: `https://dnm.nflximg.net/${rank}.jpg`
          }]
        }
      }
    }]
  }))
  const payload = JSON.stringify({ data })
  const encoded = JSON.stringify(payload).slice(1, -1).replaceAll("'", "\\'")
  return `<script>netflix.reactContext.models.graphql = JSON.parse('${encoded}');</script>`
}

function categoryForPageUrl(url: string): keyof typeof PAGE_CATEGORY_KEYS {
  if (url.endsWith("/films-non-english")) return "Films (Non-English)"
  if (url.endsWith("/tv-non-english")) return "TV (Non-English)"
  if (url.endsWith("/tv")) return "TV (English)"
  return "Films (English)"
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
  it("maps four complete page categories with identity metadata", async () => {
    const httpClient = {
      fetchText: vi.fn(async (_source: string, url: string) => {
        const category = categoryForPageUrl(url)
        return pageWithRows(category, category === "TV (English)" ? { rawAtRank: 7 } : {})
      }),
      fetchBuffer: vi.fn()
    } as unknown as SourceHttpClient
    const adapter = createNetflixTop10Adapter({
      httpClient,
      settings: fakeSettings({ HTTPS_PROXY: "http://proxy.test:7890" }),
      minIntervalMs: 0
    })

    const batch = await adapter.fetchItems()
    const items = batch.items

    expect(items).toHaveLength(40)
    expect(items.slice(0, 20).every((item) => item.media.mediaType === "movie")).toBe(true)
    expect(items.slice(20).every((item) => item.media.mediaType === "series")).toBe(true)
    expect(items[20].media).toMatchObject({
      sourceId: "netflix:TV (English):English Series 1:English Series 1: Season 2",
      titleDisplay: "English Series 1",
      titleAliases: ["English Series 1: Season 2"],
      overview: "English Series 1 synopsis",
      firstReleaseDate: "2026",
      posterUrl: null
    })
    expect(items[20].popularitySignals[0]).toMatchObject({
      source: "netflix_top10",
      sourceCategory: "official_platform",
      platform: "Netflix",
      region: "GLOBAL",
      window: "week",
      rankingScope: "tv_english",
      rankingEntryKey: "netflix:TV (English):English Series 1:English Series 1: Season 2",
      rankingEntryLabel: "English Series 1: Season 2",
      rank: 1,
      value: 9_999_999,
      sourceUrl: "https://www.netflix.com/tudum/top10/tv",
      capturedAt: new Date("2026-07-05T00:00:00.000Z")
    })
    expect(items[20].popularitySignals[0].valueLabel).toContain("9,999,999 次观看")
    expect(items.find((item) => item.media.titleDisplay === "Raw")?.media.titleAliases).toEqual([
      "WWE Raw",
      "Raw: June 29, 2026"
    ])
    expect(items.find((item) => item.media.titleDisplay === "Raw")?.media.titleOriginal).toBe("WWE Raw")
    expect(httpClient.fetchText).toHaveBeenCalledTimes(4)
    expect(httpClient.fetchText).toHaveBeenNthCalledWith(
      4,
      "netflix",
      "https://www.netflix.com/tudum/top10/tv-non-english",
      {
        timeoutMs: 30000,
        settingsOverride: expect.objectContaining({
          HTTPS_PROXY: "http://proxy.test:7890",
          SOURCE_NETFLIX_PROXY_MODE: "inherit"
        })
      }
    )
    expect(httpClient.fetchBuffer).not.toHaveBeenCalled()
    expect(batch.completeMediaSources).toEqual(["netflix"])
    expect(batch.completePopularitySources).toEqual(["netflix_top10"])
  })

  it("falls back to the workbook when any page category is incomplete", async () => {
    const httpClient = {
      fetchText: vi.fn(async () => pageWithRows("Films (English)", { count: 9 })),
      fetchBuffer: vi.fn(async () => workbookBuffer())
    } as unknown as SourceHttpClient
    const adapter = createNetflixTop10Adapter({
      httpClient,
      settings: fakeSettings({}),
      minIntervalMs: 0,
      now: () => new Date("2026-06-21T00:00:00.000Z")
    })

    const items = (await adapter.fetchItems()).items

    expect(items).toHaveLength(4)
    expect(httpClient.fetchText).toHaveBeenCalledTimes(1)
    expect(httpClient.fetchBuffer).toHaveBeenCalledWith(
      "netflix",
      "https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx",
      expect.objectContaining({ timeoutMs: 10000 })
    )
    expect(items.every((item) => item.media.firstReleaseDate == null)).toBe(true)
  })

  it("rejects a stale workbook fallback instead of regressing the current snapshot", async () => {
    const httpClient = {
      fetchText: vi.fn(async () => pageWithRows("Films (English)", { count: 9 })),
      fetchBuffer: vi.fn(async () => workbookBuffer())
    } as unknown as SourceHttpClient
    const adapter = createNetflixTop10Adapter({
      httpClient,
      settings: fakeSettings({}),
      minIntervalMs: 0,
      now: () => new Date("2026-07-14T00:00:00.000Z")
    })

    await expect(adapter.fetchItems()).rejects.toThrow("Netflix Top 10 官方 XLSX 回退数据过旧")
  })

  it("starts consecutive page requests at least two seconds apart", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date("2026-06-21T00:00:10Z"))
    const starts: number[] = []
    const httpClient = {
      fetchText: vi.fn(async (_source: string, url: string) => {
        starts.push(Date.now())
        return pageWithRows(categoryForPageUrl(url))
      }),
      fetchBuffer: vi.fn()
    } as unknown as SourceHttpClient
    const adapter = createNetflixTop10Adapter({
      httpClient,
      settings: fakeSettings({})
    })

    const result = adapter.fetchItems()
    await vi.advanceTimersByTimeAsync(0)
    expect(starts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(starts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(starts).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(4000)
    await result

    expect(starts).toHaveLength(4)
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index] - starts[index - 1]).toBeGreaterThanOrEqual(2000)
    }
  })
})
