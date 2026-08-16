import type { PrismaClient } from "@prisma/client"
import { ACTIVE_MEDIA_WHERE } from "../domain/mediaActivity.js"
import { mediaWorkKind } from "../domain/mediaWorkKind.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import {
  SourceHttpClient,
  SourceHttpError,
  sourceHttpClient
} from "../utils/sourceHttpClient.js"
import {
  findRottenTomatoesPath,
  normalizeRottenTomatoesTitle,
  parseDoubanRating,
  parseOmdbRating,
  parseRottenTomatoesScores,
  parseTmdbRating,
  type ParsedOmdbRating,
  type ParsedRating
} from "./ratingParsers.js"

type RatingDatabase = Pick<PrismaClient, "mediaItem" | "mediaRating">
type RatingHttpClient = Pick<SourceHttpClient, "fetchJson" | "fetchText">
type RatingMediaKind = "movie" | "tv"

type RatingEnrichmentOptions = {
  limit?: number
  database?: RatingDatabase
  settings?: RuntimeSettingsService
  httpClient?: RatingHttpClient
  now?: () => Date
  force?: boolean
}

export type RatingEnrichmentFailure = {
  mediaId: string
  source: string
  reason: string
}

export type RatingEnrichmentResult = {
  scanned: number
  updated: number
  unchanged: number
  failed: number
  failures: RatingEnrichmentFailure[]
}

type Candidate = {
  id: string
  mediaType: string
  releaseForm: string
  titleDisplay: string
  titleOriginal: string | null
  status: string
  tmdbId: number | null
  imdbId: string | null
  sourceRefs: Array<{ source: string; sourceId: string }>
}

type TmdbDetail = {
  vote_average?: unknown
  vote_count?: unknown
  external_ids?: {
    imdb_id?: unknown
  }
}

type OmdbRatingWithTitle = ParsedOmdbRating & {
  sourceTitle: string | null
}

const DEFAULT_TMDB_BASE_URL = "https://api.themoviedb.org/3"
const DEFAULT_OMDB_BASE_URL = "https://www.omdbapi.com"
const DEFAULT_DOUBAN_DETAIL_BASE_URL = "https://m.douban.com/rexxar/api/v2"
const TMDB_TIMEOUT_MS = 30000
const OMDB_TIMEOUT_MS = 30000
const DOUBAN_TIMEOUT_MS = 30000
const ROTTEN_TOMATOES_TIMEOUT_MS = 30000
const DAY_MS = 24 * 60 * 60 * 1000
const ELIGIBLE_STATUSES = ["released", "ongoing", "returning", "ended"]
const IMDB_ID_PATTERN = /^tt\d+$/
const MOBILE_REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsNewBot/0.1",
  referer: "https://m.douban.com/movie",
  accept: "application/json, text/plain, */*"
}

function mediaKind(item: Pick<Candidate, "mediaType" | "releaseForm">): RatingMediaKind {
  return mediaWorkKind(item) === "movie" ? "movie" : "tv"
}

function imdbId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ""
  return IMDB_ID_PATTERN.test(normalized) ? normalized : null
}

function isBearerToken(value: string): boolean {
  return value.startsWith("eyJ") || value.split(".").length === 3
}

function sourceUrlForDouban(subjectId: string): string {
  return `https://movie.douban.com/subject/${subjectId}/`
}

function sourceUrlForImdb(id: string): string {
  return `https://www.imdb.com/title/${id}/`
}

function sourceUrlForTmdb(kind: RatingMediaKind, id: number): string {
  return `https://www.themoviedb.org/${kind === "movie" ? "movie" : "tv"}/${id}`
}

function headersWithCookie(cookie: string, kind: RatingMediaKind): Record<string, string> {
  const trimmedCookie = cookie.trim()
  const headers = {
    ...MOBILE_REQUEST_HEADERS,
    referer: kind === "tv" ? "https://m.douban.com/tv" : "https://m.douban.com/movie"
  }
  return trimmedCookie ? { ...headers, cookie: trimmedCookie } : headers
}

function failureReason(source: string, error: unknown): string {
  if (error instanceof SourceHttpError) return `${source} HTTP ${error.statusCode}`
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
    return `${source} 网络请求超时`
  }
  return `${source} 请求失败`
}

function addFailure(
  result: RatingEnrichmentResult,
  mediaId: string,
  source: string,
  error: unknown
): void {
  result.failed += 1
  if (result.failures.length >= 10) return
  result.failures.push({
    mediaId,
    source,
    reason: failureReason(source, error)
  })
}

