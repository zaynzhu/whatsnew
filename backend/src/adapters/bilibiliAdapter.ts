import type { AdapterItem, SourceAdapter, SourceFetchBatch } from "../domain/types.js"
import { parseBilibiliRank } from "./bilibiliRankParser.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type BilibiliAdapterOptions = {
  url?: string
  minIntervalMs?: number
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

// 番剧(1)、国创(4)、纪录片(3) 三个完整榜单，合并为一次同步输出
const BILIBILI_RANK_URL = "https://api.bilibili.com/pgc/season/rank/web/list"
const SEASON_TYPES = [1, 4, 3]
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const BILIBILI_TIMEOUT_MS = 30000
const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 WhatsNewBot/0.1",
  "referer": "https://www.bilibili.com/"
}

export function createBilibiliAdapter(options: BilibiliAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings

  return {
    source: "bilibili",
    async fetchItems(): Promise<SourceFetchBatch> {
      const currentSettings = settings.view()
      const baseUrl = (options.url ?? currentSettings.get("SOURCE_BILIBILI_BASE_URL")) || BILIBILI_RANK_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "bilibili")
      const items: AdapterItem[] = []

      for (const seasonType of SEASON_TYPES) {
        const url = `${baseUrl}?season_type=${seasonType}&day=3`
        const json = await limiter.run(() => httpClient.fetchText("bilibili", url, {
          headers: REQUEST_HEADERS,
          timeoutMs: BILIBILI_TIMEOUT_MS,
          settingsOverride
        }))
        items.push(...parseBilibiliRank(json, seasonType))
      }

      // 三个榜单都是完整排行，下一次同步不在榜的 signal 需要标记为历史
      return { items, completePopularitySources: ["bilibili_rank"] }
    }
  }
}

export const bilibiliAdapter = createBilibiliAdapter()