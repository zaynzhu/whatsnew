import type { MediaStatus } from "@whatsnew/shared/media"
import {
  createTheTvdbClient,
  type TheTvdbClient,
  type TheTvdbMovie,
  type TheTvdbRelease,
  type TheTvdbRemoteId,
  type TheTvdbSeries,
  type TheTvdbUpdate,
  type TheTvdbUpdateType
} from "../clients/theTvdbClient.js"
import { classifyMedia } from "../domain/mediaClassifier.js"
import type { AdapterItem, ReleaseInput, SourceAdapter, SourceFetchBatch } from "../domain/types.js"

type TheTvdbDetail = TheTvdbMovie | TheTvdbSeries

type TheTvdbAdapterOptions = {
  client?: TheTvdbClient
  now?: () => Date
}

type TypedUpdate = TheTvdbUpdate & {
  type: "movie" | "series"
}

const UPDATES_WINDOW_SECONDS = 48 * 60 * 60
const MAX_DETAIL_RECORDS = 40
const defaultTheTvdbClient = createTheTvdbClient()

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()

  return trimmed || null
}

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

function addLocalDays(dateText: string, days: number): string {
  const [year, month, day] = dateText.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)

  return formatLocalDate(date)
}

function inDateWindow(value: string | null, start: string, end: string): boolean {
  return value != null && value >= start && value <= end
}

function sourceId(kind: "movie" | "series", id: number): string {
  return `thetvdb:${kind}:${id}`
}

function sourceUrl(kind: "movie" | "series", slug: string | null, id: number): string {
  const path = kind === "movie" ? "movies" : "series"

  return `https://www.thetvdb.com/${path}/${slug ?? String(id)}`
}

