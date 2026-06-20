import { Router } from "express"
import { db } from "../config/db.js"
import { getUpcomingDateWindow } from "../utils/date.js"

export const dashboardRouter = Router()

dashboardRouter.get("/", async (_req, res) => {
  const { from: today, to: weekEnd } = getUpcomingDateWindow()

  const [todayReleases, weekReleases, trending, events, sources] = await Promise.all([
    db.release.findMany({
      where: { releaseDate: today },
      include: { mediaItem: true },
      take: 12
    }),
    db.release.findMany({
      where: { releaseDate: { gte: today, lte: weekEnd } },
      include: { mediaItem: true },
      take: 24
    }),
    db.mediaItem.findMany({
      orderBy: { heatScore: "desc" },
      take: 12
    }),
    db.changeEvent.findMany({
      orderBy: { eventAt: "desc" },
      take: 20
    }),
    db.sourceSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10
    })
  ])

  res.json({
    today: todayReleases,
    week: weekReleases,
    trending,
    events,
    sources
  })
})
