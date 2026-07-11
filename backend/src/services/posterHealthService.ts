import type { PrismaClient } from "@prisma/client"
import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { POSTER_CACHE_DIR } from "./posterImageService.js"

export type PosterHealthSample = {
  id: string
  title: string
  heatScore: number
  sources: string[]
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
  cache: {
    entries: number
    bytes: number
    orphanedFiles: number
    corruptEntries: number
  }
  samples: {
    broken: PosterHealthSample[]
    degraded: PosterHealthSample[]
    missing: PosterHealthSample[]
  }
}

type PosterHealthDatabase = Pick<PrismaClient, "mediaItem">

type PosterHealthServiceOptions = {
  database: PosterHealthDatabase
  cacheDir?: string
}

async function cacheHealth(cacheDir: string): Promise<PosterHealthResponse["cache"]> {
  let names: string[]
  try {
    names = await readdir(cacheDir)
  } catch {
    return { entries: 0, bytes: 0, orphanedFiles: 0, corruptEntries: 0 }
  }

  const bodyKeys = new Set(names.filter((name) => name.endsWith(".bin")).map((name) => name.slice(0, -4)))
  const metadataKeys = new Set(names.filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)))
  const completeKeys = [...bodyKeys].filter((key) => metadataKeys.has(key))
  const orphanedFiles = [...bodyKeys].filter((key) => !metadataKeys.has(key)).length
    + [...metadataKeys].filter((key) => !bodyKeys.has(key)).length
  let bytes = 0
  let corruptEntries = 0

  for (const key of completeKeys) {
    try {
      const [bodyStat, metadataRaw] = await Promise.all([
        stat(join(cacheDir, `${key}.bin`)),
        readFile(join(cacheDir, `${key}.json`), "utf8")
      ])
      const metadata = JSON.parse(metadataRaw) as { url?: unknown; contentType?: unknown; cachedAt?: unknown }
      bytes += bodyStat.size
      if (bodyStat.size <= 0
        || typeof metadata.url !== "string"
        || typeof metadata.contentType !== "string"
        || !metadata.contentType.startsWith("image/")
        || typeof metadata.cachedAt !== "string"
        || !Number.isFinite(Date.parse(metadata.cachedAt))) {
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

function sample(row: {
  id: string
  titleDisplay: string
  heatScore: number
  sourceRefs: Array<{ source: string }>
}): PosterHealthSample {
  return {
    id: row.id,
    title: row.titleDisplay,
    heatScore: row.heatScore,
    sources: [...new Set(row.sourceRefs.map((sourceRef) => sourceRef.source))]
  }
}

export function createPosterHealthService(options: PosterHealthServiceOptions) {
  const database = options.database
  const cacheDir = options.cacheDir ?? POSTER_CACHE_DIR

  return {
    async getHealth(): Promise<PosterHealthResponse> {
      const sampleSelect = {
        id: true,
        titleDisplay: true,
        heatScore: true,
        sourceRefs: {
          where: { isActive: true },
          select: { source: true }
        }
      } as const
      const withPosterWhere = {
        posterUrl: { not: null },
        NOT: { posterUrl: "" }
      } as const
      const [
        total,
        missing,
        unverified,
        healthy,
        degraded,
        broken,
        brokenSamples,
        degradedSamples,
        missingSamples,
        cache
      ] = await Promise.all([
        database.mediaItem.count(),
        database.mediaItem.count({ where: { OR: [{ posterUrl: null }, { posterUrl: "" }] } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterStatus: "unverified" } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterStatus: "healthy" } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterStatus: "degraded" } }),
        database.mediaItem.count({ where: { ...withPosterWhere, posterStatus: "broken" } }),
        database.mediaItem.findMany({
          where: { posterStatus: "broken" },
          orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
          take: 8,
          select: sampleSelect
        }),
        database.mediaItem.findMany({
          where: { posterStatus: "degraded" },
          orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
          take: 8,
          select: sampleSelect
        }),
        database.mediaItem.findMany({
          where: { OR: [{ posterUrl: null }, { posterUrl: "" }] },
          orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
          take: 8,
          select: sampleSelect
        }),
        cacheHealth(cacheDir)
      ])
      const withPoster = total - missing

      return {
        total,
        withPoster,
        missing,
        coveragePercent: total > 0 ? Math.round(withPoster / total * 1000) / 10 : 0,
        statuses: { unverified, healthy, degraded, broken },
        cache,
        samples: {
          broken: brokenSamples.map(sample),
          degraded: degradedSamples.map(sample),
          missing: missingSamples.map(sample)
        }
      }
    }
  }
}
