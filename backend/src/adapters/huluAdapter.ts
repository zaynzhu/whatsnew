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
import { parseHuluSchedule } from "./huluScheduleParser.js"

export type HuluAdapterOptions = {
  url?: string
  minIntervalMs?: number
  today?: () => string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const HULU_SCHEDULE_URL = "https://press.hulu.com/schedule/"
const HULU_TIMEOUT_MS = 30000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const USER_AGENT_HEADERS = { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }

const CONFIG: PlatformAdapterConfig = {
  source: "hulu",
  platform: "Hulu",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: HULU_SCHEDULE_URL
}

function todayLocalDate(): string {
  const date = new Date()

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

export function createHuluAdapter(options: HuluAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const today = options.today ?? todayLocalDate

  return {
    source: "hulu",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_HULU_BASE_URL")) || HULU_SCHEDULE_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "hulu")
      const html = await limiter.run(() => httpClient.fetchText("hulu", url, {
        timeoutMs: HULU_TIMEOUT_MS,
        settingsOverride,
        headers: USER_AGENT_HEADERS
      }))
      const todayValue = today()
      const candidates = parseHuluSchedule(html, url, Number(todayValue.slice(0, 4)))

      const items = candidates
        .map((candidate) => candidateToAdapterItem({ ...CONFIG, sourceUrl: url }, candidate, todayValue))
        .filter((item): item is NonNullable<typeof item> => item != null)

      return {
        items,
        completeMediaSources: ["hulu"],
        completeReleaseSources: ["hulu"]
      }
    }
  }
}

export const huluAdapter = createHuluAdapter()
