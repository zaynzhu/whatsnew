import type { Prisma, PrismaClient } from "@prisma/client"
import type { ContentAttentionCategory } from "@whatsnew/shared/settings"
import { attentionHeatScore, contentAttentionCategory } from "../domain/contentAttention.js"
import { ACTIVE_MEDIA_WHERE } from "../domain/mediaActivity.js"
import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { contentWeightMap } from "../settings/contentAttentionSettings.js"
import { type RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { POSTER_CACHE_DIR } from "./posterImageService.js"
import { POSTER_VARIANT_CACHE_DIR, POSTER_VARIANT_WIDTHS } from "./posterVariantService.js"
import { DEFAULT_POSTER_VARIANT_CACHE_MAX_BYTES } from "./posterVariantCacheMaintenanceService.js"

type DiskCacheHealth = {
  entries: number
  bytes: number
  orphanedFiles: number
  corruptEntries: number
}

export type PosterHealthSample = {
  id: string
  title: string
  heatScore: number
  attentionCategory: ContentAttentionCategory
  priorityScore: number
  sources: string[]
  width: number | null
  height: number | null
  lookupState: "not_attempted" | "cooldown" | "retry_eligible"
  lastLookupAt: string | null
}

export type PosterHealthResponse = {
  total: number
  withPoster: number
  missing: number
  coveragePercent: number
  missingBySource: Array<{
    source: string
    count: number
  }>
  statuses: {
    unverified: number
    healthy: number
    degraded: number
    broken: number
  }
  quality: {
    unknown: number
    adequate: number
    undersized: number
  }
  lookup: {
    notAttempted: number
    cooldown: number
    retryEligible: number
    retryAfterDays: number
    nextCooldownExpiryAt: string | null
  }
  replacement: {
    notAttempted: number
    cooldown: number
    retryEligible: number
    retryAfterDays: number
    nextCooldownExpiryAt: string | null
  }
  cache: DiskCacheHealth & { variants: DiskCacheHealth & { maxBytes: number } }
  samples: {
    broken: PosterHealthSample[]
    degraded: PosterHealthSample[]
    missing: PosterHealthSample[]
    undersized: PosterHealthSample[]
  }
}

type PosterHealthDatabase = Pick<PrismaClient, "mediaItem">

type PosterHealthServiceOptions = {
  database: PosterHealthDatabase
  cacheDir?: string
  variantCacheDir?: string
  settings?: RuntimeSettingsService
  now?: () => Date
}

const POSTER_LOOKUP_RETRY_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

async function cacheHealth(
  cacheDir: string,
  bodyExtension: ".bin" | ".webp",
  validateMetadata: (metadata: Record<string, unknown>) => boolean
): Promise<DiskCacheHealth> {
  let names: string[]
  try {
    names = await readdir(cacheDir)
  } catch {
    return { entries: 0, bytes: 0, orphanedFiles: 0, corruptEntries: 0 }
  }

  const bodyKeys = new Set(names
    .filter((name) => name.endsWith(bodyExtension))
    .map((name) => name.slice(0, -bodyExtension.length)))
  const metadataKeys = new Set(names.filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)))
  const completeKeys = [...bodyKeys].filter((key) => metadataKeys.has(key))
  const orphanedFiles = [...bodyKeys].filter((key) => !metadataKeys.has(key)).length
    + [...metadataKeys].filter((key) => !bodyKeys.has(key)).length
  let bytes = 0
  let corruptEntries = 0

  for (const key of completeKeys) {
    try {
      const [bodyStat, metadataRaw] = await Promise.all([
        stat(join(cacheDir, `${key}${bodyExtension}`)),
        readFile(join(cacheDir, `${key}.json`), "utf8")
      ])
      const metadata = JSON.parse(metadataRaw) as Record<string, unknown>
      bytes += bodyStat.size
      if (bodyStat.size <= 0
        || typeof metadata.url !== "string"
        || typeof metadata.contentType !== "string"
        || !metadata.contentType.startsWith("image/")
        || typeof metadata.cachedAt !== "string"
        || !Number.isFinite(Date.parse(metadata.cachedAt))
        || !validateMetadata(metadata)) {
        corruptEntries += 1
      }
    } catch {
      corruptEntries += 1
    }
  }

  return {
    entries: completeKeys.length,
    bytes,
    orphanedFiles,
    corruptEntries
  }
}

function originalMetadataIsValid(): boolean {
  return true
}

