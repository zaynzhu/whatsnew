import { classifyMedia } from "../domain/mediaClassifier.js"
import type { AdapterItem, PopularitySignalInput, ReleaseInput } from "../domain/types.js"
import { normalizeDoubanPosterUrl } from "../utils/doubanPosterUrl.js"

type DoubanChartItem = {
  rating?: [string, string] | null
  rank?: number
  cover_url?: string
  is_playable?: boolean
  id?: string
  types?: string[]
  regions?: string[]
  title?: string
  url?: string
}

type DoubanMobilePerson = {
  name?: string
}

type DoubanMobileSubject = {
  id?: string
  title?: string
  type?: string
  subtype?: string
  cover_url?: string
  card_subtitle?: string | null
  directors?: DoubanMobilePerson[]
  actors?: DoubanMobilePerson[]
  genres?: string[]
  pic?: {
    large?: string
    normal?: string
  }
  pubdate?: string[]
  release_date?: string | null
  rating?: {
    value?: number
    count?: number
  } | null
  url?: string
  year?: string
  intro?: string | null
  wish_count?: number | null
}

type DoubanComingSoonPage = {
  start?: number
  count?: number
  total?: number
  subjects?: DoubanMobileSubject[]
}

function absoluteUrl(value: string | null | undefined): string | null {
  const text = (value ?? "").trim()
  return text || null
}

function compactTexts(values: (string | null | undefined)[]): string[] {
  return [...new Set(values
    .map((value) => (value ?? "").trim())
    .filter(Boolean))]
}

function normalizeDate(value: string | null | undefined): string | null {
  const match = (value ?? "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!match) return null

  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
}

function releaseDateFromSubject(item: DoubanMobileSubject, today: string): string | null {
  const direct = normalizeDate(item.release_date)
  if (direct) return direct

  for (const pubdate of item.pubdate ?? []) {
    const parsed = normalizeDate(pubdate)
    if (parsed && parsed >= today) return parsed
  }

  return null
}

function regionFromPubdate(pubdate: string | null | undefined): string | null {
  const match = (pubdate ?? "").match(/\(([^)]+)\)/)
  const region = match?.[1]?.trim()
  if (!region || /电影节|影展/.test(region)) return null
  return region
}

function regionsFromSubject(item: DoubanMobileSubject, groupTitle: string): string[] {
  const pubdateRegions = compactTexts((item.pubdate ?? []).map(regionFromPubdate))
  if (pubdateRegions.length > 0) return pubdateRegions

  const subtitleParts = compactTexts((item.card_subtitle ?? "").split("/"))
  if (subtitleParts.length >= 2) return compactTexts(subtitleParts[1].split(/\s+/))

  if (groupTitle.includes("国内")) return ["中国大陆"]
  return []
}

function primaryRegion(item: DoubanMobileSubject, groupTitle: string): string {
  return regionsFromSubject(item, groupTitle)[0] ?? (groupTitle.includes("国内") ? "中国大陆" : "GLOBAL")
}

function releaseStatus(releaseDate: string | null, today: string): string {
  if (!releaseDate) return "announced"
  if (releaseDate > today) return "upcoming"
  if (releaseDate === today) return "airing_today"
  return "available"
}

function mediaStatus(releaseDate: string | null, today: string): "upcoming" | "released" | "unknown" {
  if (!releaseDate) return "upcoming"
  return releaseDate > today ? "upcoming" : "released"
}

function sourceContentType(item: DoubanMobileSubject): string {
  if (item.subtype === "tv" || item.type === "tv") return "剧集"
  return "电影"
}

function posterUrlFromSubject(item: DoubanMobileSubject): string | null {
  return normalizeDoubanPosterUrl(item.cover_url)
    ?? normalizeDoubanPosterUrl(item.pic?.large)
    ?? normalizeDoubanPosterUrl(item.pic?.normal)
}

function releaseFromSubject(
  item: DoubanMobileSubject,
  groupTitle: string,
  releaseDate: string | null,
  today: string
): ReleaseInput {
  return {
    platform: "豆瓣",
    region: primaryRegion(item, groupTitle),
    releaseDate,
    releaseTime: null,
    releasePattern: item.subtype === "tv" || item.type === "tv" ? "tv_coming_soon" : "theatrical_coming_soon",
    releaseStatus: releaseStatus(releaseDate, today),
    seasonNumber: null,
    episodeNumber: null,
    source: "douban",
    sourceUrl: absoluteUrl(item.url)
  }
}

function upcomingSignalFromSubject(
  item: DoubanMobileSubject,
  index: number,
  groupTitle: string
): PopularitySignalInput {
  const wishCount = typeof item.wish_count === "number" && item.wish_count > 0 ? item.wish_count : null
  const ratingCount = typeof item.rating?.count === "number" && item.rating.count > 0 ? item.rating.count : null

  return {
    source: "douban_upcoming",
    sourceCategory: "chinese_interest",
    platform: "豆瓣",
    region: primaryRegion(item, groupTitle),
    window: groupTitle,
    rank: index + 1,
    rankDelta: null,
    value: wishCount ?? ratingCount,
    valueLabel: wishCount != null ? "豆瓣想看" : ratingCount != null ? "豆瓣评分人数" : "豆瓣即将播出排序",
    sourceUrl: absoluteUrl(item.url)
  }
}

