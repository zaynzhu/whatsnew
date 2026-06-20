import type { Prisma } from "@prisma/client"
import { Router } from "express"
import { z } from "zod"
import { db } from "../config/db.js"

export const trendingRouter = Router()

const trendingQuerySchema = z.object({
  source: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  mediaType: z.string().min(1).optional(),
  releaseForm: z.string().min(1).optional(),
  window: z.string().min(1).optional(),
  movement: z.enum(["new", "rising", "falling", "stable"]).optional()
})

type Movement = z.infer<typeof trendingQuerySchema>["movement"]

function movementWhere(movement: Movement): Prisma.PopularitySignalWhereInput {
  if (movement === "new") return { previousRank: null, rank: { not: null } }
  if (movement === "rising") return { rankDelta: { gt: 0 } }
  if (movement === "falling") return { rankDelta: { lt: 0 } }
  if (movement === "stable") return { rankDelta: 0 }
  return {}
}

function movementOrderBy(
  movement: Movement
): Prisma.PopularitySignalOrderByWithRelationInput[] {
  if (movement === "rising") return [{ rankDelta: "desc" }, { rank: "asc" }]
  if (movement === "falling") return [{ rankDelta: "asc" }, { rank: "asc" }]
  return [{ rank: "asc" }, { capturedAt: "desc" }]
}

trendingRouter.get("/", async (req, res) => {
  const parsed = trendingQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query" })
    return
  }

  const query = parsed.data
  const signals = await db.popularitySignal.findMany({
    where: {
      isCurrent: true,
      source: query.source,
      platform: query.platform,
      region: query.region,
      window: query.window,
      ...movementWhere(query.movement),
      mediaItem: {
        mediaType: query.mediaType,
        releaseForm: query.releaseForm
      }
    },
    include: { mediaItem: true },
    orderBy: movementOrderBy(query.movement),
    take: 50
  })

  res.json({ items: signals })
})
