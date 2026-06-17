import { Router } from "express"
import { demoSeedAdapter } from "../adapters/demoSeedAdapter.js"
import { tmdbAdapter } from "../adapters/tmdbAdapter.js"
import { tvmazeAdapter } from "../adapters/tvmazeAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"

export const sourcesRouter = Router()

const availableAdapters = {
  demo: demoSeedAdapter,
  tvmaze: tvmazeAdapter,
  tmdb: tmdbAdapter
}

sourcesRouter.get("/", async (_req, res) => {
  const runs = await db.sourceSyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50
  })

  res.json({ items: runs })
})

sourcesRouter.post("/:source/sync", async (req, res) => {
  const adapter = availableAdapters[req.params.source as keyof typeof availableAdapters]

  if (!adapter) {
    res.status(404).json({ error: "source_not_available_in_mvp" })
    return
  }

  const run = await runSourceSync(db, adapter)

  res.json(run)
})
