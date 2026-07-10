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

  const dayRows = await db.release.groupBy({
    by: ["releaseDate"],
    where,
    _count: { _all: true },
    orderBy: { releaseDate: "asc" },
    take: 62
  })
  const days = await Promise.all(dayRows.flatMap((row) => row.releaseDate ? [row] : []).map(async (row) => {
    const candidates = await db.release.findMany({
      where: { ...where, releaseDate: row.releaseDate },
      include: { mediaItem: true },
      orderBy: { fetchedAt: "desc" },
      take: 24
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
      date: row.releaseDate as string,
      count: row._count._all,
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
