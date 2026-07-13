import { normalizeTitle } from "./normalizer.js"
import type { ExistingMediaCandidate, NormalizedMediaInput } from "./types.js"
import { hasSameWorkKind } from "./mediaWorkKind.js"

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

function hasExternalIdentity(candidate: ExistingMediaCandidate): boolean {
  return candidate.tmdbId != null
    || candidate.tvmazeId != null
    || candidate.imdbId != null
    || candidate.traktId != null
    || candidate.tvdbId != null
}

export function findBestMatch(input: NormalizedMediaInput, candidates: ExistingMediaCandidate[]): ExistingMediaCandidate | null {
  const byExternalId = candidates.find((candidate) => {
    const sameWorkKind = hasSameWorkKind(input, candidate)

    return (
      (input.tmdbId != null && candidate.tmdbId === input.tmdbId && sameWorkKind) ||
      (input.tvmazeId != null && candidate.tvmazeId === input.tvmazeId && sameWorkKind) ||
      (input.imdbId != null && candidate.imdbId === input.imdbId && sameWorkKind) ||
      (input.traktId != null && candidate.traktId === input.traktId && sameWorkKind) ||
      (input.tvdbId != null && candidate.tvdbId === input.tvdbId && sameWorkKind)
    )
  })
  if (byExternalId) return byExternalId

  const inputYear = year(input.firstReleaseDate)
  const inputTitle = normalizeTitle(input.titleDisplay)

  const inputLanguage = normalizeLanguage(input.originalLanguage)
  const titleMatches = candidates.filter((candidate) => {
    const sameTitle = normalizeTitle(candidate.titleDisplay) === inputTitle || hasSharedAlias(input, candidate)
    const sameYear = inputYear != null && year(candidate.firstReleaseDate) === inputYear
    const hasUnknownDate = input.firstReleaseDate == null || candidate.firstReleaseDate == null
    const sameMediaType = candidate.mediaType === input.mediaType

    return sameTitle && sameMediaType && (sameYear || hasUnknownDate)
  })

  if (inputLanguage != null) {
    return titleMatches.find((candidate) => normalizeLanguage(candidate.originalLanguage) === inputLanguage) ?? null
  }

  const identityMatches = titleMatches.filter(hasExternalIdentity)
  return identityMatches.length === 1 ? identityMatches[0] : null
}
