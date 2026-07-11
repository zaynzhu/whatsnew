import { Router } from "express"
import { db } from "../config/db.js"
import {
  contentAttentionWeight,
  featuredScore,
  type AttentionMedia
} from "../domain/contentAttention.js"
import { withDataSources } from "../domain/mediaPresenter.js"
import { contentWeightMap } from "../settings/contentAttentionSettings.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import { getUpcomingDateWindow } from "../utils/date.js"

export const dashboardRouter = Router()

dashboardRouter.get("/", async (_req, res) => {
  const { from: today, to: weekEnd } = getUpcomingDateWindow()
  const weights = contentWeightMap(runtimeSettings)

  const [todayPool, weekPool, trendingPool, events, sourceRuns] = await Promise.all([
    db.release.findMany({
      where: { releaseDate: today },
      include: { mediaItem: true },
      take: 250
    }),
    db.release.findMany({
      where: { releaseDate: { gte: today, lte: weekEnd } },
      include: { mediaItem: true },
      take: 500
    }),
    db.mediaItem.findMany({
      include: {
        releases: { select: { source: true } },
        popularitySignals: { where: { isCurrent: true }, select: { source: true } }
      },
      orderBy: { heatScore: "desc" },
      take: 50
    }),
    db.changeEvent.findMany({
      include: {
        mediaItem: {
          select: { id: true, titleDisplay: true }
        }
      },
      orderBy: { eventAt: "desc" },
      take: 20
    }),
    db.sourceSyncRun.findMany({
      where: { source: { not: "demo" } },
      orderBy: { startedAt: "desc" },
      take: 50
    })
  ])
  const releasePriority = (release: { mediaItem: AttentionMedia }) => (
    contentAttentionWeight(release.mediaItem, weights) * 100 + release.mediaItem.heatScore
  )
  const todayReleases = [...todayPool]
    .sort((left, right) => releasePriority(right) - releasePriority(left))
    .slice(0, 12)
  const weekReleases = [...weekPool]
    .sort((left, right) => releasePriority(right) - releasePriority(left))
    .slice(0, 24)
  const trending = trendingPool.map(withDataSources)
  const candidates = new Map<string, { media: AttentionMedia & { id: string }, timingBoost: number }>()

  for (const media of trending) candidates.set(media.id, { media, timingBoost: 0 })
  for (const release of weekPool) {
    const current = candidates.get(release.mediaItem.id)
    candidates.set(release.mediaItem.id, {
      media: release.mediaItem,
      timingBoost: Math.max(current?.timingBoost ?? 0, 5)
    })
  }
  for (const release of todayPool) {
    candidates.set(release.mediaItem.id, { media: release.mediaItem, timingBoost: 10 })
  }

  const featured = [...candidates.values()]
    .sort((left, right) => (
      featuredScore(right.media, weights, right.timingBoost)
      - featuredScore(left.media, weights, left.timingBoost)
    ))
    .slice(0, 5)
    .map((candidate) => candidate.media)
  const sources = sourceRuns.filter((run, index) => (
    sourceRuns.findIndex((candidate) => candidate.source === run.source) === index
  ))

  res.json({
    today: todayReleases,
    week: weekReleases,
    featured,
    trending: trending.slice(0, 12),
    events,
    sources
  })
})
