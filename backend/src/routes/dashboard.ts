import { Router } from "express"
import { db } from "../config/db.js"
import { withDataSources } from "../domain/mediaPresenter.js"
import { getUpcomingDateWindow } from "../utils/date.js"

export const dashboardRouter = Router()

dashboardRouter.get("/", async (_req, res) => {
  const { from: today, to: weekEnd } = getUpcomingDateWindow()

  const [todayReleases, weekReleases, trending, events, sourceRuns] = await Promise.all([
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
      include: {
        releases: { select: { source: true } },
        popularitySignals: { select: { source: true } }
      },
      orderBy: { heatScore: "desc" },
      take: 12
    }),
    db.changeEvent.findMany({
      orderBy: { eventAt: "desc" },
      take: 20
    }),
    db.sourceSyncRun.findMany({
      where: { source: { not: "demo" } },
      orderBy: { startedAt: "desc" },
      take: 50
    })
  ])
  const sources = sourceRuns.filter((run, index) => (
    sourceRuns.findIndex((candidate) => candidate.source === run.source) === index
  ))

  res.json({
    today: todayReleases,
    week: weekReleases,
    trending: trending.map(withDataSources),
    events,
    sources
  })
})