function uniqueTexts(values: Array<string | null | undefined>, excluded?: string | null): string[] {
  const normalizedExcluded = cleanText(excluded)
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = cleanText(value)
    if (!normalized || normalized === normalizedExcluded || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function remoteId(records: TheTvdbRemoteId[] | undefined, names: string[]): string | null {
  const accepted = new Set(names.map((name) => name.toLowerCase()))

  return records?.find((record) => {
    const sourceName = cleanText(record.sourceName)
    return sourceName != null && accepted.has(sourceName.toLowerCase())
  })?.id?.trim() || null
}

function parseTmdbId(value: string | null): number | null {
  if (!value) return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return null

  return parsed
}

function mappedStatus(
  kind: "movie" | "series",
  releaseDate: string | null,
  statusName: string | null,
  today: string
): MediaStatus {
  if (releaseDate && releaseDate > today) return "upcoming"
  if (kind === "movie") return releaseDate ? "released" : "unknown"
  if (statusName?.toLowerCase().includes("ended")) return "ended"
  return releaseDate ? "ongoing" : "unknown"
}

function releaseStatus(releaseDate: string, today: string): string {
  if (releaseDate > today) return "upcoming"
  if (releaseDate === today) return "airing_today"
  return "available"
}

function detailKind(type: TheTvdbUpdateType): "movie" | "series" {
  return type === "movies" ? "movie" : "series"
}

async function collectUpdates(client: TheTvdbClient, type: TheTvdbUpdateType, since: number): Promise<TypedUpdate[]> {
  const visitedNextLinks = new Set<string>()
  const collected: TypedUpdate[] = []
  let page = 0

  while (true) {
    const response = await client.getUpdates(type, since, page)
    collected.push(...response.data.map((row) => ({ ...row, type: detailKind(type) })))

    const nextLink = cleanText(response.links?.next ?? null)
    if (!nextLink) break
    if (visitedNextLinks.has(nextLink)) throw new Error("TheTVDB 更新分页循环")
    visitedNextLinks.add(nextLink)
    page += 1
  }

  return collected
}

function deduplicatedUpdates(updates: TypedUpdate[]): TypedUpdate[] {
  const deduped = new Map<string, TypedUpdate>()

  for (const update of updates) {
    const key = `${update.type}:${update.recordId}`
    const current = deduped.get(key)
    if (!current || update.timeStamp > current.timeStamp) deduped.set(key, update)
  }

  return Array.from(deduped.values())
}

function dateWindow(now: Date) {
  const today = formatLocalDate(now)

  return {
    today,
    recentStart: addLocalDays(today, -30),
    futureEnd: addLocalDays(today, 180),
    nextAiredEnd: addLocalDays(today, 30)
  }
}

function releaseCountry(kind: "movie" | "series", detail: TheTvdbDetail): string | null {
  if (kind === "movie") {
    const movie = detail as TheTvdbMovie
    return cleanText(movie.first_release?.country) ?? cleanText(movie.originalCountry)
  }

  const show = detail as TheTvdbSeries
  return cleanText(show.country) ?? cleanText(show.originalCountry)
}

function firstReleaseDate(kind: "movie" | "series", detail: TheTvdbDetail): string | null {
  if (kind === "movie") {
    return cleanText((detail as TheTvdbMovie).first_release?.date)
  }

  return cleanText((detail as TheTvdbSeries).firstAired)
}

function relevantSeriesReleaseDate(
  detail: TheTvdbSeries,
  today: string,
  recentStart: string,
  futureEnd: string,
  nextAiredEnd: string
): string | null {
  const nextAired = cleanText(detail.nextAired)
  if (inDateWindow(nextAired, today, nextAiredEnd)) return nextAired

  const firstAired = cleanText(detail.firstAired)
  if (inDateWindow(firstAired, recentStart, futureEnd)) return firstAired

  return null
}

function createAllowed(kind: "movie" | "series", detail: TheTvdbDetail, now: ReturnType<typeof dateWindow>): boolean {
  if (kind === "movie") {
    return inDateWindow(firstReleaseDate(kind, detail), now.recentStart, now.futureEnd)
  }

  const show = detail as TheTvdbSeries
  return inDateWindow(cleanText(show.firstAired), now.recentStart, now.futureEnd)
    || inDateWindow(cleanText(show.nextAired), now.today, now.nextAiredEnd)
}

function releaseFromDate(
  kind: "movie" | "series",
  date: string,
  region: string | null,
  url: string,
  today: string
): ReleaseInput {
  return {
    platform: "Unspecified",
    region: region ?? "GLOBAL",
    releaseDate: date,
    releaseTime: null,
    releasePattern: kind === "movie" ? "movie_release" : "series_air_date",
    releaseStatus: releaseStatus(date, today),
    seasonNumber: null,
    episodeNumber: null,
    episodeTitle: null,
    source: "thetvdb",
    sourceUrl: url
  }
}

function mapMovie(detail: TheTvdbMovie, now: ReturnType<typeof dateWindow>): AdapterItem {
  const title = cleanText(detail.name) ?? `TheTVDB Movie ${detail.id}`
  const aliases = uniqueTexts(detail.aliases?.map((alias) => alias.name) ?? [], title)
  const genres = uniqueTexts(detail.genres?.map((genre) => genre.name) ?? [])
  const releaseDate = cleanText(detail.first_release?.date)
  const country = releaseCountry("movie", detail)
  const allowed = createAllowed("movie", detail, now)
  const pageUrl = sourceUrl("movie", cleanText(detail.slug), detail.id)
  const classification = classifyMedia({
    source: "thetvdb",
    sourceContentType: "movie",
    genres
  })

  return {
    media: {
      source: "thetvdb",
      sourceId: sourceId("movie", detail.id),
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: "movie",
      titleDisplay: title,
      titleOriginal: title,
      titleAliases: aliases,
      overview: null,
      posterUrl: cleanText(detail.image),
      productionCountries: country ? [country] : [],
      originalLanguage: cleanText(detail.originalLanguage),
      genres,
      firstReleaseDate: releaseDate,
      status: mappedStatus("movie", releaseDate, cleanText(detail.status?.name), now.today),
      tmdbId: parseTmdbId(remoteId(detail.remoteIds, ["tmdb", "themoviedb", "themoviedb.com"])),
      tvmazeId: null,
      imdbId: remoteId(detail.remoteIds, ["imdb"]),
      traktId: null,
      tvdbId: detail.id
    },
    releases: allowed && releaseDate ? [releaseFromDate("movie", releaseDate, country, pageUrl, now.today)] : [],
    popularitySignals: [],
    createIfMissing: allowed
  }
}

function mapSeries(detail: TheTvdbSeries, now: ReturnType<typeof dateWindow>): AdapterItem {
  const title = cleanText(detail.name) ?? `TheTVDB Series ${detail.id}`
  const aliases = uniqueTexts(detail.aliases?.map((alias) => alias.name) ?? [], title)
  const genres = uniqueTexts(detail.genres?.map((genre) => genre.name) ?? [])
  const country = releaseCountry("series", detail)
  const releaseDate = relevantSeriesReleaseDate(detail, now.today, now.recentStart, now.futureEnd, now.nextAiredEnd)
  const allowed = createAllowed("series", detail, now)
  const pageUrl = sourceUrl("series", cleanText(detail.slug), detail.id)
  const classification = classifyMedia({
    source: "thetvdb",
    sourceContentType: "series",
    genres
  })

  return {
    media: {
      source: "thetvdb",
      sourceId: sourceId("series", detail.id),
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: "series",
      titleDisplay: title,
      titleOriginal: title,
      titleAliases: aliases,
      overview: null,
      posterUrl: cleanText(detail.image),
      productionCountries: country ? [country] : [],
      originalLanguage: cleanText(detail.originalLanguage),
      genres,
      firstReleaseDate: cleanText(detail.firstAired),
      status: mappedStatus("series", releaseDate, cleanText(detail.status?.name), now.today),
      tmdbId: parseTmdbId(remoteId(detail.remoteIds, ["tmdb", "themoviedb", "themoviedb.com"])),
      tvmazeId: null,
      imdbId: remoteId(detail.remoteIds, ["imdb"]),
      traktId: null,
      tvdbId: detail.id
    },
    releases: allowed && releaseDate ? [releaseFromDate("series", releaseDate, country, pageUrl, now.today)] : [],
    popularitySignals: [],
    createIfMissing: allowed
  }
}

function mapDetail(kind: "movie" | "series", detail: TheTvdbDetail, now: ReturnType<typeof dateWindow>): AdapterItem {
  return kind === "movie"
    ? mapMovie(detail as TheTvdbMovie, now)
    : mapSeries(detail as TheTvdbSeries, now)
}

export function createTheTvdbAdapter(options: TheTvdbAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const client = options.client ?? defaultTheTvdbClient
  const now = options.now ?? (() => new Date())

  return {
    source: "thetvdb",
    scope: "updates",
    async fetchItems() {
      const currentNow = now()
      const since = Math.floor(currentNow.getTime() / 1000) - UPDATES_WINDOW_SECONDS
      const movieUpdates = await collectUpdates(client, "movies", since)
      const seriesUpdates = await collectUpdates(client, "series", since)
      const updates = deduplicatedUpdates([...movieUpdates, ...seriesUpdates])
      const retiredSourceRefs = updates
        .filter((update) => update.methodInt === 3)
        .map((update) => ({
          source: "thetvdb",
          sourceId: sourceId(update.type, update.recordId)
        }))
      const detailCandidates = updates
        .filter((update) => update.methodInt !== 3)
        .sort((left, right) => right.timeStamp - left.timeStamp)
        .slice(0, MAX_DETAIL_RECORDS)
      const window = dateWindow(currentNow)
      const items: AdapterItem[] = []

      for (const update of detailCandidates) {
        const detail = update.type === "movie"
          ? await client.getMovie(update.recordId)
          : await client.getSeries(update.recordId)
        items.push(mapDetail(update.type, detail, window))
      }

      return {
        items,
        retiredSourceRefs
      }
    }
  }
}

export const theTvdbAdapter = createTheTvdbAdapter({ client: defaultTheTvdbClient })
