import { Router } from "express"
import {
  getEnabledAdaptersForSource,
  getImplementedAdaptersForSource
} from "../adapters/adapterRegistry.js"
import { db } from "../config/db.js"
import {
  ConnectionTestService,
  connectionTestService
} from "../services/connectionTestService.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { getSourceDefinition } from "../settings/sourceCatalog.js"

type SourcesRouterDependencies = {
  connectionTester?: ConnectionTestService
}

export function createSourcesRouter(dependencies: SourcesRouterDependencies = {}): Router {
  const router = Router()
  const connectionTester = dependencies.connectionTester ?? connectionTestService

  router.get("/", async (_req, res) => {
    const runs = await db.sourceSyncRun.findMany({
      where: { source: { not: "demo" } },
      orderBy: { startedAt: "desc" },
      take: 50
    })

    res.json({ items: runs })
  })

  router.post("/:source/test", async (req, res) => {
    let source
    try {
      source = getSourceDefinition(req.params.source)
    } catch {
      res.status(404).json({ error: "source_not_found" })
      return
    }

    const result = await connectionTester.testSource(source)
    res.json({
      sourceId: source.id,
      implementationStatus: source.implementationStatus,
      result
    })
  })

  router.post("/:source/sync", async (req, res) => {
    const implementedAdapters = getImplementedAdaptersForSource(req.params.source)

    if (implementedAdapters.length === 0) {
      res.status(404).json({ error: "source_not_implemented" })
      return
    }

    const [entry] = getEnabledAdaptersForSource(req.params.source)
    if (!entry) {
      res.status(409).json({ error: "source_disabled" })
      return
    }

    const run = await runSourceSync(db, entry.adapter)

    res.json(run)
  })

  return router
}

export const sourcesRouter = createSourcesRouter()
