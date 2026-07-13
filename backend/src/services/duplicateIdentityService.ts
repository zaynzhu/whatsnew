import type { MediaItem, PrismaClient } from "@prisma/client"
import { normalizeTitle, parseJsonArray, toJsonArray } from "../domain/normalizer.js"

type ReconciliationOptions = {
  database: PrismaClient
  apply?: boolean
  limit?: number
}

export type DuplicateIdentityResult = {
  groups: number
  merged: number
  conflicts: number
  samples: string[]
}

export type UniqueTitleIdentityResult = {
  groups: number
  merged: number
  ambiguous: number
  samples: string[]
}

export type SharedDateTitleResult = {
  groups: number
  merged: number
  samples: string[]
}

const IDENTITY_FIELDS = ["tmdbId", "tvmazeId", "imdbId", "traktId", "tvdbId"] as const
const TITLE_ALIASES_STORAGE_LIMIT = 191
const UNKNOWN_LANGUAGE_SOURCES = new Set([
  "apple_tv_plus",
  "disney_plus",
  "hulu",
  "iqiyi",
  "max",
  "prime_video",
  "youku"
])

type ReconciliationMediaItem = MediaItem & {
  _count: {
    sourceRefs: number
    releases: number
    popularitySignals: number
  }
}

type TitleReconciliationMediaItem = ReconciliationMediaItem & {
  sourceRefs: Array<{ source: string; isActive: boolean }>
}

function identityScore(item: MediaItem): number {
  return IDENTITY_FIELDS.reduce((score, field) => score + Number(item[field] != null), 0)
}

function hasExternalIdentity(item: MediaItem): boolean {
  return identityScore(item) > 0
}

function relationScore(item: MediaItem & { _count: { sourceRefs: number; releases: number; popularitySignals: number } }): number {
  return item._count.sourceRefs * 4 + item._count.releases * 2 + item._count.popularitySignals
}

function hasIdentityConflict(left: MediaItem, right: MediaItem): boolean {
  return IDENTITY_FIELDS.some((field) => (
    field !== "tmdbId"
    && left[field] != null
    && right[field] != null
    && left[field] !== right[field]
  ))
}

function compactAliases(values: string[]): string[] {
  const aliases: string[] = []
  for (const value of [...new Set(values.map((item) => item.trim()).filter(Boolean))]) {
    const next = [...aliases, value]
    if (toJsonArray(next).length <= TITLE_ALIASES_STORAGE_LIMIT) aliases.push(value)
  }
  return aliases
}

function releaseKey(release: {
  source: string
  platform: string
  region: string
  releaseDate: string | null
  seasonNumber: number | null
  episodeNumber: number | null
}): string {
  return [
    release.source,
    release.platform,
    release.region,
    release.releaseDate ?? "",
    release.seasonNumber ?? "",
    release.episodeNumber ?? ""
  ].join("|")
}

