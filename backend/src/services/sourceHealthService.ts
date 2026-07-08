import type { PrismaClient } from "@prisma/client"
import type {
  SourceHealthAcceptanceStatus,
  SourceHealthFreshnessStatus,
  SourceHealthLatestRun,
  SourceHealthReasonCode,
  SourceHealthResponse,
  SourceHealthRow,
  SourceHealthRunStatus,
  SourceHealthSample,
  SourceHealthScheduleGroup
} from "@whatsnew/shared/settings"
import {
  healthScopeKey,
  registeredHealthScopes,
  type RegisteredHealthScope
} from "../adapters/adapterRegistry.js"
import { db } from "../config/db.js"
import { createSourceHealthSampleReader } from "./sourceHealthSamples.js"
import { getImdbCacheStatus } from "./imdbCacheStatusService.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { SOURCE_CATALOG, getSourceDefinition, type SourceDefinition } from "../settings/sourceCatalog.js"
import { redactStoredError } from "../settings/settingsRedaction.js"

type SourceRunRecord = {
  source: string
  scope: string | null
  status: string
  startedAt: Date
  finishedAt: Date | null
  itemCount: number
  durationMs: number | null
  errorMessage: string | null
}

type SourceHealthDatabase = Pick<PrismaClient, "sourceSyncRun" | "release" | "popularitySignal">

type SourceHealthServiceDependencies = {
  database?: SourceHealthDatabase
  settings?: RuntimeSettingsService
  samples?: (scope: RegisteredHealthScope, limit: number) => Promise<SourceHealthSample[]>
}

type LatestRuns = {
  latest: SourceRunRecord | null
  latestSuccess: SourceRunRecord | null
}

const SAMPLE_LIMIT = 3

function runScope(run: SourceRunRecord): string {
  return run.scope ?? "all"
}

function runKey(run: SourceRunRecord): string {
  return `${run.source}:${runScope(run)}`
}

function scopeRunKeys(scope: RegisteredHealthScope): string[] {
  return [
    `${scope.sourceId}:${scope.scope}`,
    scope.adapter ? `${scope.adapter.source}:${scope.scope}` : ""
  ].filter((key, index, keys) => key && keys.indexOf(key) === index)
}

function sourceRunIdentifiers(): string[] {
  const identifiers = new Set<string>(SOURCE_CATALOG.map((source) => source.id))
  for (const scope of registeredHealthScopes) {
    if (scope.adapter) identifiers.add(scope.adapter.source)
  }

  return [...identifiers]
}

function toRunStatus(status: string | null | undefined): SourceHealthRunStatus {
  if (status === "running" || status === "success" || status === "warning" || status === "failed") return status
  return "none"
}

function toLatestRun(run: SourceRunRecord | null, settings: RuntimeSettingsService): SourceHealthLatestRun | null {
  if (!run) return null

  return {
    status: toRunStatus(run.status),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    itemCount: run.itemCount,
    durationMs: run.durationMs,
    errorMessage: redactStoredError(run.errorMessage, settings)
  }
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (60 * 60 * 1000)
}

function latestRunsByScope(runs: SourceRunRecord[]): Map<string, LatestRuns> {
  const result = new Map<string, LatestRuns>()
  for (const run of runs) {
    const key = runKey(run)
    const current = result.get(key) ?? { latest: null, latestSuccess: null }
    if (!current.latest) current.latest = run
    if (!current.latestSuccess && run.status === "success") current.latestSuccess = run
    result.set(key, current)
  }

  return result
}

function findRunsForScope(scope: RegisteredHealthScope, runsByKey: Map<string, LatestRuns>): LatestRuns {
  for (const key of scopeRunKeys(scope)) {
    const runs = runsByKey.get(key)
    if (runs) return runs
  }

  return { latest: null, latestSuccess: null }
}

function blockedReason(source: SourceDefinition, enabled: boolean, missingCredentials: string[]): SourceHealthReasonCode | null {
  if (source.implementationStatus === "commercial") return "commercial"
  if (source.semantics.access === "restricted_page") return "restricted"
  if (!source.supportsSync || source.implementationStatus !== "active") return "not_implemented"
  if (!enabled) return "disabled"
  if (missingCredentials.length > 0) return "missing_credentials"
  return null
}

