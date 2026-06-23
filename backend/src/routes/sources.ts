import type { PrismaClient } from "@prisma/client"
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
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import { getSourceDefinition } from "../settings/sourceCatalog.js"
import { redactStoredError } from "../settings/settingsRedaction.js"

type SourcesRouterDependencies = {
  connectionTester?: ConnectionTestService
  database?: Pick<PrismaClient, "sourceSyncRun">
  settings?: typeof runtimeSettings
}

export function createSourcesRouter(dependencies: SourcesRouterDependencies = {}): Router {
  const router = Router()
  const connectionTester = dependencies.connectionTester ?? connectionTestService
  const database = dependencies.database ?? db
  const settings = dependencies.settings ?? runtimeSettings

  router.get("/", async (_req, res) => {
    const runs = await database.sourceSyncRun.findMany({
      where: { source: { not: "demo" } },
      orderBy: { startedAt: "desc" },
      take: 50
    })

    res.json({
      items: runs.map((run) => ({
        ...run,
        errorMessage: redactStoredError(run.errorMessage, settings)
      }))
    })
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

    if (!settings.sourceEnabled(req.params.source)) {
      res.status(409).json({ error: "source_disabled" })
      return
    }

    const missingCredentials = settings.missingCredentials(req.params.source)
    if (missingCredentials.length > 0) {
      res.status(409).json({ error: "credential_missing", missingCredentials })
      return
    }

    const entries = getEnabledAdaptersForSource(req.params.source)
    const runs = []
    for (const entry of entries) {
      runs.push(await runSourceSync(db, entry.adapter))
    }

    res.json({ items: runs })
  })

  return router
}

export const sourcesRouter = createSourcesRouter()
