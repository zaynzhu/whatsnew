import cors from "cors"
import express, { type Router } from "express"
import { env } from "./config/env.js"
import { calendarRouter } from "./routes/calendar.js"
import { dashboardRouter } from "./routes/dashboard.js"
import { mediaRouter } from "./routes/media.js"
import { posterHealthRouter } from "./routes/posterHealth.js"
import { settingsRouter } from "./routes/settings.js"
import { sourceHealthRouter } from "./routes/sourceHealth.js"
import { sourcesRouter, syncRouter } from "./routes/sources.js"
import { trendingRouter } from "./routes/trending.js"

type AppDependencies = {
  mediaRouter?: Router
  settingsRouter?: Router
  sourceHealthRouter?: Router
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
  app.use("/api/media", dependencies.mediaRouter ?? mediaRouter)
  app.use("/api/poster-health", posterHealthRouter)
  app.use("/api/trending", trendingRouter)
  app.use("/api/calendar", calendarRouter)
  app.use("/api/settings", dependencies.settingsRouter ?? settingsRouter)
  app.use("/api/sources", dependencies.sourcesRouter ?? sourcesRouter)
  app.use("/api/source-health", dependencies.sourceHealthRouter ?? sourceHealthRouter)
  app.use("/api/sync", dependencies.syncRouter ?? syncRouter)

  return app
}
