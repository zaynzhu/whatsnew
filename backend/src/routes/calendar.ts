import { Router } from "express"
import { db } from "../config/db.js"
import { getUpcomingDateWindow } from "../utils/date.js"

export const calendarRouter = Router()

calendarRouter.get("/", async (req, res) => {
  const defaultWindow = getUpcomingDateWindow()
  const from = typeof req.query.from === "string" ? req.query.from : defaultWindow.from
  const to = typeof req.query.to === "string" ? req.query.to : defaultWindow.to
  const { platform, region, mediaType, releaseForm } = req.query

  const items = await db.release.findMany({
    where: {
      releaseDate: { gte: from, lte: to },
      platform: typeof platform === "string" ? platform : undefined,
      region: typeof region === "string" ? region : undefined,
      mediaItem: {
        mediaType: typeof mediaType === "string" ? mediaType : undefined,
        releaseForm: typeof releaseForm === "string" ? releaseForm : undefined
      }
    },
    include: { mediaItem: true },
    orderBy: { releaseDate: "asc" },
    take: 100
  })

  res.json({ items })
})
