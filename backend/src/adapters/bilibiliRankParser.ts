import { classifyMedia } from "../domain/mediaClassifier.js"
import type { AdapterItem, PopularitySignalInput, ReleaseInput } from "../domain/types.js"

type BiliStat = {
  view?: number | null
  follow?: number | null
  danmaku?: number | null
} | null

type BiliNewEp = {
  index_show?: string | null
} | null

type BiliRankVideo = {
  rank?: number
  title?: string
  season_id?: number | string
  cover?: string | null
  url?: string | null
  rating?: string | null
  badge?: string | null
  new_ep?: BiliNewEp
  stat?: BiliStat
  desc?: string | null
}

type BiliRankData = {
  code?: number
  data?: {
    list?: BiliRankVideo[]
    note?: string
  }
}

// season_type → 来源原始分类，用于 sourceContentType 与 productionCountries 推断
const SEASON_TYPE_CATEGORY: Record<number, string> = {
  1: "番剧",
  4: "国创",
  3: "纪录片"
}

function parseRating(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : null
}

function parseEpisodeNumber(indexShow: string | null | undefined): number | null {
  if (!indexShow) return null
  const match = indexShow.match(/第(\d+)话/) || indexShow.match(/全(\d+)话/)
  return match ? Number(match[1]) : null
}

function statusFromIndexShow(indexShow: string | null | undefined): "upcoming" | "ongoing" | "ended" | "unknown" {
  const text = indexShow ?? ""
  if (/完结|全\d+话/.test(text)) return "ended"
  if (/更新/.test(text)) return "ongoing"
  if (/即将|预告/.test(text)) return "upcoming"
  return "unknown"
}

function releaseStatusFromStatus(status: "upcoming" | "ongoing" | "ended" | "unknown"): string {
  if (status === "ended") return "ended"
  if (status === "upcoming") return "upcoming"
  if (status === "ongoing") return "available"
  return "unknown"
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}

function absoluteUrl(value: string | null | undefined): string | null {
  const text = (value ?? "").trim()
  if (!text) return null
  if (text.startsWith("//")) return `https:${text}`
  return text
}

function videoToAdapterItem(video: BiliRankVideo, seasonType: number): AdapterItem {
  const category = SEASON_TYPE_CATEGORY[seasonType] ?? "影视"
  const classification = classifyMedia({
    source: "bilibili",
    sourceContentType: category,
    genres: [category]
  })
  const indexShow = video.new_ep?.index_show ?? null
  const status = statusFromIndexShow(indexShow)
  const seasonId = String(video.season_id ?? "")
  const rank = typeof video.rank === "number" ? video.rank : null
  const view = video.stat?.view ?? null

  return {
    media: {
      source: "bilibili",
      sourceId: `bilibili-${seasonId}`,
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: category,
      titleDisplay: video.title ?? seasonId,
      titleOriginal: video.title ?? null,
      titleAliases: [],
      overview: cleanText(video.desc),
      posterUrl: absoluteUrl(video.cover),
      // 国创为中国作品；番剧/纪录片地区未知，不假设
      productionCountries: seasonType === 4 ? ["CN"] : [],
      originalLanguage: seasonType === 4 ? "zh" : null,
      genres: [category],
      firstReleaseDate: null,
      status,
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [buildRelease(video, status, seasonId)],
    popularitySignals: [buildSignal(video, rank, view)]
  }
}

function buildRelease(video: BiliRankVideo, status: "upcoming" | "ongoing" | "ended" | "unknown", seasonId: string): ReleaseInput {
  const indexShow = video.new_ep?.index_show ?? null
  return {
    platform: "哔哩哔哩",
    region: "CN",
    releaseDate: null,
    releaseTime: null,
    // 番剧/国创多为周更，纪录片不定；保留 weekly 作为粗略口径
    releasePattern: "weekly",
    releaseStatus: releaseStatusFromStatus(status),
    seasonNumber: null,
    episodeNumber: parseEpisodeNumber(indexShow),
    source: "bilibili",
    sourceUrl: absoluteUrl(video.url)
  }
}

function buildSignal(video: BiliRankVideo, rank: number | null, view: number | null): PopularitySignalInput {
  return {
    source: "bilibili_rank",
    sourceCategory: "official_platform",
    platform: "哔哩哔哩",
    region: "CN",
    window: "current",
    rank,
    rankDelta: null,
    value: view,
    valueLabel: view != null ? "B站播放量" : "B站榜单",
    sourceUrl: absoluteUrl(video.url)
  }
}

// 解析 B站 pgc 季度排行榜 JSON。榜单无日期，release 不带 releaseDate；
// 完整快照语义由 adapter 通过 completePopularitySources 声明。
export function parseBilibiliRank(json: string, seasonType: number): AdapterItem[] {
  let data: BiliRankData
  try {
    data = JSON.parse(json) as BiliRankData
  } catch {
    return []
  }

  if (data?.code !== 0) return []
  const list = data?.data?.list ?? []
  return list
    .filter((video) => video.title && video.season_id)
    .map((video) => videoToAdapterItem(video, seasonType))
}