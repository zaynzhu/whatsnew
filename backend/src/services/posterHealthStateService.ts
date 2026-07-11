import type { PrismaClient } from "@prisma/client"

const POSTER_FAILURE_THRESHOLD = 2
const POSTER_FAILURE_WINDOW_MS = 60 * 1000

export type PosterHealthRecord = {
  id: string
  posterUrl: string | null
  posterStatus: string
  posterCheckedAt: Date | null
  posterFailureCount: number
}

type PosterHealthDatabase = Pick<PrismaClient, "mediaItem">

export async function markPosterHealthy(
  database: PosterHealthDatabase,
  item: PosterHealthRecord,
  now = new Date()
): Promise<void> {
  if (item.posterStatus === "healthy" && item.posterFailureCount === 0) return
  await database.mediaItem.update({
    where: { id: item.id },
    data: {
      posterStatus: "healthy",
      posterCheckedAt: now,
      posterFailureCount: 0,
      posterFailureReason: null
    }
  })
}

export async function markPosterDegraded(
  database: PosterHealthDatabase,
  item: PosterHealthRecord,
  reason: "stale_cache_fallback" | "upstream_unavailable",
  now = new Date()
): Promise<void> {
  if (item.posterCheckedAt && now.getTime() - item.posterCheckedAt.getTime() < POSTER_FAILURE_WINDOW_MS) return
  if (item.posterStatus === "broken") {
    await database.mediaItem.update({
      where: { id: item.id },
      data: {
        posterCheckedAt: now,
        posterFailureReason: reason
      }
    })
    return
  }

  const failureCount = item.posterFailureCount + 1
  await database.mediaItem.update({
    where: { id: item.id },
    data: {
      posterStatus: reason === "upstream_unavailable" && failureCount >= POSTER_FAILURE_THRESHOLD
        ? "broken"
        : "degraded",
      posterCheckedAt: now,
      posterFailureCount: failureCount,
      posterFailureReason: reason
    }
  })
}
