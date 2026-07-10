import { Router } from "express"
import { db } from "../config/db.js"
import { getUpcomingDateWindow } from "../utils/date.js"

export const calendarRouter = Router()

calendarRouter.get("/", async (req, res) => {
  const defaultWindow = getUpcomingDateWindow()
  const from = typeof req.query.from === "string" ? req.query.from : defaultWindow.from
  const to = typeof req.query.to === "string" ? req.query.to : defaultWindow.to
  const { platform, region, mediaType, releaseForm } = req.query
  const summaryOnly = req.query.summary === "true"
  const where = {
    releaseDate: { gte: from, lte: to },
    platform: typeof platform === "string" ? platform : undefined,
    region: typeof region === "string" ? region : undefined,
    mediaItem: {
      mediaType: typeof mediaType === "string" ? mediaType : undefined,
      releaseForm: typeof releaseForm === "string" ? releaseForm : undefined
    }
  }

  const dayMediaRows = await db.release.groupBy({
    by: ["releaseDate", "mediaItemId"],
    where,
    orderBy: { releaseDate: "asc" },
    take: 10000
  })
  const mediaIdsByDate = new Map<string, string[]>()
  for (const row of dayMediaRows) {
    if (!row.releaseDate) continue
    const mediaIds = mediaIdsByDate.get(row.releaseDate) ?? []
    mediaIds.push(row.mediaItemId)
    mediaIdsByDate.set(row.releaseDate, mediaIds)
  }
  const days = await Promise.all([...mediaIdsByDate.entries()].slice(0, 62).map(async ([date, mediaItemIds]) => {
    const candidates = await db.release.findMany({
      where: { ...where, releaseDate: date },
      include: { mediaItem: true },
      orderBy: { fetchedAt: "desc" },
      take: 100
    })
    const seen = new Set<string>()
    const featured = [...candidates]
      .sort((left, right) => (
        Number(Boolean(right.mediaItem.posterUrl)) - Number(Boolean(left.mediaItem.posterUrl))
        || right.mediaItem.heatScore - left.mediaItem.heatScore
      ))
      .filter((release) => {
        if (seen.has(release.mediaItemId)) return false
        seen.add(release.mediaItemId)
        return true
      })
      .slice(0, 3)

    return {
      date,
      count: mediaItemIds.length,
      items: featured
    }
  }))

  const candidates = summaryOnly ? [] : await db.release.findMany({
    where,
    include: { mediaItem: true },
    orderBy: [{ releaseDate: "asc" }, { fetchedAt: "desc" }],
    take: 200
  })
  const items = [...candidates]
    .sort((left, right) => (
      (left.releaseDate ?? "").localeCompare(right.releaseDate ?? "")
      || Number(Boolean(right.mediaItem.posterUrl)) - Number(Boolean(left.mediaItem.posterUrl))
      || right.mediaItem.heatScore - left.mediaItem.heatScore
    ))
    .slice(0, 100)

  res.json({ items, days })
})
