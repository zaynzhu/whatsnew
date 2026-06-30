import type { MediaType, ReleaseForm } from "@whatsnew/shared/media"
import type { AdapterItem } from "../domain/types.js"

export type ImdbTitleBasicsRow = {
  tconst: string
  titleType: string
  primaryTitle: string
  originalTitle: string | null
  isAdult: boolean
  startYear: number | null
  endYear: number | null
  runtimeMinutes: number | null
  genres: string[]
}

export type ImdbTitleRatingRow = {
  tconst: string
  averageRating: number
  numVotes: number
}

export type ParsedImdbTsvRow = Record<string, string | null>
type TitleTypeMapping = {
  mediaType: MediaType
  releaseForm: ReleaseForm
}

const TITLE_TYPE_MAP: Record<string, TitleTypeMapping> = {
  movie: { mediaType: "movie", releaseForm: "theatrical_movie" },
  tvMovie: { mediaType: "movie", releaseForm: "streaming_movie" },
  tvSeries: { mediaType: "series", releaseForm: "tv_series" },
  tvMiniSeries: { mediaType: "series", releaseForm: "tv_series" }
}
const VOTE_FORMATTER = new Intl.NumberFormat("en-US")

function imdbNull(value: string | undefined): string | null {
  if (value == null || value === "" || value === "\\N") return null
  return value
}

function numberOrNull(value: string | null): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseTsv(text: string, requiredFields: string[]): ParsedImdbTsvRow[] {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.length > 0)

  const headers = lines[0]?.split("\t") ?? []
  for (const field of requiredFields) {
    if (!headers.includes(field)) throw new Error(`IMDb TSV 缺少必需字段: ${field}`)
  }

  return lines.slice(1).map((line) => {
    const values = line.split("\t")
    return Object.fromEntries(headers.map((header, index) => [
      header,
      imdbNull(values[index])
    ]))
  })
}

function genresFrom(value: string | null): string[] {
  if (!value) return []
  return value.split(",").map((genre) => genre.trim()).filter(Boolean)
}

export function parseImdbTitleBasics(text: string): ImdbTitleBasicsRow[] {
  return parseTsv(text, [
    "tconst",
    "titleType",
    "primaryTitle",
    "originalTitle",
    "isAdult",
    "startYear",
    "endYear",
    "runtimeMinutes",
    "genres"
  ]).map(imdbTitleBasicsFromParsedRow)
}

export function parseImdbTitleRatings(text: string): ImdbTitleRatingRow[] {
  return parseTsv(text, [
    "tconst",
    "averageRating",
    "numVotes"
  ]).map(imdbTitleRatingFromParsedRow)
}

export function imdbTitleBasicsFromParsedRow(row: ParsedImdbTsvRow): ImdbTitleBasicsRow {
  return {
    tconst: row.tconst ?? "",
    titleType: row.titleType ?? "",
    primaryTitle: row.primaryTitle ?? "",
    originalTitle: row.originalTitle,
    isAdult: row.isAdult === "1",
    startYear: numberOrNull(row.startYear),
    endYear: numberOrNull(row.endYear),
    runtimeMinutes: numberOrNull(row.runtimeMinutes),
    genres: genresFrom(row.genres)
  }
}

export function imdbTitleRatingFromParsedRow(row: ParsedImdbTsvRow): ImdbTitleRatingRow {
  return {
    tconst: row.tconst ?? "",
    averageRating: Number(row.averageRating ?? 0),
    numVotes: Number(row.numVotes ?? 0)
  }
}

function uniqueTitles(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function firstReleaseDate(startYear: number | null): string | null {
  return startYear == null ? null : `${startYear}-01-01`
}

function ratingSignal(row: ImdbTitleBasicsRow, rating?: ImdbTitleRatingRow): AdapterItem["popularitySignals"] {
  if (!rating || rating.tconst !== row.tconst) return []

  return [{
    source: "imdb_rating",
    sourceCategory: "metadata_rating",
    platform: "IMDb",
    region: "GLOBAL",
    window: "lifetime",
    rank: null,
    rankDelta: null,
    value: rating.averageRating,
    valueLabel: `${rating.averageRating}/10 · ${VOTE_FORMATTER.format(rating.numVotes)} votes`,
    sourceUrl: `https://www.imdb.com/title/${row.tconst}/`
  }]
}

export function imdbRowsToAdapterItem(
  row: ImdbTitleBasicsRow,
  rating?: ImdbTitleRatingRow
): AdapterItem | null {
  if (row.isAdult) return null
  const mapping = TITLE_TYPE_MAP[row.titleType]
  if (!mapping) return null

  return {
    createIfMissing: false,
    media: {
      source: "imdb",
      sourceId: `imdb:${row.tconst}`,
      mediaType: mapping.mediaType,
      releaseForm: mapping.releaseForm,
      sourceContentType: row.titleType,
      titleDisplay: row.primaryTitle,
      titleOriginal: row.originalTitle,
      titleAliases: uniqueTitles([row.primaryTitle, row.originalTitle]),
      overview: null,
      posterUrl: null,
      productionCountries: [],
      originalLanguage: null,
      genres: row.genres,
      firstReleaseDate: firstReleaseDate(row.startYear),
      status: "unknown",
      tmdbId: null,
      tvmazeId: null,
      imdbId: row.tconst,
      traktId: null,
      tvdbId: null
    },
    releases: [],
    popularitySignals: ratingSignal(row, rating)
  }
}
