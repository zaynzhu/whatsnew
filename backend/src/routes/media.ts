import { Router } from "express"
import { db } from "../config/db.js"
import { withDataSources } from "../domain/mediaPresenter.js"

export const mediaRouter = Router()

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
      popularitySignals: { select: { source: true } }
    },
    orderBy,
    take
  })

  res.json({ items: items.map(withDataSources), nextCursor: null })
})

mediaRouter.get("/:id", async (req, res) => {
  const item = await db.mediaItem.findUnique({
    where: { id: req.params.id },
    include: {
      releases: { orderBy: { releaseDate: "asc" } },
      popularitySignals: { orderBy: { capturedAt: "desc" } },
      changeEvents: { orderBy: { eventAt: "desc" } }
    }
  })

  if (!item) {
    res.status(404).json({ error: "media_not_found" })
    return
  }

  res.json(item)
})
