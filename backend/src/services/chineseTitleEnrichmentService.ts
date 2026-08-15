import type { MediaItem, PrismaClient } from "@prisma/client"
import { normalizeChineseTitle } from "../domain/chineseTitle.js"
import { ACTIVE_MEDIA_WHERE } from "../domain/mediaActivity.js"
import { mediaWorkKind } from "../domain/mediaWorkKind.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import {
  SourceHttpError,
  sourceHttpClient
} from "../utils/sourceHttpClient.js"

type TmdbMediaKind = "movie" | "tv"

type TmdbAlternativeTitle = {
  iso_3166_1?: string | null
  title?: string | null
}

type TmdbTitleDetail = {
  id: number
  title?: string | null
  name?: string | null
  alternative_titles?: {
    titles?: TmdbAlternativeTitle[]
    results?: TmdbAlternativeTitle[]
  }
}

type ChineseTitleEnrichmentOptions = {
  database?: Pick<PrismaClient, "mediaItem">
  settings?: RuntimeSettingsService
  httpClient?: Pick<typeof sourceHttpClient, "fetchJson">
  limit?: number
  now?: () => Date
  force?: boolean
}

export type ChineseTitleEnrichmentResult = {
  scanned: number
  enriched: number
  notFound: number
  failed: number
  samples: Array<{ title: string; titleChinese: string }>
  failures: Array<{ title: string; reason: string }>
}

const DEFAULT_TMDB_BASE_URL = "https://api.themoviedb.org/3"
const TMDB_TIMEOUT_MS = 30000
const TITLE_RETRY_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const REGION_PRIORITY = ["CN", "SG", "TW", "HK"]

function isBearerToken(credential: string): boolean {
  return credential.startsWith("eyJ") || credential.split(".").length === 3
}

function tmdbKind(item: Pick<MediaItem, "mediaType" | "releaseForm">): TmdbMediaKind {
  return mediaWorkKind(item) === "movie" ? "movie" : "tv"
}

function alternativeTitles(detail: TmdbTitleDetail): TmdbAlternativeTitle[] {
  return detail.alternative_titles?.titles ?? detail.alternative_titles?.results ?? []
}

export function chineseTitleFromTmdb(detail: TmdbTitleDetail): string | null {
  const primary = normalizeChineseTitle(detail.title ?? detail.name)
  if (primary) return primary

  const alternatives = alternativeTitles(detail)
  for (const region of REGION_PRIORITY) {
    const candidate = alternatives.find((item) => item.iso_3166_1 === region)
    const title = normalizeChineseTitle(candidate?.title)
    if (title) return title
  }

  return null
}

function failureReason(error: unknown): string {
  if (error instanceof SourceHttpError) return `TMDb HTTP ${error.statusCode}`
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
    return "TMDb 网络请求失败"
  }
  return "中文标题补全失败"
}

export async function enrichChineseTitles(
  options: ChineseTitleEnrichmentOptions = {}
): Promise<ChineseTitleEnrichmentResult> {
  if (!options.database) throw new Error("中文标题补全缺少数据库连接")
  const database = options.database
  const settings = options.settings ?? runtimeSettings
  const httpClient = options.httpClient ?? sourceHttpClient
  const currentSettings = settings.view()
  const apiKey = currentSettings.get("TMDB_API_KEY")
  if (!apiKey) throw new Error("TMDb 凭据未配置")

  const baseUrl = (currentSettings.get("TMDB_BASE_URL") || DEFAULT_TMDB_BASE_URL).replace(/\/$/, "")
  const settingsOverride = captureSourceProxySettings(currentSettings, "tmdb")
  const now = (options.now ?? (() => new Date()))()
  const retryBefore = new Date(now.getTime() - TITLE_RETRY_DAYS * DAY_MS)
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100))
  const candidates = await database.mediaItem.findMany({
    where: {
      AND: [
        ACTIVE_MEDIA_WHERE,
        { tmdbId: { not: null } },
        { OR: [{ titleChinese: null }, { titleChinese: "" }] },
        ...(!options.force ? [{
          OR: [
            { titleChineseCheckedAt: null },
            { titleChineseCheckedAt: { lt: retryBefore } }
          ]
        }] : [])
      ]
    },
    orderBy: [
      { heatScore: "desc" },
      { updatedAt: "desc" }
    ],
    select: {
      id: true,
      mediaType: true,
      releaseForm: true,
      titleDisplay: true,
      tmdbId: true
    }
  })
  const items = candidates
    .filter((item) => normalizeChineseTitle(item.titleDisplay) == null)
    .slice(0, limit)
  const result: ChineseTitleEnrichmentResult = {
    scanned: items.length,
    enriched: 0,
    notFound: 0,
    failed: 0,
    samples: [],
    failures: []
  }

  for (const item of items) {
    const kind = tmdbKind(item)
    try {
      const url = new URL(`${baseUrl}/${kind}/${item.tmdbId}`)
      const headers: Record<string, string> = {}
      if (isBearerToken(apiKey)) headers.Authorization = `Bearer ${apiKey}`
      else url.searchParams.set("api_key", apiKey)
      url.searchParams.set("language", "zh-CN")
      url.searchParams.set("append_to_response", "alternative_titles")

      const detail = await httpClient.fetchJson<TmdbTitleDetail>("tmdb", url.toString(), {
        headers,
        timeoutMs: TMDB_TIMEOUT_MS,
        settingsOverride,
        sensitiveValues: [apiKey]
      })
      const titleChinese = chineseTitleFromTmdb(detail)
      await database.mediaItem.update({
        where: { id: item.id },
        data: {
          titleChinese,
          titleChineseSource: titleChinese ? "tmdb:zh-CN" : null,
          titleChineseCheckedAt: now
        }
      })
      if (titleChinese) {
        result.enriched += 1
        if (result.samples.length < 10) {
          result.samples.push({ title: item.titleDisplay, titleChinese })
        }
      } else {
        result.notFound += 1
      }
    } catch (error) {
      if (error instanceof SourceHttpError && error.statusCode === 404) {
        await database.mediaItem.update({
          where: { id: item.id },
          data: { titleChineseCheckedAt: now }
        })
        result.notFound += 1
        continue
      }

      result.failed += 1
      if (result.failures.length < 10) {
        result.failures.push({
          title: item.titleDisplay,
          reason: failureReason(error)
        })
      }
    }
  }

  return result
}