function upcomingHotSignalFromSubject(
  item: DoubanMobileSubject,
  index: number,
  kind: "movie" | "tv",
  groupTitle: string
): PopularitySignalInput {
  const wishCount = typeof item.wish_count === "number" && item.wish_count > 0 ? item.wish_count : null

  return {
    source: "douban_upcoming_hot",
    sourceCategory: "chinese_interest",
    platform: "豆瓣",
    region: primaryRegion(item, groupTitle),
    window: "upcoming",
    rankingScope: kind === "movie" ? "movie" : "series",
    rank: index + 1,
    rankDelta: null,
    value: wishCount,
    valueLabel: wishCount != null ? "豆瓣想看" : "豆瓣热门排序",
    sourceUrl: absoluteUrl(item.url)
  }
}

function mobileSubjectToAdapterItem(
  item: DoubanMobileSubject,
  groupTitle: string,
  index: number,
  today: string
): AdapterItem | null {
  const title = item.title?.trim()
  const doubanId = item.id?.trim()
  if (!title || !doubanId) return null

  const contentType = sourceContentType(item)
  const genres = item.genres ?? []
  const classification = classifyMedia({
    source: "douban",
    sourceContentType: contentType,
    genres
  })
  const releaseDate = releaseDateFromSubject(item, today)

  return {
    media: {
      source: "douban",
      sourceId: `douban-${doubanId}`,
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: contentType,
      titleDisplay: title,
      titleOriginal: title,
      titleAliases: [],
      overview: item.intro?.trim() || null,
      posterUrl: posterUrlFromSubject(item),
      productionCountries: regionsFromSubject(item, groupTitle),
      originalLanguage: null,
      genres,
      firstReleaseDate: releaseDate,
      status: mediaStatus(releaseDate, today),
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [releaseFromSubject(item, groupTitle, releaseDate, today)],
    popularitySignals: [upcomingSignalFromSubject(item, index, groupTitle)]
  }
}

function toAdapterItem(item: DoubanChartItem): AdapterItem {
  const title = item.title ?? ""
  const doubanId = item.id ?? ""
  const ratingValue = item.rating?.[0] ? Number(item.rating[0]) : null
  const regions = item.regions ?? []
  const types = item.types ?? []
  const classification = classifyMedia({
    source: "douban",
    sourceContentType: "电影",
    genres: types
  })

  const signal: PopularitySignalInput | null = ratingValue != null
    ? {
        source: "douban_top",
        sourceCategory: "chinese_reputation",
        platform: "豆瓣",
        region: "CN",
        window: "current",
        rank: typeof item.rank === "number" ? item.rank : null,
        rankDelta: null,
        value: ratingValue,
        valueLabel: "豆瓣评分",
        sourceUrl: absoluteUrl(item.url)
      }
    : null

  return {
    media: {
      source: "douban",
      sourceId: `douban-${doubanId}`,
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: "电影",
      titleDisplay: title,
      titleOriginal: title,
      titleAliases: [],
      overview: null,
      posterUrl: normalizeDoubanPosterUrl(item.cover_url),
      productionCountries: regions,
      originalLanguage: null,
      genres: types,
      firstReleaseDate: null,
      status: "unknown",
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    // 豆瓣 TOP250 是口碑评分源，不提供上线日期，不输出 release
    releases: [],
    popularitySignals: signal ? [signal] : []
  }
}

// 解析豆瓣电影 TOP250 chart JSON。type=24 为 TOP250 主榜，interval_id=100:90 取高分段。
// 只输出 media 与评分 popularity signal，不输出 release。
export function parseDoubanChart(json: string): AdapterItem[] {
  let list: DoubanChartItem[]
  try {
    list = JSON.parse(json) as DoubanChartItem[]
  } catch {
    return []
  }

  if (!Array.isArray(list)) return []
  return list
    .filter((item) => item.title && item.id)
    .map((item) => toAdapterItem(item))
}

export function parseDoubanComingSoonPage(
  json: string,
  kind: "movie" | "tv",
  today: string,
  rankOffset = 0
): { items: AdapterItem[], total: number, count: number } {
  let page: DoubanComingSoonPage
  try {
    page = JSON.parse(json) as DoubanComingSoonPage
  } catch {
    return { items: [], total: 0, count: 0 }
  }

  const subjects = Array.isArray(page.subjects) ? page.subjects : []
  const groupTitle = kind === "movie" ? "豆瓣电影即将上映" : "豆瓣剧集即将播出"
  return {
    items: subjects
      .map((item, index) => mobileSubjectToAdapterItem(item, groupTitle, rankOffset + index, today))
      .filter((item): item is AdapterItem => Boolean(item)),
    total: typeof page.total === "number" ? page.total : subjects.length,
    count: subjects.length
  }
}

export function parseDoubanComingSoonHotPage(
  json: string,
  kind: "movie" | "tv",
  today: string
): AdapterItem[] {
  let page: DoubanComingSoonPage
  try {
    page = JSON.parse(json) as DoubanComingSoonPage
  } catch {
    return []
  }

  const subjects = Array.isArray(page.subjects) ? page.subjects : []
  const groupTitle = kind === "movie" ? "豆瓣电影热门待映" : "豆瓣剧集热门待播"
  return subjects
    .flatMap((item, index): AdapterItem[] => {
      const parsed = mobileSubjectToAdapterItem(item, groupTitle, index, today)
      if (!parsed) return []
      return [{
        ...parsed,
        releases: [],
        popularitySignals: [upcomingHotSignalFromSubject(item, index, kind, groupTitle)]
      }]
    })
}