function reasonText(code: SourceHealthReasonCode): string {
  const labels: Record<SourceHealthReasonCode, string> = {
    passed: "最近同步成功，数据新鲜且有可验收样本",
    disabled: "来源已配置但当前未启用",
    missing_credentials: "来源缺少必需凭据",
    not_implemented: "来源尚未实现可运行 adapter scope",
    commercial: "来源需要商业授权，当前不参与真实数据验收",
    restricted: "来源受登录、验证码、专业版或反爬限制，当前不参与真实数据验收",
    never_succeeded: "该 scope 尚无成功同步记录",
    stale_success: "最近成功已超过新鲜度阈值",
    latest_failed_no_fresh_success: "最近同步失败，且没有新鲜成功数据可用",
    latest_failed_with_fresh_success: "最近同步失败，但仍有新鲜成功数据可用",
    latest_running_no_fresh_success: "同步运行中，且没有新鲜成功数据可用",
    latest_running_with_fresh_success: "同步运行中，仍有新鲜成功数据可用",
    latest_warning: "最近同步完成但带有警告",
    empty_result: "该 scope 最近成功同步 0 条数据，未声明允许空结果",
    manual_cache_missing: "本地缓存缺失或未就绪",
    manual_cache_ready: "本地缓存就绪，等待或已完成手动同步"
  }
  return labels[code]
}

function freshSuccessStatus(
  scope: RegisteredHealthScope,
  runs: LatestRuns,
  freshnessStatus: SourceHealthFreshnessStatus
): {
  runStatus: SourceHealthRunStatus
  acceptanceStatus: SourceHealthAcceptanceStatus
  freshnessStatus: SourceHealthFreshnessStatus
  reasonCode: SourceHealthReasonCode
} {
  const latest = runs.latest
  const latestSuccess = runs.latestSuccess
  const runStatus = toRunStatus(latest?.status)

  if (!latestSuccess) {
    return {
      runStatus,
      acceptanceStatus: runStatus === "running" ? "failed" : "failed",
      freshnessStatus: "never_succeeded",
      reasonCode: runStatus === "running" ? "latest_running_no_fresh_success" : "never_succeeded"
    }
  }

  if (latestSuccess.itemCount === 0 && !scope.healthPolicy.emptyOk) {
    return {
      runStatus,
      acceptanceStatus: "failed",
      freshnessStatus,
      reasonCode: "empty_result"
    }
  }

  if (runStatus === "failed") {
    return {
      runStatus,
      acceptanceStatus: "degraded",
      freshnessStatus,
      reasonCode: "latest_failed_with_fresh_success"
    }
  }

  if (runStatus === "running") {
    return {
      runStatus,
      acceptanceStatus: "degraded",
      freshnessStatus,
      reasonCode: "latest_running_with_fresh_success"
    }
  }

  if (runStatus === "warning") {
    return {
      runStatus,
      acceptanceStatus: "degraded",
      freshnessStatus,
      reasonCode: "latest_warning"
    }
  }

  return {
    runStatus,
    acceptanceStatus: "passed",
    freshnessStatus,
    reasonCode: "passed"
  }
}

async function manualRowStatus(
  scope: RegisteredHealthScope,
  runs: LatestRuns,
  settings: RuntimeSettingsService
): Promise<{
  runStatus: SourceHealthRunStatus
  acceptanceStatus: SourceHealthAcceptanceStatus
  freshnessStatus: SourceHealthFreshnessStatus
  reasonCode: SourceHealthReasonCode
}> {
  const cacheStatus = scope.sourceId === "imdb"
    ? await getImdbCacheStatus(settings.get("IMDB_DATASET_CACHE_DIR"))
    : null
  if (cacheStatus?.status !== "ready") {
    return {
      runStatus: toRunStatus(runs.latest?.status),
      acceptanceStatus: "blocked",
      freshnessStatus: "manual",
      reasonCode: "manual_cache_missing"
    }
  }

  if (!runs.latestSuccess) {
    return {
      runStatus: toRunStatus(runs.latest?.status),
      acceptanceStatus: "blocked",
      freshnessStatus: "manual",
      reasonCode: "manual_cache_ready"
    }
  }

  return freshSuccessStatus(scope, runs, "manual")
}

function rowStatus(
  scope: RegisteredHealthScope,
  runs: LatestRuns,
  now: Date
): {
  runStatus: SourceHealthRunStatus
  acceptanceStatus: SourceHealthAcceptanceStatus
  freshnessStatus: SourceHealthFreshnessStatus
  reasonCode: SourceHealthReasonCode
} {
  const latestSuccess = runs.latestSuccess
  const baseStatus = freshSuccessStatus(scope, runs, "fresh")

  if (!latestSuccess || baseStatus.acceptanceStatus === "failed") return baseStatus

  const staleAfterHours = scope.healthPolicy.staleAfterHours
  const successAt = latestSuccess.finishedAt ?? latestSuccess.startedAt
  const isStale = staleAfterHours != null && hoursBetween(successAt, now) > staleAfterHours
  if (isStale) {
    return {
      runStatus: baseStatus.runStatus,
      acceptanceStatus: "failed",
      freshnessStatus: "stale",
      reasonCode: "stale_success"
    }
  }

  return baseStatus
}