function hasRating(rating: ParsedRating): rating is ParsedRating & { value: number } {
  return rating.value != null
}

async function upsertRating(
  database: RatingDatabase,
  mediaItemId: string,
  source: string,
  audience: string,
  rating: ParsedRating,
  scale: number,
  sourceUrl: string | null,
  capturedAt: Date
): Promise<boolean> {
  if (!hasRating(rating)) return false

  await database.mediaRating.upsert({
    where: {
      mediaItemId_source_audience: {
        mediaItemId,
        source,
        audience
      }
    },
    create: {
      mediaItemId,
      source,
      audience,
      value: rating.value,
      scale,
      voteCount: rating.voteCount,
      sourceUrl,
      capturedAt
    },
    update: {
      value: rating.value,
      scale,
      voteCount: rating.voteCount,
      sourceUrl,
      capturedAt
    }
  })
  return true
}

function candidateTitles(
  item: Pick<Candidate, "titleDisplay" | "titleOriginal">,
  omdbTitle: string | null
): string[] {
  return [...new Set([
    omdbTitle,
    item.titleOriginal,
    item.titleDisplay
  ].map((value) => value?.trim()).filter((value): value is string => (
    Boolean(value) && normalizeRottenTomatoesTitle(value ?? "").length > 0
  )))].slice(0, 3)
}

function shouldUseRottenTomatoesFallback(
  omdb: OmdbRatingWithTitle | null,
  directScores: ReturnType<typeof parseRottenTomatoesScores> | null
): boolean {
  return omdb?.rottenTomatoes != null
    && (directScores == null || directScores.critics == null)
}

