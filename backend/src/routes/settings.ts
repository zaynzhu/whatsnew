import type { PrismaClient } from "@prisma/client"
import { Router } from "express"
import { z } from "zod"
import { db } from "../config/db.js"
import {
  ConnectionTestService,
  connectionTestService
} from "../services/connectionTestService.js"
import { SOURCE_CATALOG } from "../settings/sourceCatalog.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import {
  GLOBAL_PROXY_FIELDS,
  sourceEnvKey
} from "../settings/settingsFields.js"
import { redactStoredError } from "../settings/settingsRedaction.js"

const updateSchema = z.object({
  values: z.record(z.string()),
  clearKeys: z.array(z.string()).default([])
})

const singleLineString = z.string().refine((value) => !value.includes("\n") && !value.includes("\r"))

const proxyTestSchema = z.object({
  HTTP_PROXY: singleLineString.optional(),
  HTTPS_PROXY: singleLineString.optional()
})

const FIELD_LABELS: Record<string, string> = {
  TMDB_API_KEY: "TMDb API Key",
  TRAKT_CLIENT_ID: "Trakt Client ID",
  TRAKT_CLIENT_SECRET: "Trakt Client Secret",
  TRAKT_ACCESS_TOKEN: "Trakt Access Token",
  OMDB_API_KEY: "OMDb API Key",
  THETVDB_API_KEY: "TheTVDB API Key",
  THETVDB_PIN: "TheTVDB PIN（可选）",
  DOUBAN_COOKIE: "豆瓣 Cookie"
}

type SettingsRouterDependencies = {
  settings?: RuntimeSettingsService
  connectionTester?: ConnectionTestService
  database?: Pick<PrismaClient, "sourceSyncRun">
}

function validationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ""
  return ["未知配置项", "配置值不能包含换行", "代理模式无效", "启用状态无效"]
    .some((text) => message.includes(text))
}

function fieldLabel(key: string, fallback: string): string {
  return FIELD_LABELS[key] ?? fallback
}

export function createSettingsRouter(dependencies: SettingsRouterDependencies = {}): Router {
  const router = Router()
  const settings = dependencies.settings ?? runtimeSettings
  const connectionTester = dependencies.connectionTester ?? connectionTestService
  const database = dependencies.database ?? db

  router.get("/", async (_req, res) => {
    const runs = await database.sourceSyncRun.findMany({
      where: { source: { in: SOURCE_CATALOG.map((source) => source.id) } },
      orderBy: { startedAt: "desc" },
      distinct: ["source"]
    })
    const latestRuns = new Map<string, (typeof runs)[number]>()
    for (const run of runs) {
      if (!latestRuns.has(run.source)) latestRuns.set(run.source, run)
    }

    res.json({
      proxyFields: GLOBAL_PROXY_FIELDS.map((field) => settings.fieldView(field.key, field.label)),
      sources: SOURCE_CATALOG.map((source) => {
        const latestRun = latestRuns.get(source.id)
        const missingCredentials = settings.missingCredentials(source.id)
        const fields = [
          settings.fieldView(source.baseUrlKey, `${source.name} Base URL`),
          ...source.credentialKeys.map((key) => settings.fieldView(key, fieldLabel(key, key))),
          ...source.optionalCredentialKeys.map((key) => settings.fieldView(key, fieldLabel(key, key))),
          settings.fieldView(sourceEnvKey(source.id, "HTTP_PROXY"), `${source.name} HTTP 代理`),
          settings.fieldView(sourceEnvKey(source.id, "HTTPS_PROXY"), `${source.name} HTTPS 代理`)
        ]

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
          fields,
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

  router.put("/", async (req, res) => {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_settings" })
      return
    }

    try {
      await settings.update(parsed.data.values, parsed.data.clearKeys)
      res.json({ success: true, effectiveImmediately: true })
    } catch (error) {
      if (validationError(error)) {
        res.status(400).json({ error: "invalid_settings" })
        return
      }
      res.status(500).json({ error: "settings_update_failed" })
    }
  })

  router.post("/proxy/test", async (req, res) => {
    const parsed = proxyTestSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_proxy_settings" })
      return
    }

    const overrides = Object.fromEntries(
      Object.entries(parsed.data).filter((entry): entry is [string, string] => entry[1] !== undefined)
    )
    const items = await Promise.all([
      connectionTester.testProxy("direct", "https://example.com/", overrides),
      connectionTester.testProxy("http_proxy", "http://example.com/", overrides),
      connectionTester.testProxy("https_proxy", "https://example.com/", overrides)
    ])
    res.json({ items })
  })

  return router
}

export const settingsRouter = createSettingsRouter()