async function mergeDuplicate(
  database: PrismaClient,
  canonical: ReconciliationMediaItem,
  duplicate: ReconciliationMediaItem
): Promise<ReconciliationMediaItem> {
  return database.$transaction(async (transaction) => {
    const releases = await transaction.release.findMany({
      where: { mediaItemId: { in: [canonical.id, duplicate.id] } },
      orderBy: { fetchedAt: "desc" }
    })
    const seenReleaseKeys = new Set<string>()
    const duplicateReleaseIds: string[] = []
    for (const release of releases) {
      const key = releaseKey(release)
      if (seenReleaseKeys.has(key)) duplicateReleaseIds.push(release.id)
      else seenReleaseKeys.add(key)
    }
    if (duplicateReleaseIds.length > 0) {
      await transaction.release.deleteMany({ where: { id: { in: duplicateReleaseIds } } })
    }

    await transaction.mediaSourceRef.updateMany({
      where: { mediaItemId: duplicate.id },
      data: { mediaItemId: canonical.id }
    })
    await transaction.release.updateMany({
      where: { mediaItemId: duplicate.id },
      data: { mediaItemId: canonical.id }
    })
    await transaction.popularitySignal.updateMany({
      where: { mediaItemId: duplicate.id },
      data: { mediaItemId: canonical.id }
    })
    await transaction.changeEvent.updateMany({
      where: { mediaItemId: duplicate.id },
      data: { mediaItemId: canonical.id }
    })

    const titleAliases = compactAliases([
      ...parseJsonArray(canonical.titleAliases),
      duplicate.titleDisplay,
      ...parseJsonArray(duplicate.titleAliases)
    ].filter((title) => title !== canonical.titleDisplay))
    const merged = await transaction.mediaItem.update({
      where: { id: canonical.id },
      data: {
        titleOriginal: canonical.titleOriginal ?? duplicate.titleOriginal,
        titleAliases: toJsonArray(titleAliases),
        overview: canonical.overview ?? duplicate.overview,
        posterUrl: canonical.posterUrl ?? duplicate.posterUrl,
        firstReleaseDate: canonical.firstReleaseDate ?? duplicate.firstReleaseDate,
        originalLanguage: canonical.originalLanguage ?? duplicate.originalLanguage,
        heatScore: Math.max(canonical.heatScore, duplicate.heatScore),
        tmdbId: canonical.tmdbId ?? duplicate.tmdbId,
        tvmazeId: canonical.tvmazeId ?? duplicate.tvmazeId,
        imdbId: canonical.imdbId ?? duplicate.imdbId,
        traktId: canonical.traktId ?? duplicate.traktId,
        tvdbId: canonical.tvdbId ?? duplicate.tvdbId
      },
      include: { _count: { select: { sourceRefs: true, releases: true, popularitySignals: true } } }
    })
    await transaction.mediaItem.delete({ where: { id: duplicate.id } })
    return merged
  })
}

export async function reconcileDuplicateTmdbIdentities(
  options: ReconciliationOptions
): Promise<DuplicateIdentityResult> {
  const items = await options.database.mediaItem.findMany({
    where: { tmdbId: { not: null } },
    include: { _count: { select: { sourceRefs: true, releases: true, popularitySignals: true } } },
    orderBy: { createdAt: "asc" },
    take: Math.max(2, Math.min(options.limit ?? 5000, 10000))
  })
  const grouped = new Map<string, typeof items>()
  for (const item of items) {
    const key = `${item.mediaType}:${item.tmdbId}`
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }
  const duplicateGroups = [...grouped.values()].filter((group) => group.length > 1)
  const result: DuplicateIdentityResult = {
    groups: duplicateGroups.length,
    merged: 0,
    conflicts: 0,
    samples: []
  }

  for (const group of duplicateGroups) {
    const sorted = [...group].sort((left, right) => (
      identityScore(right) - identityScore(left)
      || relationScore(right) - relationScore(left)
      || left.createdAt.getTime() - right.createdAt.getTime()
    ))
    let canonical = sorted[0]
    const duplicates = sorted.slice(1)
    if (duplicates.some((duplicate) => hasIdentityConflict(canonical, duplicate))) {
      result.conflicts += 1
      continue
    }
    if (result.samples.length < 20) {
      result.samples.push(`${canonical.titleDisplay} (${canonical.tmdbId}) x${group.length}`)
    }
    if (!options.apply) continue

    for (const duplicate of duplicates) {
      canonical = await mergeDuplicate(options.database, canonical, duplicate)
      result.merged += 1
    }
  }

  return result
}

function releaseYearsCompatible(left: MediaItem, right: MediaItem): boolean {
  if (!left.firstReleaseDate || !right.firstReleaseDate) return true
  return left.firstReleaseDate.slice(0, 4) === right.firstReleaseDate.slice(0, 4)
}

function normalizedLanguage(value: string | null): string | null {
  return value?.trim().toLowerCase().replace(/_/g, "-").split("-")[0] ?? null
}

function hasOnlyUnknownLanguageSources(item: TitleReconciliationMediaItem): boolean {
  const activeSources = item.sourceRefs.filter((ref) => ref.isActive).map((ref) => ref.source)
  return activeSources.length > 0 && activeSources.every((source) => UNKNOWN_LANGUAGE_SOURCES.has(source))
}

