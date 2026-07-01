import cors from "cors"
import express, { type Router } from "express"
import { env } from "./config/env.js"
import { calendarRouter } from "./routes/calendar.js"
import { dashboardRouter } from "./routes/dashboard.js"
import { mediaRouter } from "./routes/media.js"
import { settingsRouter } from "./routes/settings.js"
import { sourcesRouter, syncRouter } from "./routes/sources.js"
import { trendingRouter } from "./routes/trending.js"

type AppDependencies = {
  settingsRouter?: Router
  sourcesRouter?: Router
  syncRouter?: Router
}

export function createApp(dependencies: AppDependencies = {}) {
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
  app.use("/api/settings", dependencies.settingsRouter ?? settingsRouter)
  app.use("/api/sources", dependencies.sourcesRouter ?? sourcesRouter)
  app.use("/api/sync", dependencies.syncRouter ?? syncRouter)

  return app
}
