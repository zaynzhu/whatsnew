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
  parseAppleTvPlusNewsFeed,
  parseAppleTvPlusPressArticle,
  type AppleTvPressCandidate
} from "./appleTvPlusParser.js"

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
  defaultLanguage: null,
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

function mediaStatus(releaseDate: string | null, today: string) {
  if (!releaseDate) return "unknown" as const
  return releaseDate > today ? "upcoming" as const : "released" as const
}

function releaseStatus(releaseDate: string, today: string) {
  if (releaseDate > today) return "upcoming"
  if (releaseDate === today) return "airing_today"
  return "available"
}

function candidateItem(candidate: AppleTvPressCandidate, today: string) {
  const publishedDate = candidate.publishedAt.slice(0, 10)
  const item = candidateToAdapterItem(CONFIG, { ...candidate, releaseDate: publishedDate }, today)
  if (!item) return null

  const releaseDate = candidate.releaseDate
  return {
    ...item,
    media: {
      ...item.media,
      firstReleaseDate: releaseDate,
      status: mediaStatus(releaseDate, today)
    },
    releases: releaseDate ? [{
      ...item.releases[0],
      releaseDate,
      releasePattern: "platform_premiere",
      releaseStatus: releaseStatus(releaseDate, today)
    }] : [],
    popularitySignals: [{
      source: "apple_tv_plus_news",
      sourceCategory: "news_signal",
      platform: "Apple TV+",
      region: "US",
      window: "latest",
      rankingScope: "news",
      rankingEntryKey: item.media.sourceId,
      rank: null,
      rankDelta: null,
      value: null,
      valueLabel: "官方资讯",
      sourceUrl: candidate.sourceUrl,
      capturedAt: new Date(candidate.publishedAt)
    }]
  }
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
      const fetchPage = (targetUrl: string) => limiter.run(() => httpClient.fetchText("apple_tv_plus", targetUrl, {
        timeoutMs: APPLE_TV_PLUS_TIMEOUT_MS,
        settingsOverride,
        headers: USER_AGENT_HEADERS
      }))
      const xml = await fetchPage(url)
      const todayValue = today()
      const fallbackYear = Number(todayValue.slice(0, 4))
      const feedCandidates = parseAppleTvPlusNewsFeed(xml, url, fallbackYear)
      const relevantCandidates = feedCandidates.filter((candidate) => (
        candidateToAdapterItem(CONFIG, { ...candidate, releaseDate: candidate.publishedAt.slice(0, 10) }, todayValue)
      ))
      const candidates: AppleTvPressCandidate[] = []
      for (const candidate of relevantCandidates) {
        const articleHtml = candidate.sourceUrl === url ? "" : await fetchPage(candidate.sourceUrl)
        candidates.push(articleHtml
          ? parseAppleTvPlusPressArticle(candidate, articleHtml, fallbackYear)
          : candidate)
      }

      const items = candidates
        .map((candidate) => candidateItem(candidate, todayValue))
        .filter((item): item is NonNullable<typeof item> => item != null)

      if (items.length === 0) throw new Error("Apple TV+ RSS 没有可同步的影视资讯")

      return {
        items,
        completePopularitySources: ["apple_tv_plus_news"]
      }
    }
  }
}

export const appleTvPlusAdapter = createAppleTvPlusAdapter()
