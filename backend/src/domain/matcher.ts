import { normalizeTitle } from "./normalizer.js"
import type { ExistingMediaCandidate, NormalizedMediaInput } from "./types.js"

function year(date: string | null): string | null {
  return date?.slice(0, 4) ?? null
}

const LANGUAGE_ALIASES: Record<string, string> = {
  english: "en",
  chinese: "zh",
  mandarin: "zh",
  japanese: "ja",
  korean: "ko",
  spanish: "es",
  french: "fr",
  german: "de"
}

function normalizeLanguage(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/_/g, "-")
  return LANGUAGE_ALIASES[normalized] ?? normalized.split("-")[0]
}

function hasSharedAlias(input: NormalizedMediaInput, candidate: ExistingMediaCandidate): boolean {
  const inputTitles = [input.titleDisplay, input.titleOriginal ?? "", ...input.titleAliases].map(normalizeTitle).filter(Boolean)
  const candidateTitles = [candidate.titleDisplay, ...candidate.titleAliases].map(normalizeTitle).filter(Boolean)

  return inputTitles.some((title) => candidateTitles.includes(title))
}

export function findBestMatch(input: NormalizedMediaInput, candidates: ExistingMediaCandidate[]): ExistingMediaCandidate | null {
  const byExternalId = candidates.find((candidate) => {
    const sameMediaType = candidate.mediaType === input.mediaType

    return (
      (input.tmdbId != null && candidate.tmdbId === input.tmdbId && sameMediaType) ||
      (input.tvmazeId != null && candidate.tvmazeId === input.tvmazeId) ||
      (input.imdbId != null && candidate.imdbId === input.imdbId) ||
      (input.traktId != null && candidate.traktId === input.traktId && sameMediaType) ||
      (input.tvdbId != null && candidate.tvdbId === input.tvdbId && sameMediaType)
    )
  })
  if (byExternalId) return byExternalId

  const inputYear = year(input.firstReleaseDate)
  const inputTitle = normalizeTitle(input.titleDisplay)

  return (
    candidates.find((candidate) => {
      const sameTitle = normalizeTitle(candidate.titleDisplay) === inputTitle || hasSharedAlias(input, candidate)
      const sameYear = inputYear != null && year(candidate.firstReleaseDate) === inputYear
      const hasUnknownDate = input.firstReleaseDate == null || candidate.firstReleaseDate == null
      const inputLanguage = normalizeLanguage(input.originalLanguage)
      const candidateLanguage = normalizeLanguage(candidate.originalLanguage)
      const sameLanguage = inputLanguage != null && candidateLanguage === inputLanguage
      const sameMediaType = candidate.mediaType === input.mediaType

      return sameTitle && sameLanguage && sameMediaType && (sameYear || hasUnknownDate)
    }) ?? null
  )
}
