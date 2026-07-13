import type { MediaItem, Prisma, PrismaClient } from "@prisma/client"
import { parseJsonArray, toJsonArray } from "../domain/normalizer.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type TmdbMediaKind = "movie" | "tv"

type TmdbResult = {
  id: number
  title?: string | null
  original_title?: string | null
  name?: string | null
  original_name?: string | null
  overview?: string | null
  poster_path?: string | null
  release_date?: string | null
  first_air_date?: string | null
  original_language?: string | null
  origin_country?: string[]
  production_countries?: Array<{ iso_3166_1?: string | null }>
  popularity?: number | null
}

type TmdbSearchResponse = {
  results: TmdbResult[]
}

type EnrichmentDatabase = Pick<
  PrismaClient,
  "mediaItem" | "mediaSourceRef" | "release" | "popularitySignal" | "changeEvent" | "$transaction"
>

type PosterEnrichmentOptions = {
  limit?: number
  database?: EnrichmentDatabase
  settings?: RuntimeSettingsService
  httpClient?: Pick<SourceHttpClient, "fetchJson">
  today?: () => string
  now?: () => Date
  force?: boolean
}

export type PosterEnrichmentResult = {
  scanned: number
  enriched: number
  merged: number
  unmatched: number
  conflicts: number
  failed: number
  samples: string[]
}

const DEFAULT_TMDB_BASE_URL = "https://api.themoviedb.org/3"
const DEFAULT_TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"
const TMDB_TIMEOUT_MS = 30000
const POSTER_RETRY_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const NETFLIX_RECENT_RELEASE_DAYS = 550
const NETFLIX_POPULARITY_LEAD_RATIO = 4
const MOVIE_RELEASE_FORMS = new Set(["theatrical_movie", "streaming_movie", "animated_film", "documentary_film"])

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

function normalizedTitle(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "")
}

function cleanText(value: string | null | undefined): string | null {
  return value?.trim() || null
}

function mediaKind(item: MediaItem): TmdbMediaKind {
  return MOVIE_RELEASE_FORMS.has(item.releaseForm) ? "movie" : "tv"
}

function resultTitles(result: TmdbResult): string[] {
  return [result.title, result.original_title, result.name, result.original_name]
    .map((value) => cleanText(value))
    .filter((value): value is string => value != null)
}

function netflixSearchTitle(value: string): string {
  return value.replace(/\s*\((?=[^)]*(?:raw|uncut|undekha))[^)]*\)\s*$/i, "").trim()
}

function itemTitles(item: MediaItem): string[] {
  const titles = [item.titleDisplay, item.titleOriginal, ...parseJsonArray(item.titleAliases)]
    .map((value) => cleanText(value))
    .filter((value): value is string => value != null)
  return isNetflixItem(item)
    ? [...new Set(titles.flatMap((title) => [title, netflixSearchTitle(title)]).filter(Boolean))]
    : titles
}

function releaseDate(kind: TmdbMediaKind, result: TmdbResult): string | null {
  return cleanText(kind === "movie" ? result.release_date : result.first_air_date)
}

function statusForDate(
  kind: TmdbMediaKind,
  date: string | null,
  today: string
): "upcoming" | "released" | "ongoing" | "unknown" {
  if (!date) return "unknown"
  if (date > today) return "upcoming"
  return kind === "movie" ? "released" : "ongoing"
}

function productionCountries(result: TmdbResult): string[] {
  const values = [
    ...(result.origin_country ?? []),
    ...(result.production_countries ?? []).map((country) => country.iso_3166_1 ?? "")
  ]
  return [...new Set(values.filter(Boolean))]
}

function netflixLanguageMatches(item: MediaItem, result: TmdbResult): boolean {
  if (item.sourceContentType?.includes("(English)")) return result.original_language === "en"
  if (item.sourceContentType?.includes("(Non-English)")) return result.original_language !== "en"
  return false
}

function isNetflixItem(item: MediaItem): boolean {
  return item.sourceContentType?.startsWith("Films (") === true
    || item.sourceContentType?.startsWith("TV (") === true
}

