import { env } from "../config/env.js"
import type { AdapterItem, PopularitySignalInput, ReleaseInput, SourceAdapter } from "../domain/types.js"
import { fetchJson } from "../utils/http.js"
import { RateLimiter } from "../utils/rateLimiter.js"

type TmdbMovie = {
  id: number
  title: string | null
  original_title: string | null
  overview: string | null
  poster_path: string | null
  release_date: string | null
  original_language: string | null
  genre_ids: number[]
  popularity: number | null
}

type TmdbListResponse = {
  results: TmdbMovie[]
}

type TmdbGenreResponse = {
  genres: Array<{
    id: number
    name: string
  }>
}

type TmdbAdapterOptions = {
  apiKey?: string
  baseUrl?: string
  imageBaseUrl?: string
  language?: string
  region?: string
  page?: number
  minIntervalMs?: number
  today?: () => string
}

const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const TMDB_TIMEOUT_MS = 30000

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function todayLocalDate(): string {
  return formatLocalDate(new Date())
}

function cleanText(value: string | null): string | null {
  const trimmed = value?.trim()

  return trimmed || null
}

function posterUrl(imageBaseUrl: string, posterPath: string | null): string | null {
  if (!posterPath) return null

  return `${imageBaseUrl}${posterPath}`
}

function mediaStatus(releaseDate: string | null, today: string): "upcoming" | "released" | "unknown" {
  if (!releaseDate) return "unknown"
  if (releaseDate > today) return "upcoming"

  return "released"
}

function releaseStatus(releaseDate: string | null, today: string): string {
  if (!releaseDate) return "unknown"
  if (releaseDate === today) return "airing_today"
  if (releaseDate > today) return "upcoming"

  return "available"
}

function sourceUrl(movieId: number): string {
  return `https://www.themoviedb.org/movie/${movieId}`
}

function isBearerToken(credential: string): boolean {
  return credential.startsWith("eyJ") || credential.split(".").length === 3
}

function releaseFromMovie(movie: TmdbMovie, region: string, today: string): ReleaseInput {
  return {
    platform: "Theatrical",
    region,
    releaseDate: cleanText(movie.release_date),
    releaseTime: null,
    releasePattern: "theatrical_release",
    releaseStatus: releaseStatus(cleanText(movie.release_date), today),
    seasonNumber: null,
    episodeNumber: null,
    source: "tmdb",
    sourceUrl: sourceUrl(movie.id)
  }
}

function popularitySignalFromMovie(movie: TmdbMovie, rank: number, window: string): PopularitySignalInput {
  return {
    source: "tmdb_trending",
    sourceCategory: "metadata_community",
    platform: "TMDb",
    region: null,
    window,
    rank,
    rankDelta: null,
    value: movie.popularity,
    valueLabel: "TMDb popularity",
    sourceUrl: sourceUrl(movie.id)
  }
}

function itemFromMovie(movie: TmdbMovie, genres: string[], imageBaseUrl: string, region: string, today: string): AdapterItem {
  const title = cleanText(movie.title) ?? cleanText(movie.original_title) ?? `TMDb Movie ${movie.id}`
  const originalTitle = cleanText(movie.original_title)
  const aliases = originalTitle && originalTitle !== title ? [originalTitle] : []
  const releaseDate = cleanText(movie.release_date)

  return {
    media: {
      source: "tmdb",
      sourceId: `tmdb-movie-${movie.id}`,
      mediaType: "movie",
      releaseForm: "theatrical_movie",
      sourceContentType: "movie",
      titleDisplay: title,
      titleOriginal: originalTitle,
      titleAliases: aliases,
      overview: cleanText(movie.overview),
      posterUrl: posterUrl(imageBaseUrl, movie.poster_path),
      productionCountries: [region],
      originalLanguage: cleanText(movie.original_language),
      genres,
      firstReleaseDate: releaseDate,
      status: mediaStatus(releaseDate, today),
      tmdbId: movie.id,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [releaseFromMovie(movie, region, today)],
    popularitySignals: []
  }
}

function mergeUniqueSignals(target: PopularitySignalInput[], signals: PopularitySignalInput[]) {
  const known = new Set(target.map((signal) => `${signal.source}:${signal.window}:${signal.rank}`))

  for (const signal of signals) {
    const key = `${signal.source}:${signal.window}:${signal.rank}`
    if (known.has(key)) continue

    target.push(signal)
    known.add(key)
  }
}

function mergeMovie(
  items: Map<number, AdapterItem>,
  movie: TmdbMovie,
  genreNames: string[],
  imageBaseUrl: string,
  region: string,
  today: string
) {
  const current = items.get(movie.id)
  const next = itemFromMovie(movie, genreNames, imageBaseUrl, region, today)

  if (!current) {
    items.set(movie.id, next)
    return
  }

  const hasRelease = current.releases.some((release) => release.releaseDate === next.releases[0]?.releaseDate)
  if (!hasRelease) {
    current.releases.push(...next.releases)
  }

  current.media.genres = [...new Set([...current.media.genres, ...next.media.genres])]
}

function addTrendingSignals(items: Map<number, AdapterItem>, movies: TmdbMovie[], window: string) {
  movies.forEach((movie, index) => {
    const current = items.get(movie.id)
    if (!current) return

    mergeUniqueSignals(current.popularitySignals, [popularitySignalFromMovie(movie, index + 1, window)])
  })
}

export function createTmdbAdapter(options: TmdbAdapterOptions = {}): SourceAdapter {
  const apiKey = options.apiKey ?? env.TMDB_API_KEY
  const baseUrl = (options.baseUrl ?? env.TMDB_BASE_URL).replace(/\/$/, "")
  const imageBaseUrl = options.imageBaseUrl ?? env.TMDB_IMAGE_BASE_URL
  const language = options.language ?? "zh-CN"
  const region = options.region ?? "US"
  const page = options.page ?? 1
  const today = options.today ?? todayLocalDate
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)

  async function fetchTmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${baseUrl}${path}`)
    const headers: Record<string, string> = {}

    if (isBearerToken(apiKey)) {
      headers.Authorization = `Bearer ${apiKey}`
    } else {
      url.searchParams.set("api_key", apiKey)
    }

    url.searchParams.set("language", language)

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }

    return limiter.run(() => fetchJson<T>(url.toString(), { headers, timeoutMs: TMDB_TIMEOUT_MS }))
  }

  return {
    source: "tmdb",
    async fetchItems() {
      if (!apiKey) return []

      const currentDate = today()
      const [genreResponse, nowPlaying, upcoming, trending] = await Promise.all([
        fetchTmdb<TmdbGenreResponse>("/genre/movie/list"),
        fetchTmdb<TmdbListResponse>("/movie/now_playing", { page, region }),
        fetchTmdb<TmdbListResponse>("/movie/upcoming", { page, region }),
        fetchTmdb<TmdbListResponse>("/trending/movie/week")
      ])
      const genreMap = new Map(genreResponse.genres.map((genre) => [genre.id, genre.name]))
      const items = new Map<number, AdapterItem>()

      for (const movie of [...nowPlaying.results, ...upcoming.results]) {
        const genreNames = movie.genre_ids.map((id) => genreMap.get(id)).filter((name): name is string => Boolean(name))
        mergeMovie(items, movie, genreNames, imageBaseUrl, region, currentDate)
      }

      addTrendingSignals(items, trending.results, "week")

      return Array.from(items.values())
    }
  }
}

export const tmdbAdapter = createTmdbAdapter()