function variantMetadataIsValid(metadata: Record<string, unknown>): boolean {
  return metadata.contentType === "image/webp"
    && typeof metadata.sourceDigest === "string"
    && metadata.sourceDigest.length === 64
    && typeof metadata.requestedWidth === "number"
    && POSTER_VARIANT_WIDTHS.includes(metadata.requestedWidth as typeof POSTER_VARIANT_WIDTHS[number])
    && (metadata.width === null || typeof metadata.width === "number")
    && (metadata.height === null || typeof metadata.height === "number")
}

type SampleRow = {
  id: string
  titleDisplay: string
  mediaType: string
  releaseForm: string
  sourceContentType: string | null
  genres: string
  heatScore: number
  posterUrl: string | null
  sourceRefs: Array<{ source: string }>
  posterWidth: number | null
  posterHeight: number | null
  posterLookupAttemptedAt: Date | null
  updatedAt: Date
}

function sample(
  row: SampleRow,
  retryBefore: Date,
  weights: Record<ContentAttentionCategory, number>
): PosterHealthSample {
  return {
    id: row.id,
    title: row.titleDisplay,
    heatScore: row.heatScore,
    attentionCategory: contentAttentionCategory(row),
    priorityScore: Math.round(attentionHeatScore(row, weights) * 10) / 10,
    sources: [...new Set(row.sourceRefs.map((sourceRef) => sourceRef.source))],
    width: row.posterWidth,
    height: row.posterHeight,
    lookupState: row.posterLookupAttemptedAt == null
      ? "not_attempted"
      : row.posterLookupAttemptedAt < retryBefore ? "retry_eligible" : "cooldown",
    lastLookupAt: row.posterLookupAttemptedAt?.toISOString() ?? null
  }
}

function rankedSamples(
  rows: SampleRow[],
  retryBefore: Date,
  weights: Record<ContentAttentionCategory, number>
): PosterHealthSample[] {
  return [...rows]
    .sort((left, right) => (
      attentionHeatScore(right, weights) - attentionHeatScore(left, weights)
      || right.updatedAt.getTime() - left.updatedAt.getTime()
    ))
    .slice(0, 8)
    .map((row) => sample(row, retryBefore, weights))
}

function cooldownExpiry(row: { posterLookupAttemptedAt: Date | null } | null): string | null {
  if (!row?.posterLookupAttemptedAt) return null
  return new Date(row.posterLookupAttemptedAt.getTime() + POSTER_LOOKUP_RETRY_DAYS * DAY_MS).toISOString()
}

