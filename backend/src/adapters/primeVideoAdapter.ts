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
import {
  findLatestPrimeVideoArticle,
  isPrimeVideoMonthlyArticle,
  parsePrimeVideoMonthlyArticle
} from "./primeVideoParser.js"

export type PrimeVideoAdapterOptions = {
  url?: string
  minIntervalMs?: number
  today?: () => string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const PRIME_VIDEO_INDEX_URL = "https://www.aboutamazon.com/news/entertainment"
const PRIME_VIDEO_TIMEOUT_MS = 30000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const USER_AGENT_HEADERS = { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }

const CONFIG: PlatformAdapterConfig = {
  source: "prime_video",
  platform: "Prime Video",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: PRIME_VIDEO_INDEX_URL
}

function todayLocalDate(): string {
  const date = new Date()

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

export function createPrimeVideoAdapter(options: PrimeVideoAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const today = options.today ?? todayLocalDate

  return {
    source: "prime_video",
    async fetchItems() {
      const currentSettings = settings.view()
      const entryUrl = (options.url ?? currentSettings.get("SOURCE_PRIME_VIDEO_BASE_URL")) || PRIME_VIDEO_INDEX_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "prime_video")
      const fetchPage = (url: string) => limiter.run(() => httpClient.fetchText("prime_video", url, {
        timeoutMs: PRIME_VIDEO_TIMEOUT_MS,
        settingsOverride,
        headers: USER_AGENT_HEADERS
      }))
      const entryHtml = await fetchPage(entryUrl)
      const articleUrl = isPrimeVideoMonthlyArticle(entryHtml)
        ? entryUrl
        : findLatestPrimeVideoArticle(entryHtml, entryUrl)
      const articleHtml = articleUrl === entryUrl ? entryHtml : await fetchPage(articleUrl)
      const todayValue = today()
      const candidates = parsePrimeVideoMonthlyArticle(articleHtml, articleUrl)
      const items = candidates
        .map((candidate) => candidateToAdapterItem({ ...CONFIG, sourceUrl: articleUrl }, candidate, todayValue))
        .filter((item): item is NonNullable<typeof item> => item != null)

      if (items.length === 0) throw new Error("Prime Video 月度文章没有可同步的电影或剧集")

      return {
        items,
        completeMediaSources: ["prime_video"],
        completeReleaseSources: ["prime_video"]
      }
    }
  }
}

export const primeVideoAdapter = createPrimeVideoAdapter()
