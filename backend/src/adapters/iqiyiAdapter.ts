import type { ReleaseForm } from "@whatsnew/shared/media"
import { classifyMedia } from "../domain/mediaClassifier.js"
import type { AdapterItem, PopularitySignalInput, ReleaseInput, SourceAdapter } from "../domain/types.js"
import { RateLimiter } from "../utils/rateLimiter.js"

type IqiyiVideo = {
  name?: string
  desc?: string | null
  cid?: number | string | null
  pageUrl?: string | null
  imageUrl?: string | null
  thumbnail?: string | null
  publishText?: string | null
  id?: number | string | null
  sub?: {
    count?: number | null
  } | null
  isOnline?: boolean | null
  star?: Array<{
    name?: string | null
  }>
}

type IqiyiNuxtData = {
  data?: Array<{
    allVideos?: IqiyiVideo[]
  }>
}

type IqiyiAdapterOptions = {
  url?: string
  minIntervalMs?: number
  today?: () => string
}

const IQIYI_NEW_ONLINE_URL = "https://www.iqiyi.com/newOnlinePCW"
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const IQIYI_TIMEOUT_MS = 30000
const CID_TO_CATEGORY: Record<string, string> = {
  "1": "电影",
  "2": "电视剧",
  "3": "纪录片",
  "4": "动漫",
  "6": "综艺",
  "15": "少儿",
  "35": "短剧",
  "37": "漫剧"
}

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

function absoluteUrl(value: string | null | undefined): string | null {
  const text = cleanText(value)
  if (!text) return null
  if (text.startsWith("//")) return `https:${text}`
  if (text.startsWith("/")) return `https://www.iqiyi.com${text}`

  return text
}

function categoryFromCid(cid: number | string | null | undefined): string {
  return CID_TO_CATEGORY[String(cid)] ?? "影视"
}

function extractNuxtData(html: string): IqiyiNuxtData | null {
  const marker = "window.__NUXT__="
  const start = html.indexOf(marker)
  if (start < 0) return null

  const valueStart = start + marker.length
  const end = html.indexOf("</script>", valueStart)
  if (end < 0) return null

  const raw = html.slice(valueStart, end).trim().replace(/;$/, "")

  try {
    return Function(`"use strict";return (${raw})`)() as IqiyiNuxtData
  } catch {
    return null
  }
}

function videosFromNuxt(data: IqiyiNuxtData | null): IqiyiVideo[] {
  return data?.data?.[0]?.allVideos?.filter((video) => video.name && video.id) ?? []
}

function parseReleaseDate(publishText: string | null | undefined, today: string): string | null {
  const text = cleanText(publishText)
  if (!text) return null

  const match = text.match(/(\d{1,2})月(\d{1,2})日/)
  if (!match) return null

  return `${today.slice(0, 4)}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`
}

function mediaStatus(video: IqiyiVideo, releaseDate: string | null, today: string): "upcoming" | "released" | "unknown" {
  if (video.isOnline) return "released"
  if (releaseDate && releaseDate > today) return "upcoming"
  if (releaseDate && releaseDate <= today) return "released"

  return "unknown"
}

function releaseStatus(status: "upcoming" | "released" | "unknown", releaseDate: string | null, today: string): string {
  if (releaseDate === today) return "airing_today"
  if (status === "upcoming") return "upcoming"
  if (status === "released") return "available"

  return "unknown"
}

function releaseFormForIqiyi(category: string, releaseForm: ReleaseForm): ReleaseForm {
  if (releaseForm === "tv_series") return "web_series"

  if (category === "漫剧") return "animated_series"

  return releaseForm
}

function releaseFromVideo(video: IqiyiVideo, status: "upcoming" | "released" | "unknown", releaseDate: string | null, today: string): ReleaseInput {
  return {
    platform: "爱奇艺",
    region: "CN",
    releaseDate,
    releaseTime: null,
    releasePattern: "streaming_release",
    releaseStatus: releaseStatus(status, releaseDate, today),
    seasonNumber: null,
    episodeNumber: null,
    source: "iqiyi",
    sourceUrl: absoluteUrl(video.pageUrl)
  }
}

function signalFromVideo(video: IqiyiVideo, index: number): PopularitySignalInput | null {
  const count = video.sub?.count ?? null
  if (count == null) return null

  return {
    source: "iqiyi_reserve",
    sourceCategory: "official_platform",
    platform: "爱奇艺",
    region: "CN",
    window: "current",
    rank: index,
    rankDelta: null,
    value: count,
    valueLabel: "iQIYI reservations",
    sourceUrl: absoluteUrl(video.pageUrl)
  }
}

function videoToAdapterItem(video: IqiyiVideo, index: number, today: string): AdapterItem {
  const category = categoryFromCid(video.cid)
  const classification = classifyMedia({
    source: "iqiyi",
    sourceContentType: category,
    genres: [category]
  })
  const releaseForm = releaseFormForIqiyi(category, classification.releaseForm)
  const releaseDate = parseReleaseDate(video.publishText, today)
  const status = mediaStatus(video, releaseDate, today)
  const signal = signalFromVideo(video, index)

  return {
    media: {
      source: "iqiyi",
      sourceId: `iqiyi-${video.id}`,
      mediaType: classification.mediaType,
      releaseForm,
      sourceContentType: category,
      titleDisplay: video.name!,
      titleOriginal: video.name!,
      titleAliases: [],
      overview: cleanText(video.desc),
      posterUrl: absoluteUrl(video.thumbnail) ?? absoluteUrl(video.imageUrl),
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
    releases: [releaseFromVideo(video, status, releaseDate, today)],
    popularitySignals: signal ? [signal] : []
  }
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 WhatsNewBot/0.1"
      }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`)
    }

    return response.text()
  } finally {
    clearTimeout(timeout)
  }
}

export function createIqiyiAdapter(options: IqiyiAdapterOptions = {}): SourceAdapter {
  const url = options.url ?? IQIYI_NEW_ONLINE_URL
  const today = options.today ?? todayLocalDate
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)

  return {
    source: "iqiyi",
    async fetchItems() {
      const currentDate = today()
      const html = await limiter.run(() => fetchText(url, IQIYI_TIMEOUT_MS))
      const videos = videosFromNuxt(extractNuxtData(html))

      return videos.map((video, index) => videoToAdapterItem(video, index + 1, currentDate))
    }
  }
}

export const iqiyiAdapter = createIqiyiAdapter()
