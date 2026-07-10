import { classifyMedia } from "../domain/mediaClassifier.js"
import type { AdapterItem, ReleaseInput, SourceAdapter } from "../domain/types.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type TvmazeCountry = {
  code: string
} | null

type TvmazeChannel = {
  name: string
  country: TvmazeCountry
} | null

type TvmazeShow = {
  id: number
  url: string | null
  name: string
  type: string | null
  language: string | null
  genres: string[]
  status: string
  premiered: string | null
  summary: string | null
  image: {
    medium?: string | null
    original?: string | null
  } | null
  network: TvmazeChannel
  webChannel: TvmazeChannel
  externals: {
    imdb?: string | null
    thetvdb?: number | null
  } | null
}

type TvmazeEpisode = {
  id: number
  url: string | null
  name: string
  season: number | null
  number: number | null
  airdate: string | null
  airtime: string | null
  show?: TvmazeShow
}

type TvmazeAdapterOptions = {
  country?: string
  days?: number
  minIntervalMs?: number
  startDate?: () => string
  baseUrl?: string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const DEFAULT_TVMAZE_BASE_URL = "https://api.tvmaze.com"
const DEFAULT_SYNC_DAYS = 7
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const TVMAZE_TIMEOUT_MS = 30000

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function addDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00`)
  date.setDate(date.getDate() + days)

  return formatLocalDate(date)
}

function stripHtml(value: string | null): string | null {
  if (!value) return null

  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null
}

function mapStatus(status: string): "upcoming" | "released" | "ongoing" | "ended" | "returning" | "unknown" {
  const normalized = status.toLowerCase()
  if (normalized.includes("running")) return "ongoing"
  if (normalized.includes("ended")) return "ended"
  if (normalized.includes("development")) return "upcoming"

  return "unknown"
}

function releaseStatus(releaseDate: string | null, today: string): string {
  if (!releaseDate) return "unknown"
  if (releaseDate === today) return "airing_today"
  if (releaseDate > today) return "upcoming"

  return "available"
}

function channelName(show: TvmazeShow): string {
  return show.webChannel?.name ?? show.network?.name ?? "TVmaze"
}

function channelRegion(show: TvmazeShow): string {
  return show.webChannel?.country?.code ?? show.network?.country?.code ?? "global"
}

function releasePattern(show: TvmazeShow): string {
  return show.webChannel ? "streaming_drop" : "weekly"
}

function sourceContentType(show: TvmazeShow): string {
  const delivery = show.webChannel ? "web" : "tv"
  return show.type ? `${show.type}:${delivery}` : delivery
}

function todayLocalDate(): string {
  return formatLocalDate(new Date())
}

function releaseFromEpisode(episode: TvmazeEpisode, today: string): ReleaseInput {
  const show = episode.show!

  return {
    platform: channelName(show),
    region: channelRegion(show),
    releaseDate: episode.airdate,
    releaseTime: episode.airtime || null,
    releasePattern: releasePattern(show),
    releaseStatus: releaseStatus(episode.airdate, today),
    seasonNumber: episode.season,
    episodeNumber: episode.number,
    source: "tvmaze",
    sourceUrl: episode.url ?? show.url
  }
}

function itemFromEpisodes(show: TvmazeShow, episodes: TvmazeEpisode[], today: string): AdapterItem {
  const contentType = sourceContentType(show)
  const classification = classifyMedia({
    source: "tvmaze",
    sourceContentType: contentType,
    genres: show.genres
  })
  const region = channelRegion(show)

  return {
    media: {
      source: "tvmaze",
      sourceId: `tvmaze-${show.id}`,
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: contentType,
      titleDisplay: show.name,
      titleOriginal: show.name,
      titleAliases: [],
      overview: stripHtml(show.summary),
      posterUrl: show.image?.original ?? show.image?.medium ?? null,
      productionCountries: region === "global" ? [] : [region],
      originalLanguage: show.language,
      genres: show.genres,
      firstReleaseDate: show.premiered ?? episodes[0]?.airdate ?? null,
      status: mapStatus(show.status),
      tmdbId: null,
      tvmazeId: show.id,
      imdbId: show.externals?.imdb ?? null,
      traktId: null,
      tvdbId: show.externals?.thetvdb ?? null
    },
    releases: episodes.map((episode) => releaseFromEpisode(episode, today)),
    popularitySignals: []
  }
}

function groupByShow(episodes: TvmazeEpisode[], today: string): AdapterItem[] {
  const grouped = new Map<number, TvmazeEpisode[]>()

  for (const episode of episodes) {
    if (!episode.show) continue

    const current = grouped.get(episode.show.id) ?? []
    current.push(episode)
    grouped.set(episode.show.id, current)
  }

  return Array.from(grouped.values())
    .filter((group) => group[0]?.show)
    .map((group) => itemFromEpisodes(group[0].show!, group, today))
}

export function createTvmazeAdapter(options: TvmazeAdapterOptions = {}): SourceAdapter {
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const country = options.country ?? "US"
  const days = options.days ?? DEFAULT_SYNC_DAYS
  const startDate = options.startDate ?? todayLocalDate
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings

  return {
    source: "tvmaze",
    async fetchItems() {
      const currentSettings = settings.view()
      const baseUrl = ((options.baseUrl ?? currentSettings.get("TVMAZE_BASE_URL")) || DEFAULT_TVMAZE_BASE_URL)
        .replace(/\/$/, "")
      const settingsOverride = captureSourceProxySettings(currentSettings, "tvmaze")

      async function fetchSchedule(path: string): Promise<TvmazeEpisode[]> {
        return limiter.run(() => httpClient.fetchJson<TvmazeEpisode[]>("tvmaze", `${baseUrl}${path}`, {
          timeoutMs: TVMAZE_TIMEOUT_MS,
          settingsOverride
        }))
      }

      const start = startDate()
      const episodes: TvmazeEpisode[] = []

      for (let index = 0; index < days; index += 1) {
        const date = addDays(start, index)
        const schedule = await fetchSchedule(`/schedule?country=${country}&date=${date}`)
        const webSchedule = await fetchSchedule(`/schedule/web?date=${date}&country=`)
        episodes.push(...schedule, ...webSchedule)
      }

      return groupByShow(episodes, start)
    }
  }
}

export const tvmazeAdapter = createTvmazeAdapter()
