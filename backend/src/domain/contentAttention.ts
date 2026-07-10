import type { ContentAttentionCategory } from "@whatsnew/shared/settings"
import { parseJsonArray } from "./normalizer.js"

export type AttentionMedia = {
  mediaType: string
  releaseForm: string
  sourceContentType: string | null
  genres: string | string[]
  heatScore: number
  posterUrl: string | null
}

function genreValues(genres: AttentionMedia["genres"]): string[] {
  return Array.isArray(genres) ? genres : parseJsonArray(genres)
}

export function contentAttentionCategory(media: AttentionMedia): ContentAttentionCategory {
  const text = [media.sourceContentType, ...genreValues(media.genres)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (text.includes("news") || text.includes("新闻") || text.includes("时事")) return "news"
  if (text.includes("sport") || text.includes("体育") || text.includes("赛事")) return "sports"
  if (
    text.includes("talk show")
    || text.includes("talk_show")
    || text.includes("game show")
    || text.includes("panel show")
    || text.includes("访谈")
    || text.includes("脱口秀")
    || text.includes("游戏节目")
  ) return "talk_game"
  if (
    media.mediaType === "variety"
    || text.includes("reality")
    || text.includes("variety")
    || text.includes("综艺")
    || text.includes("真人秀")
  ) return "reality_variety"
  if (media.mediaType === "documentary" || text.includes("documentary") || text.includes("纪录")) {
    return "documentary"
  }
  if (media.mediaType === "anime" || text.includes("animation") || text.includes("anime") || text.includes("动画")) {
    return "animation"
  }
  return "scripted"
}

export function contentAttentionWeight(
  media: AttentionMedia,
  weights: Record<ContentAttentionCategory, number>
): number {
  return weights[contentAttentionCategory(media)]
}

export function featuredScore(
  media: AttentionMedia,
  weights: Record<ContentAttentionCategory, number>,
  timingBoost: number
): number {
  const attention = contentAttentionWeight(media, weights)
  const posterBoost = media.posterUrl ? 5 : 0
  return attention * 0.7 + media.heatScore * 0.3 + timingBoost + posterBoost
}