function recentNetflixMatch(
  item: MediaItem,
  matches: TmdbResult[],
  kind: TmdbMediaKind,
  today: string
): TmdbResult | null {
  if (!isNetflixItem(item)) return null

  const todayTime = Date.parse(`${today}T00:00:00.000Z`)
  const earliestTime = todayTime - NETFLIX_RECENT_RELEASE_DAYS * DAY_MS
  const recent = matches.filter((result) => {
    const date = releaseDate(kind, result)
    if (!date || !netflixLanguageMatches(item, result)) return false
    const time = Date.parse(`${date}T00:00:00.000Z`)
    return Number.isFinite(time) && time >= earliestTime && time <= todayTime
  })

  if (recent.length === 1) return recent[0]
  const sorted = [...recent].sort((left, right) => (right.popularity ?? 0) - (left.popularity ?? 0))
  const [first, second] = sorted
  if (!first || !second) return null
  const firstPopularity = first.popularity ?? 0
  const secondPopularity = second.popularity ?? 0
  if (firstPopularity > 0 && firstPopularity >= secondPopularity * NETFLIX_POPULARITY_LEAD_RATIO) {
    return first
  }
  return null
}

function searchMatch(item: MediaItem, results: TmdbResult[], today: string): TmdbResult | null {
  const expectedTitles = new Set(itemTitles(item).map(normalizedTitle).filter(Boolean))
  let matches = results.filter((result) => (
    result.poster_path
    && resultTitles(result).some((title) => expectedTitles.has(normalizedTitle(title)))
  ))

  const expectedYear = item.firstReleaseDate?.slice(0, 4)
  if (expectedYear) {
    const sameYear = matches.filter((result) => releaseDate(mediaKind(item), result)?.startsWith(expectedYear))
    if (sameYear.length > 0) matches = sameYear
  }

  const uniqueMatches = [...new Map(matches.map((result) => [result.id, result])).values()]
  if (uniqueMatches.length === 1) return uniqueMatches[0]
  return recentNetflixMatch(item, uniqueMatches, mediaKind(item), today)
}

function hasConflictingExternalIds(left: MediaItem, right: MediaItem): boolean {
  return ["tmdbId", "tvmazeId", "imdbId", "traktId", "tvdbId"].some((field) => {
    const leftValue = left[field as keyof MediaItem]
    const rightValue = right[field as keyof MediaItem]
    return leftValue != null && rightValue != null && leftValue !== rightValue
  })
}

function canMergeDuplicate(item: MediaItem, canonical: MediaItem): boolean {
  const itemTitleSet = new Set(itemTitles(item).map(normalizedTitle).filter(Boolean))
  const sharedTitle = itemTitles(canonical).some((title) => itemTitleSet.has(normalizedTitle(title)))
  return item.mediaType === canonical.mediaType
    && sharedTitle
    && !hasConflictingExternalIds(item, canonical)
}

function isRecentOrActiveLocalMatch(item: MediaItem, candidate: MediaItem, today: string): boolean {
  if (!isNetflixItem(item) || !candidate.posterUrl) return false
  if (item.originalLanguage && candidate.originalLanguage
    && item.originalLanguage !== candidate.originalLanguage) return false
  if (item.mediaType === "series" && ["returning", "ongoing", "upcoming"].includes(candidate.status)) {
    return true
  }

  if (!candidate.firstReleaseDate) return false
  const todayTime = Date.parse(`${today}T00:00:00.000Z`)
  const releaseTime = Date.parse(`${candidate.firstReleaseDate}T00:00:00.000Z`)
  return Number.isFinite(releaseTime)
    && releaseTime <= todayTime
    && releaseTime >= todayTime - NETFLIX_RECENT_RELEASE_DAYS * DAY_MS
}

