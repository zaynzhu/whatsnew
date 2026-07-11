import type { AdapterItem, SourceAdapter, SourceFetchBatch } from "../domain/types.js"
import { parseDoubanChart, parseDoubanMovieComingSoon, parseDoubanTvComingSoon } from "./doubanParser.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { formatLocalDate } from "../utils/date.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type DoubanAdapterOptions = {
  scope?: "all" | "upcoming"
  url?: string
  movieModulesUrl?: string
  tvModulesUrl?: string
  minIntervalMs?: number
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
  now?: Date
}

// 豆瓣电影 TOP250 主榜保留为口碑评分样本；移动端 Rexxar modules 负责“即将上映 / 即将播出”
const DOUBAN_CHART_URL = "https://movie.douban.com/j/chart/top_list"
const DOUBAN_MOVIE_MODULES_URL = "https://m.douban.com/rexxar/api/v2/movie/modules?need_manual_chart_card=1"
const DOUBAN_TV_MODULES_URL = "https://m.douban.com/rexxar/api/v2/tv/modules?need_manual_chart_card=1"
const DOUBAN_TYPE = "24"
const DOUBAN_LIMIT = 20
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const DOUBAN_TIMEOUT_MS = 30000
const CHART_REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 WhatsNewBot/0.1",
  "referer": "https://movie.douban.com/",
  "accept": "application/json"
}
const MOBILE_REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsNewBot/0.1",
  "referer": "https://m.douban.com/movie",
  "accept": "application/json, text/plain, */*"
}

function headersWithCookie(headers: Record<string, string>, cookie: string): Record<string, string> {
  const trimmedCookie = cookie.trim()
  return trimmedCookie ? { ...headers, cookie: trimmedCookie } : headers
}

export function createDoubanAdapter(options: DoubanAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings

  return {
    source: "douban",
    scope: options.scope === "upcoming" ? "upcoming" : undefined,
    async fetchItems(): Promise<SourceFetchBatch> {
      const currentSettings = settings.view()
      const baseUrl = (options.url ?? currentSettings.get("DOUBAN_BASE_URL")) || DOUBAN_CHART_URL
      const cookie = currentSettings.get("DOUBAN_COOKIE")
      const settingsOverride = captureSourceProxySettings(currentSettings, "douban")
      const chartUrl = `${baseUrl}?type=${DOUBAN_TYPE}&interval_id=100%3A90&action=&start=0&limit=${DOUBAN_LIMIT}`
      const chartJson = options.scope === "upcoming"
        ? null
        : await limiter.run(() => httpClient.fetchText("douban", chartUrl, {
            headers: headersWithCookie(CHART_REQUEST_HEADERS, cookie),
            timeoutMs: DOUBAN_TIMEOUT_MS,
            settingsOverride,
            sensitiveValues: [cookie]
          }))
      const movieModulesJson = await limiter.run(() => httpClient.fetchText("douban", options.movieModulesUrl ?? DOUBAN_MOVIE_MODULES_URL, {
        headers: headersWithCookie(MOBILE_REQUEST_HEADERS, cookie),
        timeoutMs: DOUBAN_TIMEOUT_MS,
        settingsOverride,
        sensitiveValues: [cookie]
      }))
      const tvModulesJson = await limiter.run(() => httpClient.fetchText("douban", options.tvModulesUrl ?? DOUBAN_TV_MODULES_URL, {
        headers: headersWithCookie({ ...MOBILE_REQUEST_HEADERS, referer: "https://m.douban.com/tv" }, cookie),
        timeoutMs: DOUBAN_TIMEOUT_MS,
        settingsOverride,
        sensitiveValues: [cookie]
      }))
      const today = formatLocalDate(options.now ?? new Date())
      const chartItems = chartJson ? parseDoubanChart(chartJson) : []
      const upcomingItems = [
        ...parseDoubanMovieComingSoon(movieModulesJson, today),
        ...parseDoubanTvComingSoon(tvModulesJson, today)
      ]
      const items: AdapterItem[] = [
        ...chartItems,
        ...upcomingItems
      ]
      const completePopularitySources = [
        ...(chartItems.length > 0 ? ["douban_top"] : []),
        ...(upcomingItems.length > 0 ? ["douban_upcoming"] : [])
      ]

      // 只有成功解析到条目时才声明完整快照，避免异常空响应误删旧排期
      return {
        items,
        completePopularitySources,
        completeReleaseSources: upcomingItems.length > 0 ? ["douban"] : []
      }
    }
  }
}

export const doubanAdapter = createDoubanAdapter()
export const doubanUpcomingAdapter = createDoubanAdapter({ scope: "upcoming" })
