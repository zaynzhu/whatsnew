import type { PrismaClient } from "@prisma/client"
import type { SourceLocalStateView, SourcePreviewResponse } from "@whatsnew/shared/settings"
import { Router } from "express"
import {
  getEnabledAdapters,
  getEnabledAdaptersForSource,
  getImplementedAdaptersForSource
} from "../adapters/adapterRegistry.js"
import { db } from "../config/db.js"
import {
  ConnectionTestService,
  connectionTestService
} from "../services/connectionTestService.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { previewSourceData } from "../services/sourcePreviewService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import type { RuntimeSettingsService } from "../settings/runtimeSettingsService.js"
import { SOURCE_CATALOG, getSourceDefinition } from "../settings/sourceCatalog.js"
import { redactStoredError } from "../settings/settingsRedaction.js"
import { getImdbCacheStatus } from "../services/imdbCacheStatusService.js"
import { aggregateLatestSourceRuns } from "./sourceRunView.js"

type SourcesRouterDependencies = {
  connectionTester?: ConnectionTestService
  database?: Pick<PrismaClient, "sourceSyncRun">
  previewSource?: (sourceId: string) => Promise<SourcePreviewResponse>
  settings?: RuntimeSettingsService
}

const sourcePreviewsInFlight = new Set<string>()

async function sourceLocalState(
  sourceId: string,
  settings: RuntimeSettingsService
): Promise<SourceLocalStateView | null> {
  if (sourceId !== "imdb") return null
  return getImdbCacheStatus(settings.get("IMDB_DATASET_CACHE_DIR"))
}

export function createSourcesRouter(dependencies: SourcesRouterDependencies = {}): Router {
  const router = Router()
  const connectionTester = dependencies.connectionTester ?? connectionTestService
  const database = dependencies.database ?? db
  const settings = dependencies.settings ?? runtimeSettings
  const previewSource = dependencies.previewSource ?? ((sourceId: string) => (
    previewSourceData(sourceId, getImplementedAdaptersForSource(sourceId))
  ))

  router.get("/", async (_req, res) => {
    const runs = await database.sourceSyncRun.findMany({
      where: { source: { in: SOURCE_CATALOG.map((source) => source.id) } },
      orderBy: { startedAt: "desc" },
      take: 200
    })
    const latestRuns = aggregateLatestSourceRuns(runs)

    const items = await Promise.all(SOURCE_CATALOG.map(async (source) => {
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
        localState: await sourceLocalState(source.id, settings),
        manualCommands: source.manualCommands,
        latestRun: latestRun ? {
          status: latestRun.status,
          startedAt: latestRun.startedAt.toISOString(),
          finishedAt: latestRun.finishedAt?.toISOString() ?? null,
          itemCount: latestRun.itemCount,
          durationMs: latestRun.durationMs,
          errorMessage: redactStoredError(latestRun.errorMessage, settings)
        } : null
      }
    }))

    res.json({
      items
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

  router.post("/:source/preview", async (req, res) => {
    const implementedAdapters = getImplementedAdaptersForSource(req.params.source)

    if (implementedAdapters.length === 0) {
      res.status(404).json({ error: "source_not_implemented" })
      return
    }

    const source = getSourceDefinition(req.params.source)
    if (source.implementationStatus !== "active" || !source.supportsSync) {
      res.status(409).json({ error: "source_preview_unavailable" })
      return
    }

    const missingCredentials = settings.missingCredentials(req.params.source)
    if (missingCredentials.length > 0) {
      res.status(409).json({ error: "credential_missing", missingCredentials })
      return
    }

    if (sourcePreviewsInFlight.has(source.id)) {
      res.status(409).json({ error: "preview_in_progress" })
      return
    }

    sourcePreviewsInFlight.add(source.id)
    try {
      res.json(await previewSource(source.id))
    } catch {
      res.status(502).json({ error: "source_preview_failed" })
    } finally {
      sourcePreviewsInFlight.delete(source.id)
    }
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

type SyncRouterDependencies = {
  database?: PrismaClient
  settings?: RuntimeSettingsService
  enabledAdapters?: Array<Pick<ReturnType<typeof getEnabledAdapters>[number], "sourceId" | "scheduleGroup" | "adapter">>
}

// POST /api/sync 手动触发全量同步：跑所有已启用且有凭据的 adapter，串行执行
export function createSyncRouter(dependencies: SyncRouterDependencies = {}): Router {
  const router = Router()
  const database = dependencies.database ?? db
  const settings = dependencies.settings ?? runtimeSettings

  router.post("/", async (_req, res) => {
    const entries = dependencies.enabledAdapters ?? getEnabledAdapters()
    const runs = []
    for (const entry of entries) {
      if (settings.missingCredentials(entry.sourceId).length > 0) continue
      runs.push(await runSourceSync(database, entry.adapter))
    }

    res.json({ items: runs })
  })

  return router
}

export const syncRouter = createSyncRouter()