function metadataUpdate(
  item: MediaItem,
  metadata: TmdbResult,
  kind: TmdbMediaKind,
  imageBaseUrl: string,
  today: string,
  now: Date
): Prisma.MediaItemUncheckedUpdateInput {
  const date = releaseDate(kind, metadata)
  const countries = productionCountries(metadata)
  const currentCountries = parseJsonArray(item.productionCountries)
  return {
    posterUrl: `${imageBaseUrl}${metadata.poster_path}`,
    posterLookupAttemptedAt: now,
    posterStatus: "unverified",
    posterCheckedAt: null,
    posterFailureCount: 0,
    posterFailureReason: null,
    posterWidth: null,
    posterHeight: null,
    posterQuality: "unknown",
    overview: item.overview ?? cleanText(metadata.overview),
    titleOriginal: item.titleOriginal ?? cleanText(metadata.original_title ?? metadata.original_name),
    firstReleaseDate: item.firstReleaseDate ?? date,
    originalLanguage: item.originalLanguage ?? cleanText(metadata.original_language),
    productionCountries: currentCountries.length > 0
      ? item.productionCountries
      : toJsonArray(countries),
    status: item.status === "unknown" ? statusForDate(kind, date, today) : item.status,
    tmdbId: item.tmdbId ?? metadata.id
  }
}

function isBearerToken(credential: string): boolean {
  return credential.startsWith("eyJ") || credential.split(".").length === 3
}

