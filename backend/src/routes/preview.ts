import { Router } from "express"
import { doubanUpcomingAdapter } from "../adapters/doubanAdapter.js"
import { db } from "../config/db.js"
import { ACTIVE_MEDIA_WHERE } from "../domain/mediaActivity.js"
import { isSourceSyncInFlight, runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import { redactStoredError } from "../settings/settingsRedaction.js"

function shanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
  return `${value("year")}-${value("month")}-${value("day")}`
}

export const previewRouter = Router()

previewRouter.get("/", async (_req, res) => {
  const today = shanghaiDate()
  const [rows, latestRun, lastSuccess] = await Promise.all([
    db.release.findMany({
      where: {
        source: "douban",
        releasePattern: { in: ["theatrical_coming_soon", "tv_coming_soon"] },
        mediaItem: ACTIVE_MEDIA_WHERE,
        OR: [{ releaseDate: null }, { releaseDate: { gte: today } }]
      },
      include: { mediaItem: true },
      orderBy: [{ releaseDate: "asc" }, { fetchedAt: "desc" }]
    }),
    db.sourceSyncRun.findFirst({
      where: { source: "douban", scope: { in: ["upcoming", "all"] } },
      orderBy: { startedAt: "desc" }
    }),
    db.sourceSyncRun.findFirst({
      where: {
        source: "douban",
        scope: { in: ["upcoming", "all"] },
        status: { in: ["success", "warning"] }
      },
      orderBy: { finishedAt: "desc" }
    })
  ])

  const releases = [...rows]
    .sort((left, right) => (
      Number(left.releaseDate == null) - Number(right.releaseDate == null)
      || (left.releaseDate ?? "").localeCompare(right.releaseDate ?? "")
      || right.fetchedAt.getTime() - left.fetchedAt.getTime()
    ))
    .filter((release, index, items) => (
      items.findIndex((candidate) => candidate.mediaItemId === release.mediaItemId) === index
    ))
  const hotSignals = releases.length === 0
    ? []
    : await db.popularitySignal.findMany({
        where: {
          mediaItemId: { in: releases.map((release) => release.mediaItemId) },
          source: "douban_upcoming_hot",
          isCurrent: true
        },
        select: {
          mediaItemId: true,
          rankingScope: true,
          rank: true,
          value: true
        },
        orderBy: { rank: "asc" }
      })
  const hotByMediaItemId = new Map<string, typeof hotSignals[number]>()
  for (const signal of hotSignals) {
    if (!hotByMediaItemId.has(signal.mediaItemId)) hotByMediaItemId.set(signal.mediaItemId, signal)
  }
  const previewReleases = releases.map((release) => {
    const hotSignal = hotByMediaItemId.get(release.mediaItemId)
    return {
      ...release,
      doubanHotRank: hotSignal?.rank ?? null,
      doubanHotKind: hotSignal?.rankingScope === "series"
        ? "series"
        : hotSignal?.rankingScope === "movie"
          ? "movie"
          : null,
      doubanWishCount: hotSignal?.value ?? null
    }
  })
  const dated = previewReleases.filter((release) => release.releaseDate !== null)
  const undated = previewReleases.filter((release) => release.releaseDate === null)
  const dates = [...new Set(dated.map((release) => release.releaseDate as string))]

  res.json({
    generatedAt: new Date().toISOString(),
    today,
    source: {
      enabled: runtimeSettings.sourceEnabled("douban"),
      runnable: runtimeSettings.sourceRunnable("douban"),
      syncing: isSourceSyncInFlight("douban") || latestRun?.status === "running",
      latestRun: latestRun ? {
        status: latestRun.status,
        startedAt: latestRun.startedAt.toISOString(),
        finishedAt: latestRun.finishedAt?.toISOString() ?? null,
        itemCount: latestRun.itemCount,
        errorMessage: redactStoredError(latestRun.errorMessage, runtimeSettings)
      } : null,
      lastSuccessAt: lastSuccess?.finishedAt?.toISOString() ?? null
    },
    summary: {
      total: releases.length,
      movies: releases.filter((release) => release.releasePattern === "theatrical_coming_soon").length,
      series: releases.filter((release) => release.releasePattern === "tv_coming_soon").length,
      undated: undated.length,
      hot: previewReleases.filter((release) => release.doubanHotRank !== null).length
    },
    days: dates.map((date) => ({
      date,
      items: dated.filter((release) => release.releaseDate === date)
    })),
    undated
  })
})

previewRouter.post("/sync", async (_req, res) => {
  if (!runtimeSettings.sourceEnabled("douban")) {
    res.status(409).json({ error: "source_disabled" })
    return
  }
  if (!runtimeSettings.sourceRunnable("douban")) {
    res.status(409).json({ error: "source_unavailable" })
    return
  }
  if (isSourceSyncInFlight("douban")) {
    res.status(202).json({ syncing: true })
    return
  }

  const run = await runSourceSync(db, doubanUpcomingAdapter)
  res.json({ syncing: false, run })
})
