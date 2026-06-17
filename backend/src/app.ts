import cors from "cors"
import express from "express"
import { env } from "./config/env.js"
import { calendarRouter } from "./routes/calendar.js"
import { dashboardRouter } from "./routes/dashboard.js"
import { mediaRouter } from "./routes/media.js"
import { sourcesRouter } from "./routes/sources.js"
import { trendingRouter } from "./routes/trending.js"

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.CORS_ORIGIN }))
  app.use(express.json())

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "whatsnew-backend" })
  })

  app.use("/api/dashboard", dashboardRouter)
  app.use("/api/media", mediaRouter)
  app.use("/api/trending", trendingRouter)
  app.use("/api/calendar", calendarRouter)
  app.use("/api/sources", sourcesRouter)

  return app
}
