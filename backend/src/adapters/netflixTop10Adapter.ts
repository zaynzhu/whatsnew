import type { ReleaseForm } from "@whatsnew/shared/media"
import type { AdapterItem, SourceAdapter } from "../domain/types.js"
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

type NetflixTop10AdapterOptions = {
  url?: string
  minIntervalMs?: number
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const NETFLIX_TOP10_URL = "https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx"
const NETFLIX_TIMEOUT_MS = 10000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
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

function rowToAdapterItem(row: NetflixTop10Row, sourceUrl: string): AdapterItem | null {
  const classification = CATEGORY_TYPES[row.category]
  if (!classification) return null

  return {
    media: {
      source: "netflix",
      sourceId: `netflix:${row.category}:${row.showTitle}:${row.seasonTitle ?? ""}`,
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: row.category,
      titleDisplay: row.showTitle,
      titleOriginal: null,
      titleAliases: validSeasonTitle(row.seasonTitle),
      overview: null,
      posterUrl: null,
      productionCountries: [],
      originalLanguage: classification.originalLanguage,
      genres: [],
      firstReleaseDate: null,
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
      rank: row.weeklyRank,
      rankDelta: null,
      value: row.weeklyViews,
      valueLabel: valueLabel(row),
      sourceUrl,
      capturedAt: new Date(`${row.week}T00:00:00.000Z`)
    }]
  }
}

export function createNetflixTop10Adapter(
  options: NetflixTop10AdapterOptions = {}
): SourceAdapter {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)

  return {
    source: "netflix",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_NETFLIX_BASE_URL"))
        || NETFLIX_TOP10_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "netflix")
      const buffer = await limiter.run(() => httpClient.fetchBuffer("netflix", url, {
        timeoutMs: NETFLIX_TIMEOUT_MS,
        settingsOverride
      }))
      const rows = await parseNetflixTop10Workbook(buffer)

      return rows
        .map((row) => rowToAdapterItem(row, url))
        .filter((item): item is AdapterItem => item != null)
    }
  }
}

export const netflixTop10Adapter = createNetflixTop10Adapter()
