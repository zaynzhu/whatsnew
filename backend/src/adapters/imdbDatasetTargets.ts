import type { MediaType } from "@whatsnew/shared/media"
import { normalizeTitle } from "../domain/normalizer.js"
import type { AdapterItem, ExistingMediaCandidate } from "../domain/types.js"
import {
  imdbRowsToAdapterItem,
  type ImdbTitleBasicsRow,
  type ImdbTitleRatingRow
} from "./imdbDatasetsParser.js"

export type ImdbTargetIndex = {
  imdbIds: Set<string>
  titleYearMediaTypeKeys: Set<string>
}

const TITLE_TYPE_MEDIA_TYPE: Record<string, MediaType> = {
  movie: "movie",
  tvMovie: "movie",
  tvSeries: "series",
  tvMiniSeries: "series"
}

function yearFromDate(date: string | null): number | null {
  if (!date) return null

  const parsed = Number(date.slice(0, 4))
  return Number.isFinite(parsed) ? parsed : null
}

function targetKey(title: string, year: number, mediaType: MediaType): string | null {
  const normalizedTitle = normalizeTitle(title)
  return normalizedTitle ? `${mediaType}:${year}:${normalizedTitle}` : null
}

function rowMediaType(row: ImdbTitleBasicsRow): MediaType | null {
  return TITLE_TYPE_MEDIA_TYPE[row.titleType] ?? null
}

export function createImdbTargetIndex(candidates: ExistingMediaCandidate[]): ImdbTargetIndex {
  const imdbIds = new Set<string>()
  const titleYearMediaTypeKeys = new Set<string>()

  for (const candidate of candidates) {
    if (candidate.imdbId) imdbIds.add(candidate.imdbId)

    const year = yearFromDate(candidate.firstReleaseDate)
    if (year == null || candidate.imdbId) continue

    for (const title of [candidate.titleDisplay, ...candidate.titleAliases]) {
      const key = targetKey(title, year, candidate.mediaType)
      if (key) titleYearMediaTypeKeys.add(key)
    }
  }

  return { imdbIds, titleYearMediaTypeKeys }
}

export function imdbRowMatchesTargets(row: ImdbTitleBasicsRow, targets: ImdbTargetIndex): boolean {
  if (targets.imdbIds.has(row.tconst)) return true

  const mediaType = rowMediaType(row)
  if (mediaType == null || row.startYear == null) return false

  const startYear = row.startYear
  const titles = [row.primaryTitle, row.originalTitle ?? ""]
  return titles.some((title) => {
    const key = targetKey(title, startYear, mediaType)
    return key != null && targets.titleYearMediaTypeKeys.has(key)
  })
}

export function filterImdbRowsForTargets(
  basicsRows: ImdbTitleBasicsRow[],
  ratingRows: ImdbTitleRatingRow[],
  targets: ImdbTargetIndex
): AdapterItem[] {
  const ratingsByTconst = new Map(ratingRows.map((rating) => [rating.tconst, rating]))
  const items: AdapterItem[] = []

  for (const row of basicsRows) {
    if (!imdbRowMatchesTargets(row, targets)) continue

    const item = imdbRowsToAdapterItem(row, ratingsByTconst.get(row.tconst))
    if (item) items.push(item)
  }

  return items
}
