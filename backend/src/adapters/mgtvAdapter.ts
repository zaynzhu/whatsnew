import type { SourceAdapter, SourceFetchBatch } from "../domain/types.js"
import { parseMgtvChannel } from "./mgtvParser.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type MgtvAdapterOptions = {
  url?: string
  minIntervalMs?: number
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const MGTV_TV_URL = "https://www.mgtv.com/tv/"
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const MGTV_TIMEOUT_MS = 30000
const USER_AGENT_HEADERS = { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }

export function createMgtvAdapter(options: MgtvAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings

  return {
    source: "mgtv",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_MANGO_TV_BASE_URL")) || MGTV_TV_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "mango_tv")
      const html = await limiter.run(() => httpClient.fetchText("mango_tv", url, {
        headers: USER_AGENT_HEADERS,
        timeoutMs: MGTV_TIMEOUT_MS,
        settingsOverride
      }))

      const items = parseMgtvChannel(html)
      // 热播剧集是完整榜单，下一次同步不在榜的 signal 需要标记为历史
      return { items, completePopularitySources: ["mgtv_hot"] }
    }
  }
}

export const mgtvAdapter = createMgtvAdapter()