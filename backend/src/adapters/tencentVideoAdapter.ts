import type { ReleaseForm } from "@whatsnew/shared/media"
import { classifyMedia } from "../domain/mediaClassifier.js"
import type {
  AdapterItem,
  PopularitySignalInput,
  ReleaseInput,
  SourceAdapter,
  SourceFetchBatch
} from "../domain/types.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type TencentFeed = {
  category: "电视剧" | "电影"
  channelId: string
  upcomingFilter: string
}

type TencentPosterParams = {
  area_name?: string | null
  chnlist_search_label?: string | null
  cid?: string | null
  langue?: string | null
  leading_actor?: string | null
  main_genre?: string | null
  new_pic_vt?: string | null
  publish_date?: string | null
  second_title?: string | null
  title?: string | null
  year?: string | null
}

type TencentPageResponse = {
  ret?: number
  msg?: string
  data?: {
    modules?: unknown
    has_next_page?: boolean
    page_context?: Record<string, string>
  }
}

type TencentLabel = {
  category?: number | null
  label?: string | null
}

type TencentVideoAdapterOptions = {
  endpoint?: string
  feeds?: TencentFeed[]
  minIntervalMs?: number
  maxPages?: number
  httpClient?: Pick<SourceHttpClient, "fetchJson">
  settings?: RuntimeSettingsService
}

const DEFAULT_ENDPOINT = "https://pbaccess.video.qq.com/trpc.multi_vector_layout.mvl_controller.MVLPageHTTPService/getMVLPage?vversion_platform=2"
const DEFAULT_FEEDS: TencentFeed[] = [
  { category: "电视剧", channelId: "100113", upcomingFilter: "iyear=1" },
  { category: "电影", channelId: "100173", upcomingFilter: "iyear=999" }
]
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const TENCENT_TIMEOUT_MS = 30000
const MAX_PAGES = 20
const USER_AGENT_HEADERS = {
  "content-type": "application/json",
  origin: "https://v.qq.com",
  referer: "https://v.qq.com/",
  "user-agent": "Mozilla/5.0 WhatsNewBot/0.1"
}
const COUNTRY_CODES: Record<string, string> = {
  "内地": "CN",
  "中国香港": "HK",
  "中国台湾": "TW",
  "美国": "US",
  "英国": "GB",
  "加拿大": "CA",
  "日本": "JP",
  "韩国": "KR",
  "泰国": "TH",
  "新加坡": "SG"
}

function cleanText(value: string | null | undefined): string | null {
  return value?.trim() || null
}

function secureUrl(value: string | null | undefined): string | null {
  const url = cleanText(value)
  if (!url) return null
  if (url.startsWith("http://")) return `https://${url.slice("http://".length)}`

  return url
}

function sourceUrl(cid: string): string {
  return `https://v.qq.com/x/cover/${cid}.html`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function cardsByType<T>(value: unknown, type: string): T[] {
  if (Array.isArray(value)) return value.flatMap((item) => cardsByType<T>(item, type))
  if (!isRecord(value)) return []

  const current = value.type === type && isRecord(value.params) ? [value.params as T] : []
  return [...current, ...Object.values(value).flatMap((item) => cardsByType<T>(item, type))]
}

function validDate(value: string | null | undefined): string | null {
  const date = cleanText(value)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  return Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) ? date : null
}

function labelsFromCard(card: TencentPosterParams): TencentLabel[] {
  const raw = cleanText(card.chnlist_search_label)
  if (!raw) return []

  try {
    const labels = JSON.parse(raw)
    return Array.isArray(labels) ? labels : []
  } catch {
    return []
  }
}

function metricValue(text: string): number | null {
  const match = text.match(/预约(?:破|超)?\s*([\d.]+)\s*(亿|万)?/)
    ?? text.match(/([\d.]+)\s*(亿|万)?(?:人)?预约/)
  if (!match) return null

  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  const multiplier = match[2] === "亿" ? 100_000_000 : match[2] === "万" ? 10_000 : 1

  return Math.round(value * multiplier)
}

function reservationMetric(card: TencentPosterParams): { label: string, value: number } | null {
  for (const item of labelsFromCard(card)) {
    const label = cleanText(item.label)
    if (!label || (item.category !== 10 && !label.includes("预约"))) continue
    const value = metricValue(label)
    if (value != null) return { label, value }
  }

  return null
}

function languageCode(value: string | null | undefined): string | null {
  const language = cleanText(value)
  if (!language) return null
  if (/普通话|国语|中文/.test(language)) return "zh"
  if (/英语/.test(language)) return "en"
  if (/日语/.test(language)) return "ja"
  if (/韩语/.test(language)) return "ko"

  return null
}

function releaseFromCard(cid: string): ReleaseInput {
  return {
    platform: "腾讯视频",
    region: "CN",
    releaseDate: null,
    releaseTime: null,
    releasePattern: "streaming_release",
    releaseStatus: "upcoming",
    seasonNumber: null,
    episodeNumber: null,
    source: "tencent",
    sourceUrl: sourceUrl(cid)
  }
}