function blockedRow(
  source: SourceDefinition,
  reasonCode: SourceHealthReasonCode,
  settings: RuntimeSettingsService,
  scope = "coverage",
  scheduleGroup: SourceHealthScheduleGroup = "none"
): SourceHealthRow {
  const missingCredentials = settings.missingCredentials(source.id)
  return {
    sourceId: source.id,
    sourceName: source.name,
    scope,
    scheduleGroup,
    group: source.group,
    implementationStatus: source.implementationStatus,
    enabled: settings.sourceEnabled(source.id),
    runnable: settings.sourceRunnable(source.id),
    credentialsComplete: missingCredentials.length === 0,
    missingCredentials,
    signalKinds: [...source.semantics.signalKinds],
    runStatus: "none",
    acceptanceStatus: "blocked",
    freshnessStatus: "blocked",
    reasonCode,
    reason: reasonText(reasonCode),
    latestRun: null,
    lastSuccessAt: null,
    staleAfterHours: null,
    itemCount: 0,
    samples: []
  }
}

async function scopeRow(
  scope: RegisteredHealthScope,
  runsByKey: Map<string, LatestRuns>,
  settings: RuntimeSettingsService,
  samples: (scope: RegisteredHealthScope, limit: number) => Promise<SourceHealthSample[]>,
  now: Date
): Promise<SourceHealthRow> {
  const source = getSourceDefinition(scope.sourceId)
  const missingCredentials = settings.missingCredentials(source.id)
  const enabled = settings.sourceEnabled(source.id)
  const runs = findRunsForScope(scope, runsByKey)
  const status = scope.scheduleGroup === "manual"
    ? await manualRowStatus(scope, runs, settings)
    : null
  const blocked = status ? null : blockedReason(source, enabled, missingCredentials)
  if (blocked) return blockedRow(source, blocked, settings, scope.scope, scope.scheduleGroup)

  const finalStatus = status ?? rowStatus(scope, runs, now)
  const acceptedSamples = finalStatus.acceptanceStatus === "blocked"
    ? []
    : await samples(scope, SAMPLE_LIMIT)

  return {
    sourceId: source.id,
    sourceName: source.name,
    scope: scope.scope,
    scheduleGroup: scope.scheduleGroup,
    group: source.group,
    implementationStatus: source.implementationStatus,
    enabled,
    runnable: settings.sourceRunnable(source.id),
    credentialsComplete: missingCredentials.length === 0,
    missingCredentials,
    signalKinds: scope.healthPolicy.expectedSignalKinds,
    runStatus: finalStatus.runStatus,
    acceptanceStatus: finalStatus.acceptanceStatus,
    freshnessStatus: finalStatus.freshnessStatus,
    reasonCode: finalStatus.reasonCode,
    reason: reasonText(finalStatus.reasonCode),
    latestRun: toLatestRun(runs.latest, settings),
    lastSuccessAt: runs.latestSuccess
      ? (runs.latestSuccess.finishedAt ?? runs.latestSuccess.startedAt).toISOString()
      : null,
    staleAfterHours: scope.healthPolicy.staleAfterHours,
    itemCount: runs.latest?.itemCount ?? 0,
    samples: acceptedSamples
  }
}

function summary(items: SourceHealthRow[]): SourceHealthResponse["summary"] {
  return {
    total: items.length,
    passed: items.filter((item) => item.acceptanceStatus === "passed").length,
    degraded: items.filter((item) => item.acceptanceStatus === "degraded").length,
    failed: items.filter((item) => item.acceptanceStatus === "failed").length,
    blocked: items.filter((item) => item.acceptanceStatus === "blocked").length,
    runnable: items.filter((item) => item.runnable).length,
    stale: items.filter((item) => item.freshnessStatus === "stale").length
  }
}

export function createSourceHealthService(dependencies: SourceHealthServiceDependencies = {}) {
  const database = dependencies.database ?? db
  const settings = dependencies.settings ?? runtimeSettings
  const sampleReader = createSourceHealthSampleReader(database)
  const samples = dependencies.samples ?? ((scope: RegisteredHealthScope, limit: number) => {
    return sampleReader.samplesForScope(scope, limit)
  })

  return {
    async getSourceHealth(now = new Date()): Promise<SourceHealthResponse> {
      const runs = await database.sourceSyncRun.findMany({
        where: { source: { in: sourceRunIdentifiers() } },
        orderBy: { startedAt: "desc" },
        take: 500
      })
      const runsByKey = latestRunsByScope(runs)
      const healthSourceIds = new Set(registeredHealthScopes.map((scope) => scope.sourceId))
      const rows = await Promise.all(registeredHealthScopes.map((scope) => {
        return scopeRow(scope, runsByKey, settings, samples, now)
      }))

      for (const source of SOURCE_CATALOG) {
        if (healthSourceIds.has(source.id)) continue
        const reason = source.implementationStatus === "commercial"
          ? "commercial"
          : source.semantics.access === "restricted_page"
            ? "restricted"
            : "not_implemented"
        rows.push(blockedRow(source, reason, settings))
      }

      return {
        generatedAt: now.toISOString(),
        summary: summary(rows),
        items: rows
      }
    }
  }
}

export const sourceHealthService = createSourceHealthService()
