import { env } from "../config/env.js"
import { classifyMedia } from "../domain/mediaClassifier.js"
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

type TmdbShow = {
  id: number
  name: string | null
  original_name: string | null
  overview: string | null
  poster_path: string | null
  first_air_date: string | null
  original_language: string | null
  genre_ids: number[]
  popularity: number | null
  origin_country?: string[]
}

type TmdbMovieListResponse = {
  results: TmdbMovie[]
}

type TmdbTvListResponse = {
  results: TmdbShow[]
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

function movieSourceUrl(movieId: number): string {
  return `https://www.themoviedb.org/movie/${movieId}`
}

function tvSourceUrl(showId: number): string {
  return `https://www.themoviedb.org/tv/${showId}`
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
    sourceUrl: movieSourceUrl(movie.id)
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
    sourceUrl: movieSourceUrl(movie.id)
  }
}

function releaseFromShow(show: TmdbShow, region: string, today: string): ReleaseInput {
  const releaseDate = cleanText(show.first_air_date)

  return {
    platform: "TMDb TV",
    region: show.origin_country?.[0] ?? region,
    releaseDate,
    releaseTime: null,
    releasePattern: "episode_release",
    releaseStatus: releaseStatus(releaseDate, today),
    seasonNumber: null,
    episodeNumber: null,
    source: "tmdb",
    sourceUrl: tvSourceUrl(show.id)
  }
}

function popularitySignalFromShow(show: TmdbShow, rank: number, window: string): PopularitySignalInput {
  return {
    source: "tmdb_tv_trending",
    sourceCategory: "metadata_community",
    platform: "TMDb",
    region: null,
    window,
    rank,
    rankDelta: null,
    value: show.popularity,
    valueLabel: "TMDb TV popularity",
    sourceUrl: tvSourceUrl(show.id)
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

function itemFromShow(show: TmdbShow, genres: string[], imageBaseUrl: string, region: string, today: string): AdapterItem {
  const title = cleanText(show.name) ?? cleanText(show.original_name) ?? `TMDb Show ${show.id}`
  const originalTitle = cleanText(show.original_name)
  const aliases = originalTitle && originalTitle !== title ? [originalTitle] : []
  const releaseDate = cleanText(show.first_air_date)
  const classification = classifyMedia({
    source: "tmdb",
    sourceContentType: "tv",
    genres
  })

  return {
    media: {
      source: "tmdb",
      sourceId: `tmdb-tv-${show.id}`,
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: "tv",
      titleDisplay: title,
      titleOriginal: originalTitle,
      titleAliases: aliases,
      overview: cleanText(show.overview),
      posterUrl: posterUrl(imageBaseUrl, show.poster_path),
      productionCountries: show.origin_country ?? [],
      originalLanguage: cleanText(show.original_language),
      genres,
      firstReleaseDate: releaseDate,
      status: mediaStatus(releaseDate, today),
      tmdbId: show.id,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [releaseFromShow(show, region, today)],
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

function mergeItem(
  items: Map<string, AdapterItem>,
  key: string,
  next: AdapterItem
) {
  const current = items.get(key)

  if (!current) {
    items.set(key, next)
    return
  }

  const hasRelease = current.releases.some((release) => release.releaseDate === next.releases[0]?.releaseDate)
  if (!hasRelease) {
    current.releases.push(...next.releases)
  }

  current.media.genres = [...new Set([...current.media.genres, ...next.media.genres])]
}

function mergeMovie(
  items: Map<string, AdapterItem>,
  movie: TmdbMovie,
  genreNames: string[],
  imageBaseUrl: string,
  region: string,
  today: string
) {
  const next = itemFromMovie(movie, genreNames, imageBaseUrl, region, today)

  mergeItem(items, `movie-${movie.id}`, next)
}

function mergeShow(
  items: Map<string, AdapterItem>,
  show: TmdbShow,
  genreNames: string[],
  imageBaseUrl: string,
  region: string,
  today: string
) {
  const next = itemFromShow(show, genreNames, imageBaseUrl, region, today)

  mergeItem(items, `tv-${show.id}`, next)
}

function addMovieTrendingSignals(items: Map<string, AdapterItem>, movies: TmdbMovie[], window: string) {
  movies.forEach((movie, index) => {
    const current = items.get(`movie-${movie.id}`)
    if (!current) return

    mergeUniqueSignals(current.popularitySignals, [popularitySignalFromMovie(movie, index + 1, window)])
  })
}

function addShowTrendingSignals(items: Map<string, AdapterItem>, shows: TmdbShow[], window: string) {
  shows.forEach((show, index) => {
    const current = items.get(`tv-${show.id}`)
    if (!current) return

    mergeUniqueSignals(current.popularitySignals, [popularitySignalFromShow(show, index + 1, window)])
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
      const [movieGenreResponse, tvGenreResponse, nowPlaying, upcoming, movieTrending, airingToday, onTheAir, tvTrending] = await Promise.all([
        fetchTmdb<TmdbGenreResponse>("/genre/movie/list"),
        fetchTmdb<TmdbGenreResponse>("/genre/tv/list"),
        fetchTmdb<TmdbMovieListResponse>("/movie/now_playing", { page, region }),
        fetchTmdb<TmdbMovieListResponse>("/movie/upcoming", { page, region }),
        fetchTmdb<TmdbMovieListResponse>("/trending/movie/week"),
        fetchTmdb<TmdbTvListResponse>("/tv/airing_today", { page, timezone: "America/New_York" }),
        fetchTmdb<TmdbTvListResponse>("/tv/on_the_air", { page, timezone: "America/New_York" }),
        fetchTmdb<TmdbTvListResponse>("/trending/tv/week")
      ])
      const movieGenreMap = new Map(movieGenreResponse.genres.map((genre) => [genre.id, genre.name]))
      const tvGenreMap = new Map(tvGenreResponse.genres.map((genre) => [genre.id, genre.name]))
      const items = new Map<string, AdapterItem>()

      for (const movie of [...nowPlaying.results, ...upcoming.results]) {
        const genreNames = movie.genre_ids.map((id) => movieGenreMap.get(id)).filter((name): name is string => Boolean(name))
        mergeMovie(items, movie, genreNames, imageBaseUrl, region, currentDate)
      }

      for (const show of [...airingToday.results, ...onTheAir.results]) {
        const genreNames = show.genre_ids.map((id) => tvGenreMap.get(id)).filter((name): name is string => Boolean(name))
        mergeShow(items, show, genreNames, imageBaseUrl, region, currentDate)
      }

      addMovieTrendingSignals(items, movieTrending.results, "week")
      addShowTrendingSignals(items, tvTrending.results, "week")

      return Array.from(items.values())
    }
  }
}

export const tmdbAdapter = createTmdbAdapter()
