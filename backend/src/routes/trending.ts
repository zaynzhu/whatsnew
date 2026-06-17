import { Router } from "express"
import { db } from "../config/db.js"

export const trendingRouter = Router()

trendingRouter.get("/", async (req, res) => {
  const { source, mediaType, releaseForm, window } = req.query
  const signals = await db.popularitySignal.findMany({
    where: {
      source: typeof source === "string" ? source : undefined,
      window: typeof window === "string" ? window : undefined,
      mediaItem: {
        mediaType: typeof mediaType === "string" ? mediaType : undefined,
        releaseForm: typeof releaseForm === "string" ? releaseForm : undefined
      }
    },
    include: { mediaItem: true },
    orderBy: [{ rank: "asc" }, { capturedAt: "desc" }],
    take: 50
  })

  res.json({ items: signals })
})
