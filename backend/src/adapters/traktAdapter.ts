import type {
  AdapterItem,
  PopularitySignalInput,
  ReleaseInput,
  SourceAdapter,
  SourceFetchBatch
} from "../domain/types.js"
import { createTraktClient, type TraktClient } from "../clients/traktClient.js"

type TraktIds = {
  trakt: number
  slug: string
  imdb?: string | null
  tmdb?: number | null
  tvdb?: number | null
}

type TraktMovie = {
  title: string
  year: number | null
  ids: TraktIds
}

type TraktShow = {
  title: string
  year: number | null
  ids: TraktIds
}

type TraktEpisode = {
  season: number
  number: number
  title: string | null
  ids: TraktIds
}

type TraktTrendingMovie = {
  watchers: number
  movie: TraktMovie
}

type TraktTrendingShow = {
  watchers: number
  show: TraktShow
}

type TraktAnticipatedMovie = {
  list_count: number
  movie: TraktMovie
}

type TraktAnticipatedShow = {
  list_count: number
  show: TraktShow
}

type TraktMovieCalendarRow = {
  released: string
  movie: TraktMovie
}

type TraktShowCalendarRow = {
  first_aired: string
  episode: TraktEpisode
  show: TraktShow
}

type TraktAdapterOptions = {
  client?: TraktClient
  today?: () => string
}

type TraktMedia = TraktMovie | TraktShow
type PopularityKind = "trending" | "anticipated"

