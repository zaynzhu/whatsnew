import type { PrismaClient } from "@prisma/client"
import { Router } from "express"
import { z } from "zod"
import { db } from "../config/db.js"
import { ACTIVE_MEDIA_WHERE } from "../domain/mediaActivity.js"
import { withDataSources } from "../domain/mediaPresenter.js"
import {
  LOOKUP_CONTRACT_VERSION,
  MAX_LOOKUP_BATCH_SIZE,
  createMediaLookupService
} from "../services/mediaLookupService.js"
import {
  markPosterDegraded,
  markPosterHealthy,
  type PosterHealthRecord
} from "../services/posterHealthStateService.js"
import { posterImageService, type PosterImageService } from "../services/posterImageService.js"
import {
  POSTER_VARIANT_WIDTHS,
  posterVariantService,
  type PosterVariantService,
  type PosterVariantWidth
} from "../services/posterVariantService.js"

type MediaRouterDependencies = {
  database?: PrismaClient
  posterService?: Pick<PosterImageService, "getPoster">
  variantService?: Pick<PosterVariantService, "getVariant">
}

const historyQuerySchema = z.object({
  source: z.string().min(1).optional(),
  days: z.coerce.number().int().min(1).max(90).default(30),
  limit: z.coerce.number().int().min(1).max(1000).default(300)
})

const DAY_MS = 24 * 60 * 60 * 1000
const posterQuerySchema = z.object({
  width: z.coerce.number().int().refine(
    (value): value is PosterVariantWidth => POSTER_VARIANT_WIDTHS.includes(value as PosterVariantWidth)
  ).optional()
})

// mediaType 在本端点语义为作品大类（movie/series），服务端按 mediaWorkKind 大类边界隔离
const lookupBodySchema = z.object({
  contractVersion: z.literal(LOOKUP_CONTRACT_VERSION).optional(),
  mediaType: z.enum(["movie", "series"]),
  doubanIds: z.array(z.number().int().positive()).default([]),
  imdbIds: z.array(z.string().regex(/^tt\d+$/)).default([])
})

export function createMediaRouter(dependencies: MediaRouterDependencies = {}): Router {
  const router = Router()
  const database = dependencies.database ?? db
  const posters = dependencies.posterService ?? posterImageService
  const variants = dependencies.variantService ?? posterVariantService

  // 只读批量身份查询：不触发同步、不写库，复用详情端点的数据快照语义
  router.post("/lookup", async (req, res) => {
    const body = typeof req.body === "object" && req.body != null ? req.body : {}
    const version = (body as { contractVersion?: unknown }).contractVersion
    if (version !== undefined && version !== LOOKUP_CONTRACT_VERSION) {
      res.status(400).json({ error: "unsupported_contract_version", supportedVersion: LOOKUP_CONTRACT_VERSION })
      return
    }

    const parsed = lookupBodySchema.safeParse(body)
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" })
      return
    }

    const { mediaType, doubanIds, imdbIds } = parsed.data
    const totalQueries = doubanIds.length + imdbIds.length
    if (totalQueries > MAX_LOOKUP_BATCH_SIZE) {
      res.status(400).json({ error: "batch_too_large", maxBatchSize: MAX_LOOKUP_BATCH_SIZE })
      return
    }
    if (totalQueries === 0) {
      res.status(400).json({ error: "empty_lookup_batch" })
      return
    }

    const lookup = createMediaLookupService(database).lookup
    res.json(await lookup({ workKind: mediaType, doubanIds, imdbIds }))
  })

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
        ...ACTIVE_MEDIA_WHERE,
        mediaType: typeof mediaType === "string" ? mediaType : undefined,
        releaseForm: typeof releaseForm === "string" ? releaseForm : undefined,
        status: typeof status === "string" ? status : undefined,
        OR: query ? [
          { titleDisplay: { contains: query } },
          { titleChinese: { contains: query } },
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
    const parsed = posterQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_poster_width", allowedWidths: POSTER_VARIANT_WIDTHS })
      return
    }

    const item = await database.mediaItem.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        posterUrl: true,
        posterStatus: true,
        posterCheckedAt: true,
        posterFailureCount: true,
        posterWidth: true,
        posterHeight: true,
        posterQuality: true
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
      const output = parsed.data.width
        ? await variants.getVariant(item.posterUrl, image, parsed.data.width)
        : image
      res.setHeader("Content-Type", output.contentType)
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
      res.setHeader("X-Poster-Cache", image.cacheStatus)
      if (parsed.data.width) {
        res.setHeader("X-Poster-Variant-Cache", output.cacheStatus)
        if (output.width) res.setHeader("X-Poster-Width", String(output.width))
      }
      if (image.cacheStatus === "stale") {
        await markPosterDegraded(database, item as PosterHealthRecord, "stale_cache_fallback", new Date(), image)
          .catch(() => {})
      } else {
        await markPosterHealthy(database, item as PosterHealthRecord, new Date(), image).catch(() => {})
      }
      res.send(output.body)
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
        ratings: {
          orderBy: [
            { source: "asc" },
            { audience: "desc" }
          ]
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
