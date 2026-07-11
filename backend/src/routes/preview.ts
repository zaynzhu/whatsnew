import { Router } from "express"
import { doubanUpcomingAdapter } from "../adapters/doubanAdapter.js"
import { db } from "../config/db.js"
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
        OR: [{ releaseDate: null }, { releaseDate: { gte: today } }]
      },
      include: { mediaItem: true },
      orderBy: [{ releaseDate: "asc" }, { fetchedAt: "desc" }],
      take: 500
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
  const dated = releases.filter((release) => release.releaseDate !== null)
  const undated = releases.filter((release) => release.releaseDate === null)
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
      movies: releases.filter((release) => release.mediaItem.mediaType === "movie").length,
      series: releases.filter((release) => release.mediaItem.mediaType === "series").length,
      undated: undated.length
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
