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
import { parseMaxWhatsNew } from "./maxPressParser.js"

export type MaxAdapterOptions = {
  url?: string
  minIntervalMs?: number
  today?: () => string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const MAX_PRESS_URL = "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july"
const MAX_TIMEOUT_MS = 30000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const USER_AGENT_HEADERS = { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }

const CONFIG: PlatformAdapterConfig = {
  source: "max",
  platform: "Max",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: MAX_PRESS_URL
}

function todayLocalDate(): string {
  const date = new Date()

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

export function createMaxAdapter(options: MaxAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const today = options.today ?? todayLocalDate

  return {
    source: "max",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_MAX_BASE_URL")) || MAX_PRESS_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "max")
      const html = await limiter.run(() => httpClient.fetchText("max", url, {
        timeoutMs: MAX_TIMEOUT_MS,
        settingsOverride,
        headers: USER_AGENT_HEADERS
      }))
      const todayValue = today()
      const candidates = parseMaxWhatsNew(html, url, Number(todayValue.slice(0, 4)))

      const items = candidates
        .map((candidate) => candidateToAdapterItem({ ...CONFIG, sourceUrl: url }, candidate, todayValue))
        .filter((item): item is NonNullable<typeof item> => item != null)

      return {
        items,
        completeMediaSources: ["max"],
        completeReleaseSources: ["max"]
      }
    }
  }
}

export const maxAdapter = createMaxAdapter()
