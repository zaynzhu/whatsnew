import type { PrismaClient } from "@prisma/client"
import { posterImageService, type PosterImageService } from "./posterImageService.js"
import {
  markPosterDegraded,
  markPosterHealthy,
  posterQuality
} from "./posterHealthStateService.js"

const DAY_MS = 24 * 60 * 60 * 1000
const DEGRADED_RETRY_DAYS = 1
const BROKEN_RETRY_DAYS = 7

type PosterVerificationDatabase = Pick<PrismaClient, "mediaItem">

type PosterVerificationOptions = {
  database: PosterVerificationDatabase
  imageService?: Pick<PosterImageService, "getPoster">
  limit?: number
  now?: () => Date
  force?: boolean
}

export type PosterVerificationResult = {
  scanned: number
  healthy: number
  degraded: number
  failed: number
  adequate: number
  undersized: number
  unknown: number
  samples: string[]
}

export async function verifyPosterImages(
  options: PosterVerificationOptions
): Promise<PosterVerificationResult> {
  const now = (options.now ?? (() => new Date()))()
  const imageService = options.imageService ?? posterImageService
  const degradedBefore = new Date(now.getTime() - DEGRADED_RETRY_DAYS * DAY_MS)
  const brokenBefore = new Date(now.getTime() - BROKEN_RETRY_DAYS * DAY_MS)
  const retryableStates = options.force
    ? [
        { posterStatus: "unverified" },
        { posterStatus: "degraded" },
        { posterStatus: "broken" },
        { posterQuality: "unknown" }
      ]
    : [
        { posterStatus: "unverified" },
        {
          posterStatus: "degraded",
          OR: [{ posterCheckedAt: null }, { posterCheckedAt: { lt: degradedBefore } }]
        },
        {
          posterStatus: "broken",
          OR: [{ posterCheckedAt: null }, { posterCheckedAt: { lt: brokenBefore } }]
        },
        {
          posterQuality: "unknown",
          OR: [{ posterCheckedAt: null }, { posterCheckedAt: { lt: degradedBefore } }]
        }
      ]
  const items = await options.database.mediaItem.findMany({
    where: {
      posterUrl: { not: null },
      NOT: { posterUrl: "" },
      OR: retryableStates
    },
    orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
    take: Math.max(1, Math.min(options.limit ?? 20, 100)),
    select: {
      id: true,
      titleDisplay: true,
      posterUrl: true,
      posterStatus: true,
      posterCheckedAt: true,
      posterFailureCount: true,
      posterWidth: true,
      posterHeight: true,
      posterQuality: true
    }
  })
  const result: PosterVerificationResult = {
    scanned: items.length,
    healthy: 0,
    degraded: 0,
    failed: 0,
    adequate: 0,
    undersized: 0,
    unknown: 0,
    samples: []
  }

  for (const item of items) {
    if (!item.posterUrl) continue
    try {
      const image = await imageService.getPoster(item.posterUrl)
      if (image.cacheStatus === "stale") {
        await markPosterDegraded(options.database, item, "stale_cache_fallback", now, image)
        result.degraded += 1
      } else {
        await markPosterHealthy(options.database, item, now, image)
        result.healthy += 1
      }
      result[posterQuality(image)] += 1
    } catch {
      await markPosterDegraded(options.database, item, "upstream_unavailable", now)
      result.failed += 1
    }
    if (result.samples.length < 10) result.samples.push(item.titleDisplay)
  }

  return result
}
