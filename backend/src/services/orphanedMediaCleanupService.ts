import type { PrismaClient } from "@prisma/client"

type CleanupDatabase = Pick<PrismaClient, "mediaItem">

type CleanupOptions = {
  database: CleanupDatabase
  sources: string[]
  apply?: boolean
  limit?: number
}

export type OrphanedMediaCleanupResult = {
  matched: number
  deleted: number
  samples: string[]
}

export async function cleanupOrphanedMedia(options: CleanupOptions): Promise<OrphanedMediaCleanupResult> {
  const sources = [...new Set(options.sources.filter(Boolean))]
  if (sources.length === 0) throw new Error("孤立作品清理至少需要一个来源")

  const candidates = await options.database.mediaItem.findMany({
    where: {
      sourceRefs: {
        some: { source: { in: sources } },
        none: { isActive: true }
      },
      releases: { none: {} },
      popularitySignals: { none: {} }
    },
    select: { id: true, titleDisplay: true },
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(options.limit ?? 1000, 5000))
  })

  if (options.apply && candidates.length > 0) {
    await options.database.mediaItem.deleteMany({
      where: { id: { in: candidates.map((candidate) => candidate.id) } }
    })
  }

  return {
    matched: candidates.length,
    deleted: options.apply ? candidates.length : 0,
    samples: candidates.slice(0, 20).map((candidate) => candidate.titleDisplay)
  }
}