function countMissingBySource(rows: Array<{ sourceRefs: Array<{ source: string }> }>): PosterHealthResponse["missingBySource"] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const source of new Set(row.sourceRefs.map((sourceRef) => sourceRef.source))) {
      counts.set(source, (counts.get(source) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
}

export function createPosterHealthService(options: PosterHealthServiceOptions) {
  const database = options.database
  const cacheDir = options.cacheDir ?? POSTER_CACHE_DIR
  const variantCacheDir = options.variantCacheDir ?? POSTER_VARIANT_CACHE_DIR

  return {
    async getHealth(): Promise<PosterHealthResponse> {
      const now = (options.now ?? (() => new Date()))()
      const retryBefore = new Date(now.getTime() - POSTER_LOOKUP_RETRY_DAYS * DAY_MS)
      const weights = contentWeightMap((options.settings ?? runtimeSettings).view())
      const sampleSelect = {
        id: true,
        titleDisplay: true,
        mediaType: true,
        releaseForm: true,
        sourceContentType: true,
        genres: true,
        heatScore: true,
        posterUrl: true,
        posterWidth: true,
        posterHeight: true,
        posterLookupAttemptedAt: true,
        updatedAt: true,
        sourceRefs: {
          where: { isActive: true },
          select: { source: true }
        }
      } as const
      const withPosterWhere = {
        ...ACTIVE_MEDIA_WHERE,
        posterUrl: { not: null },
        NOT: { posterUrl: "" }
      } as const
      const missingPosterWhere: Prisma.MediaItemWhereInput = {
        ...ACTIVE_MEDIA_WHERE,
        OR: [{ posterUrl: null }, { posterUrl: "" }]
      }
      const undersizedPosterWhere: Prisma.MediaItemWhereInput = {
        ...withPosterWhere,
        posterQuality: "undersized"
      }
      const [
        total,
        missing,
        unverified,
        healthy,
        degraded,
        broken,
        qualityUnknown,
        qualityAdequate,
        qualityUndersized,
        lookupNotAttempted,
        lookupCooldown,
        lookupRetryEligible,
        replacementNotAttempted,
        replacementCooldown,
        replacementRetryEligible,
        nextLookupCooldown,
        nextReplacementCooldown,
        missingSourceRows,
        brokenSamples,
        degradedSamples,
        missingSamples,
        undersizedSamples,
        cache,
        variantCache
      ] = await Promise.all([
        database.mediaItem.count({ where: ACTIVE_MEDIA_WHERE }),
        database.mediaItem.count({ where: missingPosterWhere }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterStatus: "unverified" } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterStatus: "healthy" } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterStatus: "degraded" } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterStatus: "broken" } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterQuality: "unknown" } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterQuality: "adequate" } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterQuality: "undersized" } }),
        database.mediaItem.count({ where: { AND: [missingPosterWhere, { posterLookupAttemptedAt: null }] } }),
        database.mediaItem.count({ where: { AND: [missingPosterWhere, { posterLookupAttemptedAt: { gte: retryBefore } }] } }),
        database.mediaItem.count({ where: { AND: [missingPosterWhere, { posterLookupAttemptedAt: { lt: retryBefore } }] } }),
        database.mediaItem.count({ where: { AND: [undersizedPosterWhere, { posterLookupAttemptedAt: null }] } }),
        database.mediaItem.count({ where: { AND: [undersizedPosterWhere, { posterLookupAttemptedAt: { gte: retryBefore } }] } }),
        database.mediaItem.count({ where: { AND: [undersizedPosterWhere, { posterLookupAttemptedAt: { lt: retryBefore } }] } }),
        database.mediaItem.findFirst({
          where: { AND: [missingPosterWhere, { posterLookupAttemptedAt: { gte: retryBefore } }] },
          orderBy: { posterLookupAttemptedAt: "asc" },
          select: { posterLookupAttemptedAt: true }
        }),
        database.mediaItem.findFirst({
          where: { AND: [undersizedPosterWhere, { posterLookupAttemptedAt: { gte: retryBefore } }] },
          orderBy: { posterLookupAttemptedAt: "asc" },
          select: { posterLookupAttemptedAt: true }
        }),
        database.mediaItem.findMany({
          where: missingPosterWhere,
          select: {
            sourceRefs: {
              where: { isActive: true },
              select: { source: true }
            }
          }
        }),
        database.mediaItem.findMany({
          where: { ...ACTIVE_MEDIA_WHERE, posterStatus: "broken" },
          select: sampleSelect
        }),
        database.mediaItem.findMany({
          where: { ...ACTIVE_MEDIA_WHERE, posterStatus: "degraded" },
          select: sampleSelect
        }),
        database.mediaItem.findMany({
          where: missingPosterWhere,
          select: sampleSelect
        }),
        database.mediaItem.findMany({
          where: { ...withPosterWhere, posterQuality: "undersized" },
          select: sampleSelect
        }),
        cacheHealth(cacheDir, ".bin", originalMetadataIsValid),
        cacheHealth(variantCacheDir, ".webp", variantMetadataIsValid)
      ])
      const withPoster = total - missing

      return {
        total,
        withPoster,
        missing,
        coveragePercent: total > 0 ? Math.round(withPoster / total * 1000) / 10 : 0,
        missingBySource: countMissingBySource(missingSourceRows),
        statuses: { unverified, healthy, degraded, broken },
        quality: {
          unknown: qualityUnknown,
          adequate: qualityAdequate,
          undersized: qualityUndersized
        },
        lookup: {
          notAttempted: lookupNotAttempted,
          cooldown: lookupCooldown,
          retryEligible: lookupRetryEligible,
          retryAfterDays: POSTER_LOOKUP_RETRY_DAYS,
          nextCooldownExpiryAt: cooldownExpiry(nextLookupCooldown)
        },
        replacement: {
          notAttempted: replacementNotAttempted,
          cooldown: replacementCooldown,
          retryEligible: replacementRetryEligible,
          retryAfterDays: POSTER_LOOKUP_RETRY_DAYS,
          nextCooldownExpiryAt: cooldownExpiry(nextReplacementCooldown)
        },
        cache: {
          ...cache,
          variants: { ...variantCache, maxBytes: DEFAULT_POSTER_VARIANT_CACHE_MAX_BYTES }
        },
        samples: {
          broken: rankedSamples(brokenSamples, retryBefore, weights),
          degraded: rankedSamples(degradedSamples, retryBefore, weights),
          missing: rankedSamples(missingSamples, retryBefore, weights),
          undersized: rankedSamples(undersizedSamples, retryBefore, weights)
        }
      }
    }
  }
}