export async function enrichMissingPosters(options: PosterEnrichmentOptions = {}): Promise<PosterEnrichmentResult> {
  const database = options.database
  if (!database) throw new Error("海报补全缺少数据库连接")
  const enrichmentDatabase: EnrichmentDatabase = database
  const settings = options.settings ?? runtimeSettings
  const httpClient = options.httpClient ?? sourceHttpClient
  const currentSettings = settings.view()
  const apiKey = currentSettings.get("TMDB_API_KEY")
  if (!apiKey) throw new Error("TMDb 凭据未配置")

  const baseUrl = (currentSettings.get("TMDB_BASE_URL") || DEFAULT_TMDB_BASE_URL).replace(/\/$/, "")
  const imageBaseUrl = currentSettings.get("TMDB_IMAGE_BASE_URL") || DEFAULT_TMDB_IMAGE_BASE_URL
  const settingsOverride = captureSourceProxySettings(currentSettings, "tmdb")
  const now = (options.now ?? (() => new Date()))()
  const today = (options.today ?? (() => formatLocalDate(now)))()
  const retryBefore = new Date(now.getTime() - POSTER_RETRY_DAYS * DAY_MS)
  const items = await enrichmentDatabase.mediaItem.findMany({
    where: {
      AND: [
        {
          OR: [
            { posterUrl: null },
            { posterUrl: "" },
            { posterStatus: "broken" },
            { posterQuality: "undersized" }
          ]
        },
        ...(!options.force ? [{
          OR: [
            { posterLookupAttemptedAt: null },
            { posterLookupAttemptedAt: { lt: retryBefore } }
          ]
        }] : [])
      ]
    },
    orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
    take: Math.max(1, Math.min(options.limit ?? 120, 500))
  })
  const result: PosterEnrichmentResult = {
    scanned: items.length,
    enriched: 0,
    merged: 0,
    unmatched: 0,
    conflicts: 0,
    failed: 0,
    samples: []
  }

  async function fetchTmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${baseUrl}${path}`)
    const headers: Record<string, string> = {}
    if (isBearerToken(apiKey)) headers.Authorization = `Bearer ${apiKey}`
    else url.searchParams.set("api_key", apiKey)
    url.searchParams.set("language", "en-US")
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

    return httpClient.fetchJson<T>("tmdb", url.toString(), {
      headers,
      timeoutMs: TMDB_TIMEOUT_MS,
      settingsOverride,
      sensitiveValues: [apiKey]
    })
  }

  async function markAttempt(itemId: string): Promise<void> {
    await enrichmentDatabase.mediaItem.update({
      where: { id: itemId },
      data: { posterLookupAttemptedAt: now }
    })
  }

  async function mergeDuplicate(
    item: MediaItem,
    canonical: MediaItem,
    data: Prisma.MediaItemUncheckedUpdateInput = {}
  ): Promise<MediaItem> {
    return enrichmentDatabase.$transaction(async (transaction) => {
      await transaction.mediaSourceRef.updateMany({
        where: { mediaItemId: item.id },
        data: { mediaItemId: canonical.id }
      })
      await transaction.release.updateMany({
        where: { mediaItemId: item.id },
        data: { mediaItemId: canonical.id }
      })
      await transaction.popularitySignal.updateMany({
        where: { mediaItemId: item.id },
        data: { mediaItemId: canonical.id }
      })
      await transaction.changeEvent.updateMany({
        where: { mediaItemId: item.id },
        data: { mediaItemId: canonical.id }
      })
      const merged = await transaction.mediaItem.update({
        where: { id: canonical.id },
        data: {
          ...data,
          heatScore: Math.max(item.heatScore, canonical.heatScore)
        }
      })
      await transaction.mediaItem.delete({ where: { id: item.id } })
      return merged
    })
  }

  const localCandidates = await enrichmentDatabase.mediaItem.findMany({
    where: {
      posterUrl: { not: null },
      NOT: { posterUrl: "" }
    }
  })

  for (const item of items) {
    const kind = mediaKind(item)
    try {
      const localMatches = localCandidates.filter((candidate) => (
        candidate.id !== item.id
        && canMergeDuplicate(item, candidate)
        && isRecentOrActiveLocalMatch(item, candidate, today)
      ))
      if (localMatches.length === 1) {
        const updated = await mergeDuplicate(item, localMatches[0])
        result.merged += 1
        if (result.samples.length < 10) result.samples.push(updated.titleDisplay)
        continue
      }

      let metadata: TmdbResult | null = null
      if (item.tmdbId) {
        metadata = await fetchTmdb<TmdbResult>(`/${kind}/${item.tmdbId}`)
      } else {
        const searchQueries = [...new Set(itemTitles(item))].slice(0, 2)
        for (const query of searchQueries) {
          const search = await fetchTmdb<TmdbSearchResponse>(`/search/${kind}`, {
            query,
            include_adult: "false",
            page: "1"
          })
          metadata = searchMatch(item, search.results ?? [], today)
          if (metadata) break
        }
      }

      if (!metadata?.poster_path) {
        await markAttempt(item.id)
        result.unmatched += 1
        continue
      }

      const sourceId = `tmdb-${kind}-${metadata.id}`
      const existingRef = await enrichmentDatabase.mediaSourceRef.findUnique({
        where: { source_sourceId: { source: "tmdb", sourceId } },
        select: { mediaItemId: true }
      })
      if (existingRef && existingRef.mediaItemId !== item.id) {
        const canonical = await enrichmentDatabase.mediaItem.findUnique({
          where: { id: existingRef.mediaItemId }
        })
        if (!canonical || !canMergeDuplicate(item, canonical)) {
          await markAttempt(item.id)
          result.conflicts += 1
          continue
        }

        const updated = await mergeDuplicate(
          item,
          canonical,
          metadataUpdate(canonical, metadata, kind, imageBaseUrl, today, now)
        )

        result.merged += 1
        if (result.samples.length < 10) result.samples.push(updated.titleDisplay)
        continue
      }

      const updated = await enrichmentDatabase.mediaItem.update({
        where: { id: item.id },
        data: metadataUpdate(item, metadata, kind, imageBaseUrl, today, now)
      })
      await enrichmentDatabase.mediaSourceRef.upsert({
        where: { source_sourceId: { source: "tmdb", sourceId } },
        update: { mediaItemId: item.id, isActive: true },
        create: { mediaItemId: item.id, source: "tmdb", sourceId, isActive: true }
      })

      result.enriched += 1
      if (result.samples.length < 10) result.samples.push(updated.titleDisplay)
    } catch {
      try {
        await markAttempt(item.id)
      } catch {
        // 原始失败计数优先，记录重试时间失败时留待下轮再次处理
      }
      result.failed += 1
    }
  }

  return result
}
