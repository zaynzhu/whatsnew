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
import { SOURCE_CATALOG, getSourceDefinition } from "../settings/sourceCatalog.js"
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
      where: { source: { in: SOURCE_CATALOG.map((source) => source.id) } },
      orderBy: { startedAt: "desc" },
      take: 200
    })
    const latestRuns = new Map<string, (typeof runs)[number]>()
    for (const run of runs) {
      if (!latestRuns.has(run.source)) latestRuns.set(run.source, run)
    }

    res.json({
      items: SOURCE_CATALOG.map((source) => {
        const missingCredentials = settings.missingCredentials(source.id)
        const latestRun = latestRuns.get(source.id)

        return {
          id: source.id,
          name: source.name,
          description: source.description,
          group: source.group,
          implementationStatus: source.implementationStatus,
          enabled: settings.sourceEnabled(source.id),
          runnable: settings.sourceRunnable(source.id),
          proxyMode: settings.sourceProxyMode(source.id),
          credentialsComplete: missingCredentials.length === 0,
          missingCredentials,
          supportsSync: source.supportsSync,
          supportsEnable: source.supportsEnable,
          fields: [],
          semantics: source.semantics,
          latestRun: latestRun ? {
            status: latestRun.status,
            startedAt: latestRun.startedAt.toISOString(),
            finishedAt: latestRun.finishedAt?.toISOString() ?? null,
            itemCount: latestRun.itemCount,
            durationMs: latestRun.durationMs,
            errorMessage: redactStoredError(latestRun.errorMessage, settings)
          } : null
        }
      })
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
