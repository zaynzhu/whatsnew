import type { Prisma, PrismaClient } from "@prisma/client"
import type { SourceRunLogsResponse } from "@whatsnew/shared/settings"
import { Router } from "express"
import { db } from "../config/db.js"
import { runtimeSettings, type RuntimeSettingsService } from "../settings/runtimeSettingsService.js"
import { SOURCE_CATALOG } from "../settings/sourceCatalog.js"
import { redactStoredError } from "../settings/settingsRedaction.js"

const RUN_STATUSES = new Set(["running", "success", "warning", "failed"])
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

type SourceRunsRouterDependencies = {
  database?: Pick<PrismaClient, "sourceSyncRun">
  settings?: RuntimeSettingsService
}

function requestedLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

export function createSourceRunsRouter(dependencies: SourceRunsRouterDependencies = {}): Router {
  const router = Router()
  const database = dependencies.database ?? db
  const settings = dependencies.settings ?? runtimeSettings

  router.get("/", async (req, res) => {
    const source = typeof req.query.source === "string" ? req.query.source : ""
    const status = typeof req.query.status === "string" ? req.query.status : ""
    const where: Prisma.SourceSyncRunWhereInput = {
      ...(SOURCE_CATALOG.some((item) => item.id === source) ? { source } : {}),
      ...(RUN_STATUSES.has(status) ? { status } : {})
    }
    const runs = await database.sourceSyncRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: requestedLimit(req.query.limit)
    })
    const sources = new Map<string, (typeof SOURCE_CATALOG)[number]>(
      SOURCE_CATALOG.map((item) => [item.id, item])
    )
    const response: SourceRunLogsResponse = {
      generatedAt: new Date().toISOString(),
      sources: SOURCE_CATALOG.map((item) => ({ id: item.id, name: item.name })),
      items: runs.map((run) => {
        const definition = sources.get(run.source)
        return {
          id: run.id,
          sourceId: run.source,
          sourceName: definition?.name ?? run.source,
          scope: run.scope,
          status: run.status,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          durationMs: run.durationMs,
          itemCount: run.itemCount,
          errorMessage: redactStoredError(run.errorMessage, settings),
          retryable: Boolean(
            definition?.supportsSync
            && settings.sourceEnabled(run.source)
            && settings.missingCredentials(run.source).length === 0
          )
        }
      })
    }

    res.json(response)
  })

  return router
}

export const sourceRunsRouter = createSourceRunsRouter()