function todayLocalDate(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function movieUrl(slug: string): string {
  return `https://trakt.tv/movies/${slug}`
}

function showUrl(slug: string): string {
  return `https://trakt.tv/shows/${slug}`
}

function statusForDate(releaseDate: string | null, today: string): "upcoming" | "released" | "unknown" {
  if (!releaseDate) return "unknown"
  return releaseDate > today ? "upcoming" : "released"
}

function releaseStatus(releaseDate: string, today: string): string {
  if (releaseDate > today) return "upcoming"
  if (releaseDate === today) return "airing_today"
  return "available"
}

function itemFromMedia(kind: "movie" | "show", media: TraktMedia, firstReleaseDate: string | null): AdapterItem {
  const isMovie = kind === "movie"

  return {
    media: {
      source: "trakt",
      sourceId: `trakt:${kind}:${media.ids.trakt}`,
      mediaType: isMovie ? "movie" : "series",
      releaseForm: isMovie ? "theatrical_movie" : "tv_series",
      sourceContentType: kind,
      titleDisplay: media.title,
      titleOriginal: media.title,
      titleAliases: [],
      overview: null,
      posterUrl: null,
      productionCountries: [],
      originalLanguage: null,
      genres: [],
      firstReleaseDate,
      status: "unknown",
      tmdbId: media.ids.tmdb ?? null,
      tvmazeId: null,
      imdbId: media.ids.imdb ?? null,
      traktId: media.ids.trakt,
      tvdbId: media.ids.tvdb ?? null
    },
    releases: [],
    popularitySignals: []
  }
}

function popularitySignal(
  kind: PopularityKind,
  mediaKind: "movie" | "show",
  media: TraktMedia,
  rank: number,
  value: number
): PopularitySignalInput {
  const isTrending = kind === "trending"

  return {
    source: isTrending ? "trakt_trending" : "trakt_anticipated",
    sourceCategory: "metadata_community",
    platform: "Trakt",
    region: null,
    window: isTrending ? "current" : "upcoming",
    rank,
    rankDelta: null,
    value,
    valueLabel: `${value} ${isTrending ? "watchers" : "list_count"}`,
    sourceUrl: mediaKind === "movie" ? movieUrl(media.ids.slug) : showUrl(media.ids.slug)
  }
}

function mergePopularity(
  items: Map<string, AdapterItem>,
  kind: PopularityKind,
  mediaKind: "movie" | "show",
  rows: Array<{ media: TraktMedia, value: number }>
) {
  rows.forEach(({ media, value }, index) => {
    const key = `${mediaKind}:${media.ids.trakt}`
    const item = items.get(key) ?? itemFromMedia(mediaKind, media, null)
    item.popularitySignals.push(popularitySignal(kind, mediaKind, media, index + 1, value))
    items.set(key, item)
  })
}

function movieRelease(row: TraktMovieCalendarRow, today: string): ReleaseInput {
  return {
    platform: "Unspecified",
    region: "GLOBAL",
    releaseDate: row.released,
    releaseTime: null,
    releasePattern: "calendar_release",
    releaseStatus: releaseStatus(row.released, today),
    seasonNumber: null,
    episodeNumber: null,
    source: "trakt",
    sourceUrl: movieUrl(row.movie.ids.slug)
  }
}

function showRelease(row: TraktShowCalendarRow, today: string): ReleaseInput {
  const releaseDate = row.first_aired.slice(0, 10)

  return {
    platform: "Unspecified",
    region: "GLOBAL",
    releaseDate,
    releaseTime: null,
    releasePattern: "episode_release",
    releaseStatus: releaseStatus(releaseDate, today),
    seasonNumber: row.episode.season,
    episodeNumber: row.episode.number,
    episodeTitle: row.episode.title,
    source: "trakt",
    sourceUrl: showUrl(row.show.ids.slug)
  }
}

function releaseKey(release: ReleaseInput): string {
  return `${release.releaseDate}:${release.seasonNumber}:${release.episodeNumber}`
}

function mergeCalendarItem(items: Map<string, AdapterItem>, key: string, next: AdapterItem) {
  const current = items.get(key)
  if (!current) {
    items.set(key, next)
    return
  }

  const knownReleases = new Set(current.releases.map(releaseKey))
  for (const release of next.releases) {
    if (!knownReleases.has(releaseKey(release))) current.releases.push(release)
  }
  current.media.firstReleaseDate ??= next.media.firstReleaseDate
}

export function createTraktPopularityAdapter(options: TraktAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const client = options.client ?? createTraktClient()

  return {
    source: "trakt",
    scope: "popularity",
    async fetchItems() {
      const [trendingMovies, trendingShows, anticipatedMovies, anticipatedShows] = await Promise.all([
        client.get<TraktTrendingMovie[]>("/movies/trending"),
        client.get<TraktTrendingShow[]>("/shows/trending"),
        client.get<TraktAnticipatedMovie[]>("/movies/anticipated"),
        client.get<TraktAnticipatedShow[]>("/shows/anticipated")
      ])
      const items = new Map<string, AdapterItem>()

      mergePopularity(items, "trending", "movie", trendingMovies.map((row) => ({ media: row.movie, value: row.watchers })))
      mergePopularity(items, "trending", "show", trendingShows.map((row) => ({ media: row.show, value: row.watchers })))
      mergePopularity(items, "anticipated", "movie", anticipatedMovies.map((row) => ({ media: row.movie, value: row.list_count })))
      mergePopularity(items, "anticipated", "show", anticipatedShows.map((row) => ({ media: row.show, value: row.list_count })))

      return {
        items: Array.from(items.values()),
        completePopularitySources: ["trakt_trending", "trakt_anticipated"]
      }
    }
  }
}

export function createTraktCalendarAdapter(options: TraktAdapterOptions = {}): SourceAdapter {
  const client = options.client ?? createTraktClient()
  const today = options.today ?? todayLocalDate

  return {
    source: "trakt",
    scope: "calendar",
    async fetchItems() {
      const currentDate = today()
      const [movies, shows] = await Promise.all([
        client.get<TraktMovieCalendarRow[]>(`/calendars/all/movies/${currentDate}/14`),
        client.get<TraktShowCalendarRow[]>(`/calendars/all/shows/${currentDate}/14`)
      ])
      const items = new Map<string, AdapterItem>()

      for (const row of movies) {
        const item = itemFromMedia("movie", row.movie, row.released)
        item.media.status = statusForDate(row.released, currentDate)
        item.releases.push(movieRelease(row, currentDate))
        mergeCalendarItem(items, `movie:${row.movie.ids.trakt}`, item)
      }

      for (const row of shows) {
        const releaseDate = row.first_aired.slice(0, 10)
        const isPremiere = row.episode.season === 1 && row.episode.number === 1
        const item = itemFromMedia("show", row.show, isPremiere ? releaseDate : null)
        item.media.status = releaseDate > currentDate ? "upcoming" : "ongoing"
        item.releases.push(showRelease(row, currentDate))
        mergeCalendarItem(items, `show:${row.show.ids.trakt}`, item)
      }

      return Array.from(items.values())
    }
  }
}

export const traktPopularityAdapter = createTraktPopularityAdapter()
export const traktCalendarAdapter = createTraktCalendarAdapter()