export async function enrichRatings(
  options: RatingEnrichmentOptions = {}
): Promise<RatingEnrichmentResult> {
  if (!options.database) throw new Error("评分补全缺少数据库连接")

  const database = options.database
  const settings = options.settings ?? runtimeSettings
  const httpClient = options.httpClient ?? sourceHttpClient
  const currentSettings = settings.view()
  const now = (options.now ?? (() => new Date()))()
  const retryBefore = new Date(now.getTime() - DAY_MS)
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100))
  const fetchedCandidates = await database.mediaItem.findMany({
    where: {
      ...ACTIVE_MEDIA_WHERE,
      status: { in: ELIGIBLE_STATUSES },
      AND: [
        {
          OR: [
            { tmdbId: { not: null } },
            { imdbId: { not: null } },
            {
              sourceRefs: {
                some: {
                  source: "douban",
                  sourceId: { startsWith: "douban-" },
                  isActive: true
                }
              }
            }
          ]
        },
        ...(!options.force ? [{
          OR: [
            { ratingsCheckedAt: null },
            { ratingsCheckedAt: { lt: retryBefore } }
          ]
        }] : [])
      ]
    },
    select: {
      id: true,
      mediaType: true,
      releaseForm: true,
      titleDisplay: true,
      titleOriginal: true,
      status: true,
      tmdbId: true,
      imdbId: true,
      sourceRefs: {
        where: { isActive: true },
        select: { source: true, sourceId: true }
      }
    },
    orderBy: [
      { ratingsCheckedAt: "asc" },
      { heatScore: "desc" },
      { updatedAt: "desc" }
    ],
    take: Math.min(limit * 3, 300)
  }) as Candidate[]
  const candidates = fetchedCandidates.filter((candidate) => (
    candidate.tmdbId != null && candidate.tmdbId > 0
    || imdbId(candidate.imdbId) != null
    || candidate.sourceRefs.some((ref) => ref.source === "douban" && /^douban-\d+$/.test(ref.sourceId))
  )).slice(0, limit)

  const result: RatingEnrichmentResult = {
    scanned: candidates.length,
    updated: 0,
    unchanged: 0,
    failed: 0,
    failures: []
  }

  const tmdbApiKey = currentSettings.get("TMDB_API_KEY").trim()
  const tmdbBaseUrl = (currentSettings.get("TMDB_BASE_URL") || DEFAULT_TMDB_BASE_URL).replace(/\/$/, "")
  const tmdbSettingsOverride = captureSourceProxySettings(currentSettings, "tmdb")
  const omdbApiKey = currentSettings.get("OMDB_API_KEY").trim()
  const omdbBaseUrl = (currentSettings.get("OMDB_BASE_URL") || DEFAULT_OMDB_BASE_URL).replace(/\/$/, "")
  const imdbSettingsOverride = captureSourceProxySettings(currentSettings, "imdb")
  const doubanCookie = currentSettings.get("DOUBAN_COOKIE")
  const doubanSettingsOverride = captureSourceProxySettings(currentSettings, "douban")
  const configuredDoubanBase = currentSettings.get("DOUBAN_BASE_URL").replace(/\/$/, "")
  const doubanApiMarker = "/rexxar/api/v2"
  const doubanMarkerIndex = configuredDoubanBase.indexOf(doubanApiMarker)
  const doubanDetailBaseUrl = doubanMarkerIndex >= 0
    ? configuredDoubanBase.slice(0, doubanMarkerIndex + doubanApiMarker.length)
    : DEFAULT_DOUBAN_DETAIL_BASE_URL
  let doubanBlocked = false
  let rottenTomatoesBlocked = false

  const fetchTmdb = async (item: Candidate): Promise<TmdbDetail> => {
    const kind = mediaKind(item)
    const url = new URL(`${tmdbBaseUrl}/${kind}/${item.tmdbId}`)
    const headers: Record<string, string> = {}
    if (isBearerToken(tmdbApiKey)) headers.Authorization = `Bearer ${tmdbApiKey}`
    else url.searchParams.set("api_key", tmdbApiKey)
    url.searchParams.set("language", "zh-CN")
    url.searchParams.set("append_to_response", "external_ids")
    return httpClient.fetchJson<TmdbDetail>("tmdb", url.toString(), {
      headers,
      timeoutMs: TMDB_TIMEOUT_MS,
      settingsOverride: tmdbSettingsOverride,
      sensitiveValues: [tmdbApiKey]
    })
  }

  const fetchDouban = async (item: Candidate, subjectId: string): Promise<unknown> => {
    if (doubanBlocked) return null
    const kind = mediaKind(item) === "movie" ? "movie" : "tv"
    const url = `${doubanDetailBaseUrl}/${kind}/${encodeURIComponent(subjectId)}`
    try {
      return await httpClient.fetchJson<unknown>("douban", url, {
        headers: headersWithCookie(doubanCookie, kind),
        timeoutMs: DOUBAN_TIMEOUT_MS,
        retryAttempts: 1,
        settingsOverride: doubanSettingsOverride,
        sensitiveValues: [doubanCookie]
      })
    } catch (error) {
      if (error instanceof SourceHttpError && [403, 429].includes(error.statusCode)) {
        doubanBlocked = true
      }
      throw error
    }
  }

  const fetchOmdb = async (id: string): Promise<OmdbRatingWithTitle> => {
    const url = new URL(omdbBaseUrl)
    url.searchParams.set("i", id)
    url.searchParams.set("apikey", omdbApiKey)
    const payload = await httpClient.fetchJson<unknown>("imdb", url.toString(), {
      timeoutMs: OMDB_TIMEOUT_MS,
      settingsOverride: imdbSettingsOverride,
      sensitiveValues: [omdbApiKey]
    })
    const parsed = parseOmdbRating(payload, id)
    return { ...parsed, sourceTitle: parsed.title }
  }

  const fetchRottenTomatoes = async (
    titles: string[],
    kind: RatingMediaKind
  ): Promise<{ scores: ReturnType<typeof parseRottenTomatoesScores>; sourceUrl: string } | null> => {
    if (rottenTomatoesBlocked) return null
    let lastError: unknown = null
    for (const title of titles) {
      try {
        const searchUrl = `https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}`
        const searchHtml = await httpClient.fetchText("imdb", searchUrl, {
          headers: {
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 WhatsNewBot/0.1",
            accept: "text/html,application/xhtml+xml"
          },
          timeoutMs: ROTTEN_TOMATOES_TIMEOUT_MS,
          retryAttempts: 1,
          settingsOverride: imdbSettingsOverride
        })
        const path = findRottenTomatoesPath(searchHtml, title, kind === "movie" ? "movie" : "series")
        if (!path) continue
        const pageHtml = await httpClient.fetchText("imdb", path, {
          headers: {
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 WhatsNewBot/0.1",
            accept: "text/html,application/xhtml+xml"
          },
          timeoutMs: ROTTEN_TOMATOES_TIMEOUT_MS,
          retryAttempts: 1,
          settingsOverride: imdbSettingsOverride
        })
        const scores = parseRottenTomatoesScores(pageHtml)
        if (scores.critics == null && scores.audience == null) continue
        return { scores, sourceUrl: path }
      } catch (error) {
        if (error instanceof SourceHttpError && [403, 429].includes(error.statusCode)) {
          rottenTomatoesBlocked = true
          throw error
        }
        lastError = error
        // 单个候选失败后继续尝试后备标题，最终保留 OMDb 影评人兜底
      }
    }
    if (lastError) throw lastError
    return null
  }

  for (const candidate of candidates) {
    let itemUpdated = false
    let itemImdbId = imdbId(candidate.imdbId)
    let omdb: OmdbRatingWithTitle | null = null
    let tmdbDetail: TmdbDetail | null = null

    try {
      const doubanRef = candidate.sourceRefs.find((ref) => (
        ref.source === "douban" && /^douban-\d+$/.test(ref.sourceId)
      ))
      if (doubanRef && !doubanBlocked) {
        const subjectId = doubanRef.sourceId.replace(/^douban-/, "")
        const parsed = parseDoubanRating(await fetchDouban(candidate, subjectId))
        itemUpdated = await upsertRating(
          database,
          candidate.id,
          "douban",
          "users",
          parsed,
          10,
          sourceUrlForDouban(subjectId),
          now
        ) || itemUpdated
      }
    } catch (error) {
      addFailure(result, candidate.id, "douban", error)
    }

    if (candidate.tmdbId != null && tmdbApiKey) {
      try {
        tmdbDetail = await fetchTmdb(candidate)
        const parsed = parseTmdbRating(tmdbDetail)
        itemUpdated = await upsertRating(
          database,
          candidate.id,
          "tmdb",
          "users",
          parsed,
          10,
          sourceUrlForTmdb(mediaKind(candidate), candidate.tmdbId),
          now
        ) || itemUpdated
        const returnedImdbId = tmdbDetail.external_ids?.imdb_id
        if (!candidate.imdbId && !itemImdbId && typeof returnedImdbId === "string" && IMDB_ID_PATTERN.test(returnedImdbId)) {
          itemImdbId = returnedImdbId
          await database.mediaItem.update({
            where: { id: candidate.id },
            data: { imdbId: returnedImdbId }
          })
        }
      } catch (error) {
        addFailure(result, candidate.id, "tmdb", error)
      }
    }

    if (itemImdbId && omdbApiKey) {
      try {
        omdb = await fetchOmdb(itemImdbId)
        itemUpdated = await upsertRating(
          database,
          candidate.id,
          "imdb",
          "users",
          omdb,
          10,
          sourceUrlForImdb(itemImdbId),
          now
        ) || itemUpdated
      } catch (error) {
        addFailure(result, candidate.id, "imdb", error)
      }
    }

    const rtTitles = candidateTitles(candidate, omdb?.sourceTitle ?? null)
    if (rtTitles.length > 0) {
      let directScores: Awaited<ReturnType<typeof fetchRottenTomatoes>> = null
      try {
        directScores = await fetchRottenTomatoes(rtTitles, mediaKind(candidate))
      } catch (error) {
        addFailure(result, candidate.id, "rotten_tomatoes", error)
      }
      const fallbackScores = shouldUseRottenTomatoesFallback(omdb, directScores?.scores ?? null)
        ? omdb?.rottenTomatoes ?? null
        : null
      try {
        if (directScores?.scores.critics != null || fallbackScores != null) {
          itemUpdated = await upsertRating(
            database,
            candidate.id,
            "rotten_tomatoes",
            "critics",
            { value: directScores?.scores.critics ?? fallbackScores, voteCount: null },
            100,
            directScores?.sourceUrl ?? null,
            now
          ) || itemUpdated
        }
        if (directScores?.scores.audience != null) {
          itemUpdated = await upsertRating(
            database,
            candidate.id,
            "rotten_tomatoes",
            "audience",
            { value: directScores.scores.audience, voteCount: null },
            100,
            directScores.sourceUrl,
            now
          ) || itemUpdated
        }
      } catch (error) {
        addFailure(result, candidate.id, "rotten_tomatoes", error)
      }
    }

    try {
      await database.mediaItem.update({
        where: { id: candidate.id },
        data: { ratingsCheckedAt: now }
      })
    } catch (error) {
      addFailure(result, candidate.id, "ratings", error)
    }

    if (itemUpdated) result.updated += 1
    else result.unchanged += 1
  }

  return result
}

export function ratingCandidateTitles(
  item: Pick<Candidate, "titleDisplay" | "titleOriginal">,
  omdbTitle: string | null = null
): string[] {
  return candidateTitles(item, omdbTitle)
}
