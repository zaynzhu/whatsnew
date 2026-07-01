import type { SourceAdapter, SourceFetchBatch } from "../domain/types.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"
import {
  candidateToAdapterItem,
  type PlatformAdapterConfig
} from "./platformPageUtils.js"
import { parseAppleTvPlusNewsFeed } from "./appleTvPlusParser.js"

export type AppleTvPlusAdapterOptions = {
  url?: string
  minIntervalMs?: number
  today?: () => string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

// tv.apple.com collection 本地 HTTP 404，改用官方 Press RSS feed 作为 news_signal 来源
const APPLE_TV_PLUS_FEED_URL = "https://www.apple.com/tv-pr/news-feed.xml"
const APPLE_TV_PLUS_TIMEOUT_MS = 30000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const USER_AGENT_HEADERS = { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }

const CONFIG: PlatformAdapterConfig = {
  source: "apple_tv_plus",
  platform: "Apple TV+",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: APPLE_TV_PLUS_FEED_URL
}

function todayLocalDate(): string {
  const date = new Date()

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

export function createAppleTvPlusAdapter(options: AppleTvPlusAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const today = options.today ?? todayLocalDate

  return {
    source: "apple_tv_plus",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_APPLE_TV_PLUS_BASE_URL")) || APPLE_TV_PLUS_FEED_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "apple_tv_plus")
      const xml = await limiter.run(() => httpClient.fetchText("apple_tv_plus", url, {
        timeoutMs: APPLE_TV_PLUS_TIMEOUT_MS,
        settingsOverride,
        headers: USER_AGENT_HEADERS
      }))
      const todayValue = today()
      const candidates = parseAppleTvPlusNewsFeed(xml, url, Number(todayValue.slice(0, 4)))

      const items = candidates
        .map((candidate) => candidateToAdapterItem({ ...CONFIG, sourceUrl: url }, candidate, todayValue))
        .filter((item): item is NonNullable<typeof item> => item != null)

      return {
        items,
        completeReleaseSources: ["apple_tv_plus"]
      }
    }
  }
}

export const appleTvPlusAdapter = createAppleTvPlusAdapter()