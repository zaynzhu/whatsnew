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
import { parseDisneyPlusNewReleases } from "./disneyPlusParser.js"

export type DisneyPlusAdapterOptions = {
  url?: string
  minIntervalMs?: number
  today?: () => string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const DISNEY_PLUS_URL = "https://www.disneyplus.com/explore/articles/new-to-disney-plus"
const DISNEY_PLUS_TIMEOUT_MS = 30000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const USER_AGENT_HEADERS = { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }

const CONFIG: PlatformAdapterConfig = {
  source: "disney_plus",
  platform: "Disney+",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: DISNEY_PLUS_URL
}

function todayLocalDate(): string {
  const date = new Date()

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

export function createDisneyPlusAdapter(options: DisneyPlusAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const today = options.today ?? todayLocalDate

  return {
    source: "disney_plus",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_DISNEY_PLUS_BASE_URL")) || DISNEY_PLUS_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "disney_plus")
      const html = await limiter.run(() => httpClient.fetchText("disney_plus", url, {
        timeoutMs: DISNEY_PLUS_TIMEOUT_MS,
        settingsOverride,
        headers: USER_AGENT_HEADERS
      }))
      const todayValue = today()
      const candidates = parseDisneyPlusNewReleases(html, url, Number(todayValue.slice(0, 4)))

      const items = candidates
        .map((candidate) => candidateToAdapterItem({ ...CONFIG, sourceUrl: url }, candidate, todayValue))
        .filter((item): item is NonNullable<typeof item> => item != null)

      return {
        items,
        completeMediaSources: ["disney_plus"],
        completeReleaseSources: ["disney_plus"]
      }
    }
  }
}

export const disneyPlusAdapter = createDisneyPlusAdapter()
