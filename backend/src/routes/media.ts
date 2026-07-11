import type { PrismaClient } from "@prisma/client"
import { Router } from "express"
import { z } from "zod"
import { db } from "../config/db.js"
import { withDataSources } from "../domain/mediaPresenter.js"
import {
  markPosterDegraded,
  markPosterHealthy,
  type PosterHealthRecord
} from "../services/posterHealthStateService.js"
import { posterImageService, type PosterImageService } from "../services/posterImageService.js"

type MediaRouterDependencies = {
  database?: PrismaClient
  posterService?: Pick<PosterImageService, "getPoster">
}

const historyQuerySchema = z.object({
  source: z.string().min(1).optional(),
  days: z.coerce.number().int().min(1).max(90).default(30),
  limit: z.coerce.number().int().min(1).max(1000).default(300)
})

const DAY_MS = 24 * 60 * 60 * 1000

export function createMediaRouter(dependencies: MediaRouterDependencies = {}): Router {
  const router = Router()
  const database = dependencies.database ?? db
  const posters = dependencies.posterService ?? posterImageService

  router.get("/", async (req, res) => {
    const { mediaType, releaseForm, status, sort = "heat", limit = "50" } = req.query
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : ""
    const take = Math.min(Number(limit) || 50, 100)
    const orderBy =
      sort === "firstReleaseDate"
        ? { firstReleaseDate: "asc" as const }
        : sort === "updatedAt"
          ? { updatedAt: "desc" as const }
          : { heatScore: "desc" as const }

    const items = await database.mediaItem.findMany({
      where: {
        mediaType: typeof mediaType === "string" ? mediaType : undefined,
        releaseForm: typeof releaseForm === "string" ? releaseForm : undefined,
        status: typeof status === "string" ? status : undefined,
        OR: query ? [
          { titleDisplay: { contains: query } },
          { titleOriginal: { contains: query } },
          { titleAliases: { contains: query } },
          { sourceRefs: { some: { source: { contains: query }, isActive: true } } },
          { releases: { some: { OR: [
            { source: { contains: query } },
            { platform: { contains: query } }
          ] } } },
          { popularitySignals: { some: { OR: [
            { source: { contains: query } },
            { platform: { contains: query } }
          ] } } }
        ] : undefined
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

  router.get("/:id/popularity-history", async (req, res) => {
    const parsed = historyQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_query" })
      return
    }

    const { source, days, limit } = parsed.data
    const cutoff = new Date(Date.now() - days * DAY_MS)
    const items = await database.popularitySignal.findMany({
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

  router.get("/:id/poster", async (req, res) => {
    const item = await database.mediaItem.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        posterUrl: true,
        posterStatus: true,
        posterCheckedAt: true,
        posterFailureCount: true
      }
    })

    if (!item) {
      res.status(404).json({ error: "media_not_found" })
      return
    }
    if (!item.posterUrl) {
      res.status(404).json({ error: "poster_not_found" })
      return
    }

    try {
      const image = await posters.getPoster(item.posterUrl)
      res.setHeader("Content-Type", image.contentType)
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
      res.setHeader("X-Poster-Cache", image.cacheStatus)
      if (image.cacheStatus === "stale") {
        await markPosterDegraded(database, item as PosterHealthRecord, "stale_cache_fallback").catch(() => {})
      } else {
        await markPosterHealthy(database, item as PosterHealthRecord).catch(() => {})
      }
      res.send(image.body)
    } catch {
      await markPosterDegraded(database, item as PosterHealthRecord, "upstream_unavailable").catch(() => {})
      res.status(502).json({ error: "poster_unavailable" })
    }
  })

  router.get("/:id", async (req, res) => {
    const item = await database.mediaItem.findUnique({
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

  return router
}

export const mediaRouter = createMediaRouter()
