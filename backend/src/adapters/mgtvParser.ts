import type { ReleaseForm } from "@whatsnew/shared/media"
import { classifyMedia } from "../domain/mediaClassifier.js"
import type { AdapterItem, PopularitySignalInput, ReleaseInput } from "../domain/types.js"

type MgtvVideo = {
  name?: string
  subName?: string | null
  desc?: string | null
  videoUrl?: string | null
  jumpId?: string | number | null
  imgUrl?: string | null
  imgHUrl?: string | null
  imgHVUrl?: string | null
  updateInfo?: string | null
}

type MgtvModule = {
  moduleTitle?: string
  videoList?: MgtvVideo[]
}

type MgtvNuxtData = {
  data?: Array<{
    channelData?: {
      moduleList?: MgtvModule[]
    }
  }>
}

const HOT_DRAMA_MODULE = "热播剧集"
const NEW_DRAMA_MODULE = "新剧速递"

function extractNuxtData(html: string): MgtvNuxtData | null {
  const marker = "window.__NUXT__="
  const start = html.indexOf(marker)
  if (start < 0) return null

  const valueStart = start + marker.length
  const end = html.indexOf("</script>", valueStart)
  if (end < 0) return null

  const raw = html.slice(valueStart, end).trim().replace(/;$/, "")

  try {
    return Function(`"use strict";return (${raw})`)() as MgtvNuxtData
  } catch {
    return null
  }
}

function modulesFromNuxt(data: MgtvNuxtData | null): MgtvModule[] {
  return data?.data?.[0]?.channelData?.moduleList ?? []
}

function findModule(modules: MgtvModule[], title: string): MgtvModule | undefined {
  return modules.find((module) => module.moduleTitle === title)
}

function cleanName(value: string | null | undefined): string {
  // 芒果TV 的 name 字段常带 emoji 和宣传语，这里只剥离 emoji，保留原始口径文本
  return (value ?? "").replace(/\p{Extended_Pictographic}/gu, "").trim()
}

function absoluteUrl(value: string | null | undefined): string | null {
  const text = (value ?? "").trim()
  if (!text) return null
  if (text.startsWith("//")) return `https:${text}`

  return text
}

function pickPoster(video: MgtvVideo): string | null {
  return absoluteUrl(video.imgUrl) ?? absoluteUrl(video.imgHUrl) ?? absoluteUrl(video.imgHVUrl)
}

function releaseFormForMgtv(releaseForm: ReleaseForm): ReleaseForm {
  // 芒果TV 是网播平台，电视剧归入网络剧
  if (releaseForm === "tv_series") return "web_series"

  return releaseForm
}

function buildMedia(video: MgtvVideo) {
  const classification = classifyMedia({
    source: "mgtv",
    sourceContentType: "电视剧",
    genres: ["电视剧"]
  })
  const title = cleanName(video.name)

  return {
    source: "mgtv",
    sourceId: `mgtv-${video.jumpId}`,
    mediaType: classification.mediaType,
    releaseForm: releaseFormForMgtv(classification.releaseForm),
    sourceContentType: "电视剧",
    titleDisplay: title,
    titleOriginal: title,
    titleAliases: [],
    overview: (video.desc ?? "").trim() || null,
    posterUrl: pickPoster(video),
    productionCountries: ["CN"],
    originalLanguage: "zh",
    genres: ["电视剧"],
    firstReleaseDate: null,
    status: "unknown" as const,
    tmdbId: null,
    tvmazeId: null,
    imdbId: null,
    traktId: null,
    tvdbId: null
  }
}

function buildRelease(video: MgtvVideo): ReleaseInput {
  return {
    platform: "芒果TV",
    region: "CN",
    releaseDate: null,
    releaseTime: null,
    releasePattern: "streaming_release",
    // 新剧速递未提供日期，无法区分即将上线或已上线，保留 unknown
    releaseStatus: "unknown",
    seasonNumber: null,
    episodeNumber: null,
    source: "mgtv",
    sourceUrl: absoluteUrl(video.videoUrl)
  }
}

function buildSignal(video: MgtvVideo, rank: number): PopularitySignalInput {
  return {
    source: "mgtv_hot",
    sourceCategory: "official_platform",
    platform: "芒果TV",
    region: "CN",
    window: "current",
    rank,
    rankDelta: null,
    value: null,
    valueLabel: "芒果TV 热播剧集",
    sourceUrl: absoluteUrl(video.videoUrl)
  }
}

// 解析芒果TV 电视剧频道页的 __NUXT__ 数据：
// - "热播剧集" module 作为完整热度榜，输出 popularity signal 并标记为完整快照
// - "新剧速递" module 作为平台上新目录，输出无日期 release
// 同一 jumpId 在两个 module 中出现时合并到同一 AdapterItem
export function parseMgtvChannel(html: string): AdapterItem[] {
  const modules = modulesFromNuxt(extractNuxtData(html))
  const newDrama = findModule(modules, NEW_DRAMA_MODULE)
  const hotDrama = findModule(modules, HOT_DRAMA_MODULE)

  const itemsByJumpId = new Map<string, AdapterItem>()

  for (const video of newDrama?.videoList ?? []) {
    if (!video.jumpId || !video.name) continue
    itemsByJumpId.set(String(video.jumpId), {
      media: buildMedia(video),
      releases: [buildRelease(video)],
      popularitySignals: []
    })
  }

  for (const [index, video] of (hotDrama?.videoList ?? []).entries()) {
    if (!video.jumpId || !video.name) continue
    const key = String(video.jumpId)
    const existing = itemsByJumpId.get(key)
    const signal = buildSignal(video, index + 1)
    if (existing) {
      existing.popularitySignals.push(signal)
    } else {
      itemsByJumpId.set(key, {
        media: buildMedia(video),
        releases: [],
        popularitySignals: [signal]
      })
    }
  }

  return [...itemsByJumpId.values()]
}