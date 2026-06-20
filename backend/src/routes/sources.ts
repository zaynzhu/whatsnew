import { Router } from "express"
import { getEnabledAdapter, getImplementedAdapter } from "../adapters/adapterRegistry.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"

export const sourcesRouter = Router()

sourcesRouter.get("/", async (_req, res) => {
  const runs = await db.sourceSyncRun.findMany({
    where: { source: { not: "demo" } },
    orderBy: { startedAt: "desc" },
    take: 50
  })

  res.json({ items: runs })
})

sourcesRouter.post("/:source/sync", async (req, res) => {
  const implementedAdapter = getImplementedAdapter(req.params.source)

  if (!implementedAdapter) {
    res.status(404).json({ error: "source_not_implemented" })
    return
  }

  const adapter = getEnabledAdapter(req.params.source)
  if (!adapter) {
    res.status(409).json({ error: "source_disabled" })
    return
  }

  const run = await runSourceSync(db, adapter)

  res.json(run)
})
