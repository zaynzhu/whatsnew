import type { ReleaseForm } from "@whatsnew/shared/media"
import type { AdapterItem, SourceAdapter, SourceFetchBatch } from "../domain/types.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"
import {
  parseNetflixTop10Workbook,
  type NetflixTop10Row
} from "./netflixTop10Parser.js"
import {
  parseNetflixTop10Page,
  type NetflixTop10PageRow
} from "./netflixTop10PageParser.js"

type NetflixTop10AdapterOptions = {
  url?: string
  pageBaseUrl?: string
  minIntervalMs?: number
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
  now?: () => Date
}

const NETFLIX_TOP10_URL = "https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx"
const NETFLIX_TOP10_PAGE_BASE_URL = "https://www.netflix.com/tudum/top10"
const NETFLIX_TIMEOUT_MS = 10000
const NETFLIX_PAGE_TIMEOUT_MS = 30000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const NETFLIX_FALLBACK_MAX_AGE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_CATEGORIES = [
  { path: "", category: "Films (English)" },
  { path: "films-non-english", category: "Films (Non-English)" },
  { path: "tv", category: "TV (English)" },
  { path: "tv-non-english", category: "TV (Non-English)" }
] as const
const CATEGORY_TYPES: Record<string, {
  mediaType: "movie" | "series"
  releaseForm: ReleaseForm
  originalLanguage: string | null
  rankingScope: string
}> = {
  "Films (English)": {
    mediaType: "movie",
    releaseForm: "streaming_movie",
    originalLanguage: "en",
    rankingScope: "films_english"
  },
  "Films (Non-English)": {
    mediaType: "movie",
    releaseForm: "streaming_movie",
    originalLanguage: null,
    rankingScope: "films_non_english"
  },
  "TV (English)": {
    mediaType: "series",
    releaseForm: "tv_series",
    originalLanguage: "en",
    rankingScope: "tv_english"
  },
  "TV (Non-English)": {
    mediaType: "series",
    releaseForm: "tv_series",
    originalLanguage: null,
    rankingScope: "tv_non_english"
  }
}

type NetflixAdapterRow = NetflixTop10Row & {
  sourceUrl: string
  releaseYear: number | null
  synopsis: string | null
  titleOriginal: string | null
  titleAliases: string[]
}

function pageUrl(baseUrl: string, path: string): string {
  return path ? `${baseUrl.replace(/\/$/, "")}/${path}` : baseUrl.replace(/\/$/, "")
}

function validReleaseYear(value: number | null): string | null {
  if (value == null || !Number.isInteger(value) || value < 1888 || value > 2100) return null
  return String(value)
}

function assertFreshWorkbook(rows: NetflixTop10Row[], now: Date): void {
  const latestWeek = rows[0]?.week
  const capturedAt = latestWeek ? Date.parse(`${latestWeek}T00:00:00.000Z`) : Number.NaN
  if (!Number.isFinite(capturedAt) || now.getTime() - capturedAt > NETFLIX_FALLBACK_MAX_AGE_DAYS * DAY_MS) {
    throw new Error("Netflix Top 10 官方 XLSX 回退数据过旧")
  }
}

function seriesTitles(row: NetflixTop10PageRow): {
  showTitle: string
  seasonTitle: string | null
} {
  if (row.displayTitle && row.displayTitle !== row.showTitle) {
    return { showTitle: row.displayTitle, seasonTitle: row.showTitle }
  }

  const rawMatch = row.showTitle.match(/^Raw: (?:\d{4} - )?(.+)$/i)
  if (rawMatch) return { showTitle: "Raw", seasonTitle: `Raw: ${rawMatch[1]}` }

  const seasonMatch = row.showTitle.match(
    /^(.+): ((?:Season|Part|Volume|Book|Collection) \d+|Limited Series)$/i
  )
  if (seasonMatch) {
    return { showTitle: seasonMatch[1], seasonTitle: row.showTitle }
  }

  return { showTitle: row.showTitle, seasonTitle: null }
}

function pageRowToAdapterRow(row: NetflixTop10PageRow, sourceUrl: string): NetflixAdapterRow {
  const titles = row.category.startsWith("TV (")
    ? seriesTitles(row)
    : { showTitle: row.showTitle, seasonTitle: null }

  return {
    week: row.week,
    category: row.category,
    weeklyRank: row.weeklyRank,
    showTitle: titles.showTitle,
    seasonTitle: titles.seasonTitle,
    weeklyHoursViewed: row.weeklyHoursViewed,
    runtime: row.runtime,
    weeklyViews: row.weeklyViews,
    cumulativeWeeksInTop10: row.cumulativeWeeksInTop10,
    sourceUrl,
    releaseYear: row.releaseYear,
    synopsis: row.synopsis,
    titleOriginal: row.titlePageSlug === "/wwe-raw" ? "WWE Raw" : null,
    titleAliases: [
      ...(row.titlePageSlug === "/wwe-raw" ? ["WWE Raw"] : []),
      ...validSeasonTitle(titles.seasonTitle)
    ]
  }
}

