import { classifyMedia } from "../domain/mediaClassifier.js"
import type { AdapterItem, PopularitySignalInput, ReleaseInput, SourceAdapter } from "../domain/types.js"
import type { ReleaseForm } from "@whatsnew/shared/media"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type YoukuTextMark = {
  text?: string | {
    title?: string | null
  } | null
} | null

type YoukuItem = {
  id?: number | string
  action_type?: string
  action_value?: string
  title?: string
  desc?: string | null
  subtitle?: string | null
  img?: string | null
  mark?: YoukuTextMark
  topLeftMark?: YoukuTextMark
  reserve?: {
    count?: number | null
  } | null
  trackShow?: {
    count?: number | null
  } | null
  previewInfo?: {
    hotPoint?: number | null
  } | null
  action?: {
    extra?: {
      category?: string | null
    } | null
  } | null
}

type YoukuComponent = {
  typeName?: string
  spmC?: string
  itemList?: YoukuItem[]
}

type YoukuInitialData = {
  moduleList?: Array<{
    components?: YoukuComponent[]
  }>
}

type YoukuPageConfig = {
  url: string
  fallbackCategory: string
}

type YoukuAdapterOptions = {
  pages?: YoukuPageConfig[]
  minIntervalMs?: number
  today?: () => string
  baseUrl?: string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const DEFAULT_PAGES: YoukuPageConfig[] = [
  { url: "https://tv.youku.com/", fallbackCategory: "电视剧" },
  { url: "https://movie.youku.com/", fallbackCategory: "电影" }
]
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const YOUKU_TIMEOUT_MS = 30000
const USER_AGENT_HEADERS = { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function todayLocalDate(): string {
  return formatLocalDate(new Date())
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()

  return trimmed || null
}

function markText(mark: YoukuTextMark | undefined): string | null {
  if (!mark?.text) return null
  if (typeof mark.text === "string") return cleanText(mark.text)

  return cleanText(mark.text.title)
}

function extractInitialData(html: string): YoukuInitialData | null {
  const marker = "window.__INITIAL_DATA__ ="
  const start = html.indexOf(marker)
  if (start < 0) return null

  const valueStart = start + marker.length
  const end = html.indexOf("</script>", valueStart)
  if (end < 0) return null

  const raw = html
    .slice(valueStart, end)
    .trim()
    .replace(/;$/, "")
    .replace(/:undefined/g, ":null")

  try {
    return JSON.parse(raw) as YoukuInitialData
  } catch {
    return null
  }
}

function allItems(data: YoukuInitialData | null, fallbackCategory: string): Array<{ item: YoukuItem, index: number, category: string }> {
  if (!data?.moduleList) return []

  const rows: Array<{ item: YoukuItem, index: number, category: string }> = []

  for (const module of data.moduleList) {
    for (const component of module.components ?? []) {
      for (const [index, item] of (component.itemList ?? []).entries()) {
        const category = cleanText(item.action?.extra?.category) ?? fallbackCategory
        if (!item.title || !item.action_value || item.action_type !== "JUMP_TO_SHOW") continue

        rows.push({ item, index: index + 1, category })
      }
    }
  }

  return rows
}

function sourceUrl(showId: string): string {
  return `https://www.youku.com/show_page/id_${showId}.html`
}

function parseReleaseDate(subtitle: string | null | undefined, today: string): { releaseDate: string | null, releaseTime: string | null } {
  const text = cleanText(subtitle)
  if (!text) return { releaseDate: null, releaseTime: null }

  const match = text.match(/(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/)
  if (!match) return { releaseDate: null, releaseTime: null }

  const year = today.slice(0, 4)
  const month = match[1].padStart(2, "0")
  const day = match[2].padStart(2, "0")
  const releaseTime = match[3] && match[4] ? `${match[3].padStart(2, "0")}:${match[4]}` : null

  return {
    releaseDate: `${year}-${month}-${day}`,
    releaseTime
  }
}

function mediaStatus(item: YoukuItem, releaseDate: string | null, today: string): "upcoming" | "released" | "ongoing" | "unknown" {
  const labels = [cleanText(item.subtitle), markText(item.mark), markText(item.topLeftMark)].filter(Boolean).join(" ")

  if (releaseDate && releaseDate > today) return "upcoming"
  if (labels.includes("预告") || labels.includes("预约") || labels.includes("上线")) {
    if (!releaseDate || releaseDate > today) return "upcoming"
  }
  if (labels.includes("有更新")) return "ongoing"
  if (labels.includes("首播") || labels.includes("新上线")) return "released"

  return "released"
}

function releaseStatus(status: "upcoming" | "released" | "ongoing" | "unknown", releaseDate: string | null, today: string): string {
  if (releaseDate === today) return "airing_today"
  if (status === "upcoming") return "upcoming"
  if (status === "ongoing") return "available"
  if (status === "released") return "available"

  return "unknown"
}

function releaseFromItem(item: YoukuItem, status: "upcoming" | "released" | "ongoing" | "unknown", today: string): ReleaseInput {
  const showId = item.action_value!
  const { releaseDate, releaseTime } = parseReleaseDate(item.subtitle, today)

  return {
    platform: "优酷",
    region: "CN",
    releaseDate,
    releaseTime,
    releasePattern: "streaming_release",
    releaseStatus: releaseStatus(status, releaseDate, today),
    seasonNumber: null,
    episodeNumber: null,
    source: "youku",
    sourceUrl: sourceUrl(showId)
  }
}

function signalFromItem(item: YoukuItem, index: number): PopularitySignalInput | null {
  const showId = item.action_value!
  const reserveCount = item.reserve?.count ?? null
  const hotPoint = item.previewInfo?.hotPoint ?? null
  const trackCount = item.trackShow?.count ?? null
  const value = reserveCount ?? hotPoint ?? trackCount
  if (value == null) return null

  return {
    source: reserveCount != null ? "youku_reserve" : "youku_hot",
    sourceCategory: "official_platform",
    platform: "优酷",
    region: "CN",
    window: "current",
    rank: index,
    rankDelta: null,
    value,
    valueLabel: reserveCount != null ? "Youku reservations" : "Youku heat",
    sourceUrl: sourceUrl(showId)
  }
}

function itemToAdapterItem(item: YoukuItem, index: number, category: string, today: string): AdapterItem {
  const showId = item.action_value!
  const { releaseDate } = parseReleaseDate(item.subtitle, today)
  const classification = classifyMedia({
    source: "youku",
    sourceContentType: category,
    genres: [category]
  })
  const status = mediaStatus(item, releaseDate, today)
  const signal = signalFromItem(item, index)
  const releaseForm: ReleaseForm = classification.releaseForm === "tv_series" ? "web_series" : classification.releaseForm

  return {
    media: {
      source: "youku",
      sourceId: `youku-${showId}`,
      mediaType: classification.mediaType,
      releaseForm,
      sourceContentType: category,
      titleDisplay: item.title!,
      titleOriginal: item.title!,
      titleAliases: [],
      overview: cleanText(item.desc),
      posterUrl: cleanText(item.img),
      productionCountries: ["CN"],
      originalLanguage: "zh",
      genres: [category],
      firstReleaseDate: releaseDate,
      status,
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [releaseFromItem(item, status, today)],
    popularitySignals: signal ? [signal] : []
  }
}

function mergeUniqueSignals(target: PopularitySignalInput[], signals: PopularitySignalInput[]) {
  const known = new Set(target.map((signal) => `${signal.source}:${signal.window}:${signal.rank}:${signal.value}`))

  for (const signal of signals) {
    const key = `${signal.source}:${signal.window}:${signal.rank}:${signal.value}`
    if (known.has(key)) continue

    target.push(signal)
    known.add(key)
  }
}

function mergeItem(items: Map<string, AdapterItem>, next: AdapterItem) {
  const current = items.get(next.media.sourceId)
  if (!current) {
    items.set(next.media.sourceId, next)
    return
  }

  current.media.genres = [...new Set([...current.media.genres, ...next.media.genres])]
  mergeUniqueSignals(current.popularitySignals, next.popularitySignals)

  const hasRelease = current.releases.some((release) => release.sourceUrl === next.releases[0]?.sourceUrl)
  if (!hasRelease) {
    current.releases.push(...next.releases)
  }
}

export function createYoukuAdapter(options: YoukuAdapterOptions = {}): SourceAdapter {
  const today = options.today ?? todayLocalDate
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings

  return {
    source: "youku",
    async fetchItems() {
      const currentSettings = settings.view()
      const configuredBaseUrl = options.baseUrl ?? currentSettings.get("SOURCE_YOUKU_BASE_URL")
      const pages = options.pages ?? (configuredBaseUrl
        ? [{ ...DEFAULT_PAGES[0], url: configuredBaseUrl }, DEFAULT_PAGES[1]]
        : DEFAULT_PAGES)
      const settingsOverride = captureSourceProxySettings(currentSettings, "youku")
      const currentDate = today()
      const items = new Map<string, AdapterItem>()

      for (const page of pages) {
        const html = await limiter.run(() => httpClient.fetchText("youku", page.url, {
          headers: USER_AGENT_HEADERS,
          timeoutMs: YOUKU_TIMEOUT_MS,
          settingsOverride
        }))
        const data = extractInitialData(html)

        for (const row of allItems(data, page.fallbackCategory)) {
          mergeItem(items, itemToAdapterItem(row.item, row.index, row.category, currentDate))
        }
      }

      return Array.from(items.values())
    }
  }
}

export const youkuAdapter = createYoukuAdapter()