function languagesCompatible(
  canonical: ReconciliationMediaItem,
  duplicate: TitleReconciliationMediaItem
): boolean {
  if (hasOnlyUnknownLanguageSources(duplicate)) return true
  const canonicalLanguage = normalizedLanguage(canonical.originalLanguage)
  const duplicateLanguage = normalizedLanguage(duplicate.originalLanguage)
  return canonicalLanguage == null || duplicateLanguage == null || canonicalLanguage === duplicateLanguage
}

export async function reconcileUniqueTitleIdentities(
  options: ReconciliationOptions
): Promise<UniqueTitleIdentityResult> {
  const items = await options.database.mediaItem.findMany({
    include: {
      sourceRefs: { select: { source: true, isActive: true } },
      _count: { select: { sourceRefs: true, releases: true, popularitySignals: true } }
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(2, Math.min(options.limit ?? 10000, 10000))
  })
  const grouped = new Map<string, typeof items>()
  for (const item of items) {
    const title = normalizeTitle(item.titleDisplay)
    if (!title) continue
    const key = `${item.mediaType}:${title}`
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }

  const result: UniqueTitleIdentityResult = {
    groups: 0,
    merged: 0,
    ambiguous: 0,
    samples: []
  }

  for (const group of grouped.values()) {
    if (group.length < 2) continue
    const identityAnchors = group.filter(hasExternalIdentity)
    const sourceOnlyItems = group.filter((item) => !hasExternalIdentity(item))
    if (sourceOnlyItems.length === 0) continue
    if (identityAnchors.length !== 1) {
      if (identityAnchors.length > 1) result.ambiguous += 1
      continue
    }

    let canonical: ReconciliationMediaItem = identityAnchors[0]
    const duplicates = sourceOnlyItems.filter((duplicate) => (
      releaseYearsCompatible(canonical, duplicate)
      && languagesCompatible(canonical, duplicate)
    ))
    if (duplicates.length === 0) continue

    result.groups += 1
    if (result.samples.length < 20) {
      result.samples.push(`${canonical.titleDisplay} x${duplicates.length + 1}`)
    }
    if (!options.apply) continue

    for (const duplicate of duplicates) {
      canonical = await mergeDuplicate(options.database, canonical, duplicate)
      result.merged += 1
    }
  }

  return result
}

function activeSources(item: TitleReconciliationMediaItem): string[] {
  return item.sourceRefs.filter((ref) => ref.isActive).map((ref) => ref.source)
}

export async function reconcileSharedDateTitles(
  options: ReconciliationOptions
): Promise<SharedDateTitleResult> {
  const items = await options.database.mediaItem.findMany({
    where: {
      firstReleaseDate: { not: null },
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    include: {
      sourceRefs: { select: { source: true, isActive: true } },
      _count: { select: { sourceRefs: true, releases: true, popularitySignals: true } }
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(2, Math.min(options.limit ?? 10000, 10000))
  })
  const grouped = new Map<string, typeof items>()
  for (const item of items) {
    const title = normalizeTitle(item.titleDisplay)
    if (!title || !item.firstReleaseDate) continue
    const key = `${item.mediaType}:${title}:${item.firstReleaseDate}`
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }

  const result: SharedDateTitleResult = {
    groups: 0,
    merged: 0,
    samples: []
  }

  for (const group of grouped.values()) {
    if (group.length < 2) continue
    const sourceFamilies = new Set(group.flatMap(activeSources))
    if (sourceFamilies.size < 2) continue
    const sorted = [...group].sort((left, right) => (
      relationScore(right) - relationScore(left)
      || left.createdAt.getTime() - right.createdAt.getTime()
    ))
    let canonical: ReconciliationMediaItem = sorted[0]
    const duplicates = sorted.slice(1).filter((duplicate) => languagesCompatible(canonical, duplicate))
    if (duplicates.length === 0) continue

    result.groups += 1
    if (result.samples.length < 20) {
      result.samples.push(`${canonical.titleDisplay} (${canonical.firstReleaseDate}) x${duplicates.length + 1}`)
    }
    if (!options.apply) continue

    for (const duplicate of duplicates) {
      canonical = await mergeDuplicate(options.database, canonical, duplicate)
      result.merged += 1
    }
  }

  return result
}
