import type {
  ContentAttentionCategory,
  ContentWeightView
} from "@whatsnew/shared/settings"
import type { SettingsReader } from "./runtimeSettingsService.js"

export type ContentWeightDefinition = {
  category: ContentAttentionCategory
  key: string
  label: string
  description: string
  defaultValue: number
}

export const CONTENT_WEIGHT_DEFINITIONS: ContentWeightDefinition[] = [
  {
    category: "scripted",
    key: "ATTENTION_WEIGHT_SCRIPTED",
    label: "电影与剧情剧",
    description: "电影、剧情连续剧、网络剧和短剧",
    defaultValue: 100
  },
  {
    category: "animation",
    key: "ATTENTION_WEIGHT_ANIMATION",
    label: "动画",
    description: "动画电影、动画连续剧和番剧",
    defaultValue: 90
  },
  {
    category: "documentary",
    key: "ATTENTION_WEIGHT_DOCUMENTARY",
    label: "纪录片",
    description: "纪录电影与纪录剧集",
    defaultValue: 45
  },
  {
    category: "reality_variety",
    key: "ATTENTION_WEIGHT_REALITY_VARIETY",
    label: "真人秀与综艺",
    description: "真人秀、综艺和竞演节目",
    defaultValue: 45
  },
  {
    category: "talk_game",
    key: "ATTENTION_WEIGHT_TALK_GAME",
    label: "谈话与游戏节目",
    description: "脱口秀、访谈、游戏和问答节目",
    defaultValue: 20
  },
  {
    category: "news",
    key: "ATTENTION_WEIGHT_NEWS",
    label: "新闻节目",
    description: "晨间新闻、新闻简报和时事节目",
    defaultValue: 5
  },
  {
    category: "sports",
    key: "ATTENTION_WEIGHT_SPORTS",
    label: "体育节目",
    description: "体育直播、赛事集锦和体育谈话节目",
    defaultValue: 5
  }
]

function normalizedWeight(value: string, fallback: number): number {
  if (!value.trim()) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) return fallback
  return parsed
}

export function contentWeightMap(settings: SettingsReader): Record<ContentAttentionCategory, number> {
  return Object.fromEntries(CONTENT_WEIGHT_DEFINITIONS.map((definition) => [
    definition.category,
    normalizedWeight(settings.get(definition.key), definition.defaultValue)
  ])) as Record<ContentAttentionCategory, number>
}

export function contentWeightViews(settings: SettingsReader): ContentWeightView[] {
  const weights = contentWeightMap(settings)
  return CONTENT_WEIGHT_DEFINITIONS.map((definition) => ({
    ...definition,
    value: weights[definition.category]
  }))
}
