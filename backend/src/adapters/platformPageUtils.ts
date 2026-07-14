import { createHash } from "node:crypto"
import type { MediaType, ReleaseForm } from "@whatsnew/shared/media"
import type { AdapterItem } from "../domain/types.js"

export type PlatformReleaseCandidate = {
  title: string
  titleAliases?: string[]
  sourceContentType: string
  releaseDate: string | null
  originalReleaseYear?: number | null
  releasePattern?: string
  description: string | null
  labels: string[]
  sourceUrl: string
  posterUrl?: string | null
}

export type PlatformAdapterConfig = {
  source: "hulu" | "disney_plus" | "max" | "apple_tv_plus" | "prime_video"
  platform: "Hulu" | "Disney+" | "Max" | "Apple TV+" | "Prime Video"
  region: string
  defaultLanguage: string | null
  defaultGenres: string[]
  sourceUrl: string
}

type PlatformClassification = {
  mediaType: MediaType
  releaseForm: ReleaseForm
}

const MONTHS: Record<string, string> = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  sept: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12"
}

export function cleanPlatformText(value: string | null | undefined): string | null {
  const cleaned = value
    ?.replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return cleaned || null
}

export function stripSeasonQualifier(value: string): string {
  const colonQualifier = value.replace(
    /\s*:\s*(?:(?:complete\s+)?seasons?\b|(?:(?:[a-z-]+\s+)?(?:docu)?series|film|movie|special)\s+premiere\b).*$/i,
    ""
  )

  return colonQualifier
    .replace(
      /\s+(?:\((?:subbed|dubbed)(?:\s*&\s*(?:subbed|dubbed))?\)\s*)?(?:complete\s+)?seasons?\s+\d.*$/i,
      ""
    )
    .trim()
}

export function parseEnglishReleaseDate(text: string, fallbackYear: number): string | null {
  const normalized = text
    .replace(/,/g, " ")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
  const match = normalized.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?\b/)

  if (!match) return null

  const month = MONTHS[match[1].toLowerCase()]
  if (!month) return null

  const day = match[2].padStart(2, "0")
  const year = match[3] ?? String(fallbackYear)

  return `${year}-${month}-${day}`
}

function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12)
}

function includesPattern(value: string, pattern: RegExp): boolean {
  return pattern.test(value)
}

const DOCUMENTARY_PATTERN = /\b(?:documentary|documentaries|docuseries)\b/i
const MOVIE_PATTERN = /\b(?:movie|movies|film|films)\b/i
const SERIES_PATTERN = /\b(?:series|season|seasons|episode|episodes|show|shows)\b/i
const SPECIAL_PATTERN = /\b(?:special|specials|reality)\b/i

function normalizedSourceContentType(value: string): string {
  return cleanPlatformText(value)?.toLowerCase() ?? ""
}

function classifyCandidate(candidate: PlatformReleaseCandidate): PlatformClassification | null {
  const combined = [
    candidate.sourceContentType,
    candidate.title,
    candidate.description,
    ...candidate.labels
  ]
    .map((value) => cleanPlatformText(value))
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()

  if (includesPattern(combined, DOCUMENTARY_PATTERN)) {
    if (includesPattern(combined, MOVIE_PATTERN)) {
      return { mediaType: "documentary", releaseForm: "documentary_film" }
    }

    return { mediaType: "documentary", releaseForm: "documentary_series" }
  }

  if (includesPattern(combined, MOVIE_PATTERN)) {
    return { mediaType: "movie", releaseForm: "streaming_movie" }
  }

  if (includesPattern(combined, SERIES_PATTERN)) {
    return { mediaType: "series", releaseForm: "tv_series" }
  }

  if (includesPattern(combined, SPECIAL_PATTERN)) {
    return { mediaType: "variety", releaseForm: "variety_season" }
  }

  return null
}

function mediaStatus(releaseDate: string, today: string): "upcoming" | "released" {
  return releaseDate > today ? "upcoming" : "released"
}

function releaseStatus(releaseDate: string, today: string): "upcoming" | "airing_today" | "available" {
  if (releaseDate > today) return "upcoming"
  if (releaseDate === today) return "airing_today"
  return "available"
}

export function candidateToAdapterItem(
  config: PlatformAdapterConfig,
  candidate: PlatformReleaseCandidate,
  today: string
): AdapterItem | null {
  const title = cleanPlatformText(candidate.title)
  const description = cleanPlatformText(candidate.description)

  if (!title || !candidate.releaseDate) return null

  const classification = classifyCandidate(candidate)
  if (!classification) return null

  const sourceId = `${config.source}-${stableHash([
    title,
    candidate.releaseDate,
    candidate.sourceUrl,
    classification.mediaType,
    classification.releaseForm,
    normalizedSourceContentType(candidate.sourceContentType)
  ].join("|"))}`
  const isCatalogAddition = candidate.releasePattern === "catalog_addition"
  const firstReleaseDate = candidate.originalReleaseYear
    ? String(candidate.originalReleaseYear)
    : isCatalogAddition
      ? null
      : candidate.releaseDate
  const status = isCatalogAddition ? "released" : mediaStatus(firstReleaseDate ?? candidate.releaseDate, today)

  return {
    media: {
      source: config.source,
      sourceId,
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: candidate.sourceContentType,
      titleDisplay: title,
      titleOriginal: null,
      titleAliases: candidate.titleAliases ?? [],
      overview: description,
      posterUrl: candidate.posterUrl ?? null,
      productionCountries: [],
      originalLanguage: config.defaultLanguage,
      genres: [...config.defaultGenres],
      firstReleaseDate,
      status,
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [{
      platform: config.platform,
      region: config.region,
      releaseDate: candidate.releaseDate,
      releaseTime: null,
      releasePattern: candidate.releasePattern ?? "platform_schedule",
      releaseStatus: releaseStatus(candidate.releaseDate, today),
      seasonNumber: null,
      episodeNumber: null,
      source: config.source,
      sourceUrl: candidate.sourceUrl
    }],
    popularitySignals: []
  }
}