function validatePageCategory(rows: NetflixTop10PageRow[], expectedCategory: string): void {
  const categoryRows = rows.filter((row) => row.category === expectedCategory)
  const ranks = categoryRows.map((row) => row.weeklyRank).sort((left, right) => left - right)
  if (categoryRows.length !== 10 || ranks.some((rank, index) => rank !== index + 1)) {
    throw new Error(`Netflix Top 10 页面榜单不完整: ${expectedCategory}`)
  }
}

function validSeasonTitle(value: string | null): string[] {
  if (!value || value.toUpperCase() === "N/A") return []
  return [value]
}

function numberLabel(value: number | null): string {
  return value == null ? "未知" : new Intl.NumberFormat("zh-CN").format(value)
}

function valueLabel(row: NetflixTop10Row): string {
  return `${numberLabel(row.weeklyViews)} 次观看 · ${numberLabel(row.weeklyHoursViewed)} 小时 · 累计 ${numberLabel(row.cumulativeWeeksInTop10)} 周`
}

function rowToAdapterItem(row: NetflixAdapterRow): AdapterItem | null {
  const classification = CATEGORY_TYPES[row.category]
  if (!classification) return null
  const sourceId = `netflix:${row.category}:${row.showTitle}:${row.seasonTitle ?? ""}`

  return {
    media: {
      source: "netflix",
      sourceId,
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: row.category,
      titleDisplay: row.showTitle,
      titleOriginal: row.titleOriginal,
      titleAliases: row.titleAliases,
      overview: row.synopsis,
      posterUrl: null,
      productionCountries: [],
      originalLanguage: classification.originalLanguage,
      genres: [],
      firstReleaseDate: validReleaseYear(row.releaseYear),
      status: "unknown",
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [],
    popularitySignals: [{
      source: "netflix_top10",
      sourceCategory: "official_platform",
      platform: "Netflix",
      region: "GLOBAL",
      window: "week",
      rankingScope: classification.rankingScope,
      rankingEntryKey: sourceId,
      rankingEntryLabel: row.seasonTitle,
      rank: row.weeklyRank,
      rankDelta: null,
      value: row.weeklyViews,
      valueLabel: valueLabel(row),
      sourceUrl: row.sourceUrl,
      capturedAt: new Date(`${row.week}T00:00:00.000Z`)
    }]
  }
}

export function createNetflixTop10Adapter(
  options: NetflixTop10AdapterOptions = {}
): SourceAdapter<SourceFetchBatch> {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)

  return {
    source: "netflix",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_NETFLIX_BASE_URL"))
        || NETFLIX_TOP10_URL
      const pageBaseUrl = options.pageBaseUrl ?? NETFLIX_TOP10_PAGE_BASE_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "netflix")
      let rows: NetflixAdapterRow[]

      try {
        const pageRows: NetflixAdapterRow[] = []
        for (const definition of PAGE_CATEGORIES) {
          const sourceUrl = pageUrl(pageBaseUrl, definition.path)
          const html = await limiter.run(() => httpClient.fetchText("netflix", sourceUrl, {
            timeoutMs: NETFLIX_PAGE_TIMEOUT_MS,
            settingsOverride
          }))
          const parsedRows = parseNetflixTop10Page(html)
          validatePageCategory(parsedRows, definition.category)
          pageRows.push(...parsedRows
            .filter((row) => row.category === definition.category)
            .map((row) => pageRowToAdapterRow(row, sourceUrl)))
        }

        const weeks = new Set(pageRows.map((row) => row.week))
        if (pageRows.length !== 40 || weeks.size !== 1) {
          throw new Error("Netflix Top 10 页面四类榜单周次不一致")
        }
        rows = pageRows
      } catch {
        const buffer = await limiter.run(() => httpClient.fetchBuffer("netflix", url, {
          timeoutMs: NETFLIX_TIMEOUT_MS,
          settingsOverride
        }))
        const workbookRows = await parseNetflixTop10Workbook(buffer)
        assertFreshWorkbook(workbookRows, options.now?.() ?? new Date())
        rows = workbookRows.map((row) => ({
          ...row,
          sourceUrl: url,
          releaseYear: null,
          synopsis: null,
          titleOriginal: null,
          titleAliases: validSeasonTitle(row.seasonTitle)
        }))
      }

      const items = rows
        .map(rowToAdapterItem)
        .filter((item): item is AdapterItem => item != null)

      return {
        items,
        completeMediaSources: ["netflix"],
        completePopularitySources: ["netflix_top10"]
      }
    }
  }
}

export const netflixTop10Adapter = createNetflixTop10Adapter()
