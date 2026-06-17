import cors from "cors"
import express from "express"
import { env } from "./config/env.js"

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.CORS_ORIGIN }))
  app.use(express.json())

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "whatsnew-backend" })
  })

  return app
}
