import { classifyMedia } from "../domain/mediaClassifier.js"
import type { AdapterItem, PopularitySignalInput } from "../domain/types.js"

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

function absoluteUrl(value: string | null | undefined): string | null {
  const text = (value ?? "").trim()
  return text || null
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
      posterUrl: absoluteUrl(item.cover_url),
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