function signalFromCard(cid: string, card: TencentPosterParams): PopularitySignalInput | null {
  const metric = reservationMetric(card)
  if (!metric) return null

  return {
    source: "tencent_reserve",
    sourceCategory: "official_platform",
    platform: "腾讯视频",
    region: "CN",
    window: "upcoming",
    rank: null,
    rankDelta: null,
    value: metric.value,
    valueLabel: metric.label,
    sourceUrl: sourceUrl(cid)
  }
}

function itemFromCard(card: TencentPosterParams, feed: TencentFeed): AdapterItem | null {
  const cid = cleanText(card.cid)
  const title = cleanText(card.title)
  if (!cid || !title) return null

  const genres = [...new Set([cleanText(card.main_genre), feed.category].filter((value): value is string => Boolean(value)))]
  const classification = classifyMedia({
    source: "tencent",
    sourceContentType: feed.category,
    genres
  })
  const releaseForm: ReleaseForm = classification.releaseForm === "tv_series"
    ? "web_series"
    : classification.releaseForm
  const signal = signalFromCard(cid, card)
  const country = COUNTRY_CODES[cleanText(card.area_name) ?? ""]

  return {
    media: {
      source: "tencent",
      sourceId: `tencent-${cid}`,
      mediaType: classification.mediaType,
      releaseForm,
      sourceContentType: feed.category,
      titleDisplay: title,
      titleOriginal: title,
      titleAliases: [],
      overview: cleanText(card.second_title),
      posterUrl: secureUrl(card.new_pic_vt),
      productionCountries: country ? [country] : [],
      originalLanguage: languageCode(card.langue),
      genres,
      firstReleaseDate: validDate(card.publish_date),
      status: "upcoming",
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [releaseFromCard(cid)],
    popularitySignals: signal ? [signal] : []
  }
}

function hasExpectedUpcomingFilter(response: TencentPageResponse, feed: TencentFeed): boolean {
  const expectedValue = new URLSearchParams(feed.upcomingFilter).get("iyear")
  return cardsByType<Record<string, unknown>>(response.data?.modules, "searchlist_filter_card")
    .some((params) => params.filter_key === "iyear"
      && params.option_name === "即将上线"
      && String(params.option_value) === expectedValue)
}

function assignReservationRanks(items: AdapterItem[]) {
  items
    .flatMap((item) => item.popularitySignals)
    .filter((signal) => signal.source === "tencent_reserve" && signal.value != null)
    .sort((left, right) => (right.value ?? 0) - (left.value ?? 0))
    .forEach((signal, index) => {
      signal.rank = index + 1
    })
}

export function createTencentVideoAdapter(options: TencentVideoAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const feeds = options.feeds ?? DEFAULT_FEEDS
  const maxPages = options.maxPages ?? MAX_PAGES

  return {
    source: "tencent",
    async fetchItems() {
      const currentSettings = settings.view()
      const endpoint = options.endpoint
        ?? currentSettings.get("SOURCE_TENCENT_BASE_URL")
        ?? DEFAULT_ENDPOINT
      const settingsOverride = captureSourceProxySettings(currentSettings, "tencent")
      const items = new Map<string, AdapterItem>()

      for (const feed of feeds) {
        let pageContext: Record<string, string> | undefined
        let completed = false

        for (let page = 1; page <= maxPages; page += 1) {
          const body = {
            page_params: {
              page_type: "operation",
              page_id: "channel_list",
              channel_id: feed.channelId,
              filter_params: feed.upcomingFilter
            },
            ...(pageContext ? { page_context: pageContext } : {})
          }
          const response = await limiter.run(() => httpClient.fetchJson<TencentPageResponse>(
            "tencent",
            endpoint || DEFAULT_ENDPOINT,
            {
              method: "POST",
              headers: USER_AGENT_HEADERS,
              body: JSON.stringify(body),
              timeoutMs: TENCENT_TIMEOUT_MS,
              settingsOverride
            }
          ))

          if (response.ret !== 0 || !response.data?.modules) {
            throw new Error(`腾讯视频待播接口失败: ${response.msg || "invalid_response"}`)
          }
          if (page === 1 && !hasExpectedUpcomingFilter(response, feed)) {
            throw new Error(`腾讯视频“即将上线”筛选契约变化: channel=${feed.channelId}`)
          }

          const cards = cardsByType<TencentPosterParams>(response.data.modules, "searchlist_poster_card")
          if (page === 1 && cards.length === 0) {
            throw new Error(`腾讯视频待播片单为空: channel=${feed.channelId}`)
          }
          for (const card of cards) {
            const item = itemFromCard(card, feed)
            if (item) items.set(item.media.sourceId, item)
          }

          if (!response.data.has_next_page) {
            completed = true
            break
          }
          if (!response.data.page_context || Object.keys(response.data.page_context).length === 0) {
            throw new Error(`腾讯视频待播分页缺少上下文: channel=${feed.channelId}`)
          }
          pageContext = response.data.page_context
        }

        if (!completed) {
          throw new Error(`腾讯视频待播片单超过分页上限: channel=${feed.channelId}`)
        }
      }

      const currentItems = [...items.values()]
      assignReservationRanks(currentItems)

      return {
        items: currentItems,
        completeMediaSources: ["tencent"],
        completePopularitySources: ["tencent_reserve"],
        completeReleaseSources: ["tencent"]
      }
    }
  }
}

export const tencentVideoAdapter = createTencentVideoAdapter()
