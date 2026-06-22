import { Router } from "express"
import { z } from "zod"
import { db } from "../config/db.js"
import { withDataSources } from "../domain/mediaPresenter.js"

export const mediaRouter = Router()

const historyQuerySchema = z.object({
  source: z.string().min(1).optional(),
  days: z.coerce.number().int().min(1).max(90).default(30),
  limit: z.coerce.number().int().min(1).max(1000).default(300)
})

const DAY_MS = 24 * 60 * 60 * 1000

mediaRouter.get("/", async (req, res) => {
  const { mediaType, releaseForm, status, sort = "heat", limit = "50" } = req.query
  const take = Math.min(Number(limit) || 50, 100)
  const orderBy =
    sort === "firstReleaseDate"
      ? { firstReleaseDate: "asc" as const }
      : sort === "updatedAt"
        ? { updatedAt: "desc" as const }
        : { heatScore: "desc" as const }

  const items = await db.mediaItem.findMany({
    where: {
      mediaType: typeof mediaType === "string" ? mediaType : undefined,
      releaseForm: typeof releaseForm === "string" ? releaseForm : undefined,
      status: typeof status === "string" ? status : undefined
    },
    include: {
      releases: { select: { source: true } },
      popularitySignals: {
        where: { isCurrent: true },
        select: { source: true }
      }
    },
    orderBy,
    take
  })

  res.json({ items: items.map(withDataSources), nextCursor: null })
})

mediaRouter.get("/:id/popularity-history", async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query" })
    return
  }

  const { source, days, limit } = parsed.data
  const cutoff = new Date(Date.now() - days * DAY_MS)
  const items = await db.popularitySignal.findMany({
    where: {
      mediaItemId: req.params.id,
      source,
      capturedAt: { gte: cutoff }
    },
    orderBy: { capturedAt: "asc" },
    take: limit
  })

  res.json({ items })
})

mediaRouter.get("/:id", async (req, res) => {
  const item = await db.mediaItem.findUnique({
    where: { id: req.params.id },
    include: {
      releases: { orderBy: { releaseDate: "asc" } },
      sourceRefs: {
        orderBy: [
          { source: "asc" },
          { sourceId: "asc" }
        ]
      },
      popularitySignals: {
        where: { isCurrent: true },
        orderBy: { capturedAt: "desc" }
      },
      changeEvents: { orderBy: { eventAt: "desc" } }
    }
  })

  if (!item) {
    res.status(404).json({ error: "media_not_found" })
    return
  }

  res.json(item)
})
