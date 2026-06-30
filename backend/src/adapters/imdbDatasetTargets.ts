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
  titleYearMediaTypeLanguages: Map<string, string | null>
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

function titleKeysForRow(row: ImdbTitleBasicsRow): string[] {
  const mediaType = rowMediaType(row)
  if (mediaType == null || row.startYear == null) return []

  return [row.primaryTitle, row.originalTitle ?? ""]
    .map((title) => targetKey(title, row.startYear as number, mediaType))
    .filter((key): key is string => key != null)
}

export function createImdbTargetIndex(candidates: ExistingMediaCandidate[]): ImdbTargetIndex {
  const imdbIds = new Set<string>()
  const titleYearMediaTypeKeys = new Set<string>()
  const titleYearMediaTypeLanguages = new Map<string, string | null>()

  for (const candidate of candidates) {
    if (candidate.imdbId) imdbIds.add(candidate.imdbId)

    const year = yearFromDate(candidate.firstReleaseDate)
    if (year == null || candidate.imdbId) continue

    for (const title of [candidate.titleDisplay, ...candidate.titleAliases]) {
      const key = targetKey(title, year, candidate.mediaType)
      if (!key) continue

      titleYearMediaTypeKeys.add(key)
      if (!titleYearMediaTypeLanguages.has(key)) {
        titleYearMediaTypeLanguages.set(key, candidate.originalLanguage)
      }
    }
  }

  return { imdbIds, titleYearMediaTypeKeys, titleYearMediaTypeLanguages }
}

export function imdbRowMatchesTargets(row: ImdbTitleBasicsRow, targets: ImdbTargetIndex): boolean {
  if (targets.imdbIds.has(row.tconst)) return true

  const mediaType = rowMediaType(row)
  if (mediaType == null || row.startYear == null) return false

  return titleKeysForRow(row).some((key) => targets.titleYearMediaTypeKeys.has(key))
}

export function targetLanguageForImdbRow(
  row: ImdbTitleBasicsRow,
  targets: ImdbTargetIndex
): string | null | undefined {
  for (const key of titleKeysForRow(row)) {
    if (targets.titleYearMediaTypeLanguages.has(key)) {
      return targets.titleYearMediaTypeLanguages.get(key)
    }
  }

  return undefined
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
    if (!item) continue

    const targetLanguage = targetLanguageForImdbRow(row, targets)
    if (targetLanguage !== undefined && item.media.originalLanguage == null) {
      item.media.originalLanguage = targetLanguage
    }
    items.push(item)
  }

  return items
}
