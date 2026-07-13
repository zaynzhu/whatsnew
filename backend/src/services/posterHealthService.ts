import type { Prisma, PrismaClient } from "@prisma/client"
import { ACTIVE_MEDIA_WHERE } from "../domain/mediaActivity.js"
import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
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
  }
  replacement: {
    notAttempted: number
    cooldown: number
    retryEligible: number
    retryAfterDays: number
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
  now?: () => Date
}

const POSTER_LOOKUP_RETRY_DAYS = 7
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

function sample(row: {
  id: string
  titleDisplay: string
  heatScore: number
  sourceRefs: Array<{ source: string }>
  posterWidth: number | null
  posterHeight: number | null
  posterLookupAttemptedAt: Date | null
}, retryBefore: Date): PosterHealthSample {
  return {
    id: row.id,
    title: row.titleDisplay,
    heatScore: row.heatScore,
    sources: [...new Set(row.sourceRefs.map((sourceRef) => sourceRef.source))],
    width: row.posterWidth,
    height: row.posterHeight,
    lookupState: row.posterLookupAttemptedAt == null
      ? "not_attempted"
      : row.posterLookupAttemptedAt < retryBefore ? "retry_eligible" : "cooldown",
    lastLookupAt: row.posterLookupAttemptedAt?.toISOString() ?? null
  }
}

export function createPosterHealthService(options: PosterHealthServiceOptions) {
  const database = options.database
  const cacheDir = options.cacheDir ?? POSTER_CACHE_DIR
  const variantCacheDir = options.variantCacheDir ?? POSTER_VARIANT_CACHE_DIR

  return {
    async getHealth(): Promise<PosterHealthResponse> {
      const now = (options.now ?? (() => new Date()))()
      const retryBefore = new Date(now.getTime() - POSTER_LOOKUP_RETRY_DAYS * DAY_MS)
      const sampleSelect = {
        id: true,
        titleDisplay: true,
        heatScore: true,
        posterWidth: true,
        posterHeight: true,
        posterLookupAttemptedAt: true,
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
        database.mediaItem.findMany({
          where: { ...ACTIVE_MEDIA_WHERE, posterStatus: "broken" },
          orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
          take: 8,
          select: sampleSelect
        }),
        database.mediaItem.findMany({
          where: { ...ACTIVE_MEDIA_WHERE, posterStatus: "degraded" },
          orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
          take: 8,
          select: sampleSelect
        }),
        database.mediaItem.findMany({
          where: missingPosterWhere,
          orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
          take: 8,
          select: sampleSelect
        }),
        database.mediaItem.findMany({
          where: { ...withPosterWhere, posterQuality: "undersized" },
          orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
          take: 8,
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
          retryAfterDays: POSTER_LOOKUP_RETRY_DAYS
        },
        replacement: {
          notAttempted: replacementNotAttempted,
          cooldown: replacementCooldown,
          retryEligible: replacementRetryEligible,
          retryAfterDays: POSTER_LOOKUP_RETRY_DAYS
        },
        cache: {
          ...cache,
          variants: { ...variantCache, maxBytes: DEFAULT_POSTER_VARIANT_CACHE_MAX_BYTES }
        },
        samples: {
          broken: brokenSamples.map((row) => sample(row, retryBefore)),
          degraded: degradedSamples.map((row) => sample(row, retryBefore)),
          missing: missingSamples.map((row) => sample(row, retryBefore)),
          undersized: undersizedSamples.map((row) => sample(row, retryBefore))
        }
      }
    }
  }
}
