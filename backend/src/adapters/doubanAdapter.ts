import type { AdapterItem, SourceAdapter, SourceFetchBatch } from "../domain/types.js"
import { parseDoubanChart } from "./doubanParser.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type DoubanAdapterOptions = {
  url?: string
  minIntervalMs?: number
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

// 豆瓣电影 TOP250 主榜（type=24），只取高分段前 20 条作为口碑评分样本，低频同步控制反爬风险
const DOUBAN_CHART_URL = "https://movie.douban.com/j/chart/top_list"
const DOUBAN_TYPE = "24"
const DOUBAN_LIMIT = 20
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const DOUBAN_TIMEOUT_MS = 30000
const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 WhatsNewBot/0.1",
  "referer": "https://movie.douban.com/",
  "accept": "application/json"
}

export function createDoubanAdapter(options: DoubanAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings

  return {
    source: "douban",
    async fetchItems(): Promise<SourceFetchBatch> {
      const currentSettings = settings.view()
      const baseUrl = (options.url ?? currentSettings.get("DOUBAN_BASE_URL")) || DOUBAN_CHART_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "douban")
      const url = `${baseUrl}?type=${DOUBAN_TYPE}&interval_id=100%3A90&action=&start=0&limit=${DOUBAN_LIMIT}`
      const json = await limiter.run(() => httpClient.fetchText("douban", url, {
        headers: REQUEST_HEADERS,
        timeoutMs: DOUBAN_TIMEOUT_MS,
        settingsOverride
      }))
      const items: AdapterItem[] = parseDoubanChart(json)

      // TOP250 是完整榜单（高分段），下一次同步不在榜的 signal 转为历史
      return { items, completePopularitySources: ["douban_top"] }
    }
  }
}

export const doubanAdapter = createDoubanAdapter()