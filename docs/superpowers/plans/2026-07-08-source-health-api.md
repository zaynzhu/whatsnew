# Source Health API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only `GET /api/source-health` API that returns a source health matrix by adapter scope for real data acceptance.

**Architecture:** Health is judged per adapter scope, not per whole source. Health policy lives with adapter scope registration, the health service reads persisted sync runs and sample records from MySQL, and the route returns `summary + items` without calling adapters or external networks.

**Tech Stack:** TypeScript, Express 5, Prisma, MySQL, Vitest, Supertest, npm workspaces.

## Global Constraints

- Do not call any adapter or external URL from `GET /api/source-health`; it is read-only.
- Source health rows are keyed by `sourceId + scope`.
- Health policy belongs with adapter/scope registration, not only `sourceCatalog`.
- `Run Status` and `Acceptance Status` are separate fields.
- First-version stale thresholds: hourly scope > 6 hours, daily scope > 36 hours, manual scope uses local state and last sync instead of the hourly/daily thresholds.
- Enabled and runnable scopes returning `itemCount = 0` fail by default unless their health policy explicitly declares `emptyOk: true`.
- Each adapter scope returns at most 3 acceptance samples read from persisted database records.
- Planned, commercial, restricted and unimplemented sources appear as blocked coverage rows.
- Reason codes are shared frontend/backend types; UI must not parse display text.
- Existing user changes must not be reverted. In this worktree, `docs/operator-runbook.md` may already be dirty; stage only files touched by the implementation task unless explicitly asked to include that file.

---

## File Structure

Create or modify these files:

- Modify: `shared/src/settings.ts`
  - Adds shared health enums and response types.
- Modify: `backend/src/adapters/adapterRegistry.ts`
  - Adds per-scope `healthPolicy` and registered manual health scopes.
- Create: `backend/src/services/sourceHealthSamples.ts`
  - Reads up to 3 persisted acceptance samples for one health scope.
- Create: `backend/src/services/sourceHealthService.ts`
  - Computes health rows and summary from source catalog, registered scopes, latest runs, successful runs, local state and samples.
- Create: `backend/src/routes/sourceHealth.ts`
  - Express route for `GET /api/source-health`.
- Modify: `backend/src/app.ts`
  - Mounts `/api/source-health`.
- Create: `backend/tests/sourceHealth.test.ts`
  - Unit-style service and registry tests for status, stale, blocked and sample behavior.
- Modify: `backend/tests/api.test.ts`
  - Adds route-level coverage for `GET /api/source-health`.
- Modify: `docs/architecture.md`
  - Adds the route and notes read-only behavior.
- Modify: `docs/integration-guide.md`
  - Adds curl example and response shape.

Do not modify frontend code in this plan. Frontend display is a separate task after the API contract is stable.

---

### Task 1: Add Shared Source Health Types

**Files:**
- Modify: `shared/src/settings.ts`
- Test: `backend/tests/sourceHealth.test.ts`

**Interfaces:**
- Produces: `SourceHealthRunStatus`, `SourceHealthAcceptanceStatus`, `SourceHealthFreshnessStatus`, `SourceHealthReasonCode`, `SourceHealthSample`, `SourceHealthRow`, `SourceHealthSummary`, `SourceHealthResponse`
- Consumes: existing `SourceGroup`, `SourceImplementationStatus`, `SourceSignalKind`

- [ ] **Step 1: Write the failing shared type test**

Append this test block to a new `backend/tests/sourceHealth.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  SOURCE_HEALTH_ACCEPTANCE_STATUSES,
  SOURCE_HEALTH_REASON_CODES,
  SOURCE_HEALTH_RUN_STATUSES
} from "@whatsnew/shared/settings"

describe("source health shared contract", () => {
  it("exposes stable run, acceptance and reason code enums", () => {
    expect(SOURCE_HEALTH_RUN_STATUSES).toEqual(["none", "running", "success", "warning", "failed"])
    expect(SOURCE_HEALTH_ACCEPTANCE_STATUSES).toEqual(["passed", "degraded", "failed", "blocked"])
    expect(SOURCE_HEALTH_REASON_CODES).toEqual([
      "passed",
      "disabled",
      "missing_credentials",
      "not_implemented",
      "commercial",
      "restricted",
      "never_succeeded",
      "stale_success",
      "latest_failed_no_fresh_success",
      "latest_failed_with_fresh_success",
      "latest_running_no_fresh_success",
      "latest_running_with_fresh_success",
      "latest_warning",
      "empty_result",
      "manual_cache_missing",
      "manual_cache_ready"
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test --workspace backend -- sourceHealth
```

Expected: FAIL because `SOURCE_HEALTH_ACCEPTANCE_STATUSES`, `SOURCE_HEALTH_REASON_CODES` and `SOURCE_HEALTH_RUN_STATUSES` are not exported yet.

- [ ] **Step 3: Add shared constants and types**

Append this code to `shared/src/settings.ts` after `ConnectionTestResult`:

```ts
export const SOURCE_HEALTH_RUN_STATUSES = ["none", "running", "success", "warning", "failed"] as const
export type SourceHealthRunStatus = (typeof SOURCE_HEALTH_RUN_STATUSES)[number]

export const SOURCE_HEALTH_ACCEPTANCE_STATUSES = ["passed", "degraded", "failed", "blocked"] as const
export type SourceHealthAcceptanceStatus = (typeof SOURCE_HEALTH_ACCEPTANCE_STATUSES)[number]

export const SOURCE_HEALTH_FRESHNESS_STATUSES = ["fresh", "stale", "never_succeeded", "manual", "blocked"] as const
export type SourceHealthFreshnessStatus = (typeof SOURCE_HEALTH_FRESHNESS_STATUSES)[number]

export const SOURCE_HEALTH_REASON_CODES = [
  "passed",
  "disabled",
  "missing_credentials",
  "not_implemented",
  "commercial",
  "restricted",
  "never_succeeded",
  "stale_success",
  "latest_failed_no_fresh_success",
  "latest_failed_with_fresh_success",
  "latest_running_no_fresh_success",
  "latest_running_with_fresh_success",
  "latest_warning",
  "empty_result",
  "manual_cache_missing",
  "manual_cache_ready"
] as const
export type SourceHealthReasonCode = (typeof SOURCE_HEALTH_REASON_CODES)[number]

export type SourceHealthScheduleGroup = "hourly" | "daily" | "manual" | "none"

export type SourceHealthLatestRun = {
  status: SourceHealthRunStatus
  startedAt: string
  finishedAt: string | null
  itemCount: number
  durationMs: number | null
  errorMessage: string | null
}

export type SourceHealthSample = {
  title: string
  mediaType: string
  signalKind: SourceSignalKind
  source: string
  platform: string | null
  region: string | null
  sourceUrl: string | null
  capturedAtOrFetchedAt: string
}

export type SourceHealthRow = {
  sourceId: string
  sourceName: string
  scope: string
  scheduleGroup: SourceHealthScheduleGroup
  group: SourceGroup
  implementationStatus: SourceImplementationStatus
  enabled: boolean
  runnable: boolean
  credentialsComplete: boolean
  missingCredentials: string[]
  signalKinds: SourceSignalKind[]
  runStatus: SourceHealthRunStatus
  acceptanceStatus: SourceHealthAcceptanceStatus
  freshnessStatus: SourceHealthFreshnessStatus
  reasonCode: SourceHealthReasonCode
  reason: string
  latestRun: SourceHealthLatestRun | null
  lastSuccessAt: string | null
  staleAfterHours: number | null
  itemCount: number
  samples: SourceHealthSample[]
}

export type SourceHealthSummary = {
  total: number
  passed: number
  degraded: number
  failed: number
  blocked: number
  runnable: number
  stale: number
}

export type SourceHealthResponse = {
  generatedAt: string
  summary: SourceHealthSummary
  items: SourceHealthRow[]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm test --workspace backend -- sourceHealth
```

Expected: PASS for `source health shared contract`.

- [ ] **Step 5: Commit**

```bash
git add shared/src/settings.ts backend/tests/sourceHealth.test.ts
git commit -m "feat: 添加来源健康共享类型"
```

---

### Task 2: Register Health Policy Per Adapter Scope

**Files:**
- Modify: `backend/src/adapters/adapterRegistry.ts`
- Test: `backend/tests/sourceHealth.test.ts`

**Interfaces:**
- Consumes: `SourceHealthScheduleGroup`, `SourceSignalKind` from `@whatsnew/shared/settings`
- Produces: `SourceHealthPolicy`, `RegisteredHealthScope`, `registeredHealthScopes`, `healthScopeKey(entry)`

- [ ] **Step 1: Add failing registry tests**

Extend the import block at the top of `backend/tests/sourceHealth.test.ts` with these imports:

```ts
import {
  healthScopeKey,
  registeredAdapters,
  registeredHealthScopes
} from "../src/adapters/adapterRegistry.js"
```

Append this test block to `backend/tests/sourceHealth.test.ts`:

```ts

describe("source health registry", () => {
  it("registers health policy per adapter scope", () => {
    const traktScopes = registeredHealthScopes
      .filter((entry) => entry.sourceId === "trakt")
      .map((entry) => ({
        key: healthScopeKey(entry),
        scheduleGroup: entry.scheduleGroup,
        staleAfterHours: entry.healthPolicy.staleAfterHours,
        signalKinds: entry.healthPolicy.expectedSignalKinds
      }))

    expect(traktScopes).toEqual([
      {
        key: "trakt:popularity",
        scheduleGroup: "hourly",
        staleAfterHours: 6,
        signalKinds: ["community_trend"]
      },
      {
        key: "trakt:calendar",
        scheduleGroup: "daily",
        staleAfterHours: 36,
        signalKinds: ["release_calendar"]
      }
    ])
  })

  it("keeps health scope keys unique and includes manual IMDb health", () => {
    const keys = registeredHealthScopes.map((entry) => healthScopeKey(entry))
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain("imdb:datasets_cache")
    expect(registeredHealthScopes.find((entry) => healthScopeKey(entry) === "imdb:datasets_cache")).toMatchObject({
      scheduleGroup: "manual",
      healthPolicy: {
        staleAfterHours: null,
        expectedSignalKinds: ["metadata", "rating"],
        sampleStrategy: "local_state"
      }
    })
  })

  it("keeps every runnable adapter represented in the health scopes", () => {
    const healthKeys = new Set(registeredHealthScopes.map((entry) => healthScopeKey(entry)))
    for (const adapter of registeredAdapters) {
      expect(healthKeys.has(healthScopeKey(adapter))).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test --workspace backend -- sourceHealth
```

Expected: FAIL because `registeredHealthScopes`, `healthScopeKey` and `healthPolicy` do not exist.

- [ ] **Step 3: Add health policy types and helper**

Modify `backend/src/adapters/adapterRegistry.ts` imports:

```ts
import type {
  SourceHealthScheduleGroup,
  SourceSignalKind
} from "@whatsnew/shared/settings"
```

Add these types above `RegisteredAdapter`:

```ts
export type SourceHealthSampleStrategy = "release" | "popularity" | "local_state" | "coverage_only"

export type SourceHealthPolicy = {
  expectedSignalKinds: SourceSignalKind[]
  staleAfterHours: number | null
  emptyOk: boolean
  sampleStrategy: SourceHealthSampleStrategy
}
```

Change `RegisteredAdapter` to:

```ts
export type RegisteredAdapter = {
  sourceId: string
  scheduleGroup: ScheduleGroup
  adapter: SourceAdapter<SourceFetchResult>
  healthPolicy: SourceHealthPolicy
}
```

Add this type after `RegisteredAdapter`:

```ts
export type RegisteredHealthScope = {
  sourceId: string
  scope: string
  scheduleGroup: SourceHealthScheduleGroup
  adapter?: SourceAdapter<SourceFetchResult>
  healthPolicy: SourceHealthPolicy
}
```

Add these helpers above `registeredAdapters`:

```ts
const HOURLY_STALE_HOURS = 6
const DAILY_STALE_HOURS = 36

function healthPolicy(
  expectedSignalKinds: SourceSignalKind[],
  scheduleGroup: ScheduleGroup | "manual",
  sampleStrategy: SourceHealthSampleStrategy,
  emptyOk = false
): SourceHealthPolicy {
  return {
    expectedSignalKinds,
    staleAfterHours: scheduleGroup === "manual"
      ? null
      : scheduleGroup === "hourly"
        ? HOURLY_STALE_HOURS
        : DAILY_STALE_HOURS,
    emptyOk,
    sampleStrategy
  }
}
```

- [ ] **Step 4: Add health policies to registered adapters**

Replace `registeredAdapters` with:

```ts
export const registeredAdapters: RegisteredAdapter[] = [
  { sourceId: "tvmaze", scheduleGroup: "hourly", adapter: tvmazeAdapter, healthPolicy: healthPolicy(["release_calendar", "metadata"], "hourly", "release") },
  { sourceId: "tmdb", scheduleGroup: "hourly", adapter: tmdbAdapter, healthPolicy: healthPolicy(["metadata", "community_trend", "release_calendar"], "hourly", "popularity") },
  { sourceId: "trakt", scheduleGroup: "hourly", adapter: traktPopularityAdapter, healthPolicy: healthPolicy(["community_trend"], "hourly", "popularity") },
  { sourceId: "trakt", scheduleGroup: "daily", adapter: traktCalendarAdapter, healthPolicy: healthPolicy(["release_calendar"], "daily", "release") },
  { sourceId: "thetvdb", scheduleGroup: "daily", adapter: theTvdbAdapter, healthPolicy: healthPolicy(["metadata", "release_calendar"], "daily", "release") },
  { sourceId: "netflix", scheduleGroup: "daily", adapter: netflixTop10Adapter, healthPolicy: healthPolicy(["platform_rank"], "daily", "popularity") },
  { sourceId: "hulu", scheduleGroup: "daily", adapter: huluAdapter, healthPolicy: healthPolicy(["platform_catalog", "release_calendar"], "daily", "release") },
  { sourceId: "disney_plus", scheduleGroup: "daily", adapter: disneyPlusAdapter, healthPolicy: healthPolicy(["platform_catalog", "release_calendar"], "daily", "release") },
  { sourceId: "max", scheduleGroup: "daily", adapter: maxAdapter, healthPolicy: healthPolicy(["platform_catalog", "release_calendar"], "daily", "release") },
  { sourceId: "apple_tv_plus", scheduleGroup: "daily", adapter: appleTvPlusAdapter, healthPolicy: healthPolicy(["news_signal"], "daily", "popularity") },
  { sourceId: "youku", scheduleGroup: "hourly", adapter: youkuAdapter, healthPolicy: healthPolicy(["platform_catalog", "platform_rank"], "hourly", "popularity") },
  { sourceId: "iqiyi", scheduleGroup: "hourly", adapter: iqiyiAdapter, healthPolicy: healthPolicy(["platform_catalog", "platform_rank"], "hourly", "release") },
  { sourceId: "mango_tv", scheduleGroup: "hourly", adapter: mgtvAdapter, healthPolicy: healthPolicy(["platform_catalog", "platform_rank", "release_calendar"], "hourly", "popularity") },
  { sourceId: "bilibili", scheduleGroup: "daily", adapter: bilibiliAdapter, healthPolicy: healthPolicy(["platform_rank"], "daily", "popularity") },
  { sourceId: "douban", scheduleGroup: "daily", adapter: doubanAdapter, healthPolicy: healthPolicy(["rating"], "daily", "popularity") }
]
```

- [ ] **Step 5: Add registered health scopes**

Add below `registeredAdapters`:

```ts
export function healthScopeKey(entry: Pick<RegisteredHealthScope, "sourceId" | "scope">): string
export function healthScopeKey(entry: RegisteredAdapter): string
export function healthScopeKey(entry: RegisteredHealthScope | RegisteredAdapter): string {
  const scope = "scope" in entry ? entry.scope : entry.adapter.scope ?? "all"
  return `${entry.sourceId}:${scope}`
}

export const registeredHealthScopes: RegisteredHealthScope[] = [
  ...registeredAdapters.map((entry) => ({
    sourceId: entry.sourceId,
    scope: entry.adapter.scope ?? "all",
    scheduleGroup: entry.scheduleGroup,
    adapter: entry.adapter,
    healthPolicy: entry.healthPolicy
  })),
  {
    sourceId: "imdb",
    scope: "datasets_cache",
    scheduleGroup: "manual",
    healthPolicy: healthPolicy(["metadata", "rating"], "manual", "local_state")
  }
]
```

- [ ] **Step 6: Run registry tests**

Run:

```bash
npm test --workspace backend -- sourceHealth
```

Expected: PASS for shared contract and registry tests.

- [ ] **Step 7: Run scheduler tests to catch shape regressions**

Run:

```bash
npm test --workspace backend -- scheduler sourceCatalog
```

Expected: PASS. Existing code using `registeredAdapters` should keep working because extra `healthPolicy` fields do not change call signatures.

- [ ] **Step 8: Commit**

```bash
git add backend/src/adapters/adapterRegistry.ts backend/tests/sourceHealth.test.ts
git commit -m "feat: 注册来源健康策略"
```

---

### Task 3: Compute Health Rows Without Samples

**Files:**
- Create: `backend/src/services/sourceHealthService.ts`
- Modify: `backend/tests/sourceHealth.test.ts`

**Interfaces:**
- Consumes: `registeredHealthScopes`, `SOURCE_CATALOG`, `RuntimeSettingsService`, Prisma `sourceSyncRun`
- Produces: `createSourceHealthService()`, `getSourceHealth(now?: Date): Promise<SourceHealthResponse>`

- [ ] **Step 1: Add failing service tests**

Extend the import block at the top of `backend/tests/sourceHealth.test.ts` with these imports:

```ts
import { PrismaClient } from "@prisma/client"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import { createSourceHealthService } from "../src/services/sourceHealthService.js"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"
```

Append these helpers after the imports in `backend/tests/sourceHealth.test.ts`:

```ts
const prisma: PrismaClient = testPrisma

function settingsWith(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-source-health-env"), values)
}
```

Append this test block:

```ts
describe("source health service", () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  it("reports passed, degraded, failed and blocked scope rows", async () => {
    const now = new Date("2026-07-08T04:00:00Z")
    await prisma.sourceSyncRun.createMany({
      data: [
        {
          source: "trakt",
          scope: "popularity",
          status: "success",
          startedAt: new Date("2026-07-08T03:00:00Z"),
          finishedAt: new Date("2026-07-08T03:02:00Z"),
          durationMs: 120000,
          itemCount: 12
        },
        {
          source: "trakt",
          scope: "calendar",
          status: "failed",
          startedAt: new Date("2026-07-08T03:30:00Z"),
          finishedAt: new Date("2026-07-08T03:31:00Z"),
          durationMs: 60000,
          itemCount: 0,
          errorMessage: "fetch failed"
        },
        {
          source: "trakt",
          scope: "calendar",
          status: "success",
          startedAt: new Date("2026-07-08T02:00:00Z"),
          finishedAt: new Date("2026-07-08T02:02:00Z"),
          durationMs: 120000,
          itemCount: 9
        },
        {
          source: "hulu",
          scope: "all",
          status: "success",
          startedAt: new Date("2026-07-06T12:00:00Z"),
          finishedAt: new Date("2026-07-06T12:01:00Z"),
          durationMs: 60000,
          itemCount: 4
        }
      ]
    })

    const settings = settingsWith({
      TRAKT_CLIENT_ID: "client-id",
      SOURCE_TRAKT_ENABLED: "true",
      SOURCE_HULU_ENABLED: "true"
    })
    const service = createSourceHealthService({ database: prisma, settings })
    const response = await service.getSourceHealth(now)

    const row = (key: string) => response.items.find((item) => `${item.sourceId}:${item.scope}` === key)

    expect(row("trakt:popularity")).toMatchObject({
      runStatus: "success",
      acceptanceStatus: "passed",
      freshnessStatus: "fresh",
      reasonCode: "passed",
      itemCount: 12
    })
    expect(row("trakt:calendar")).toMatchObject({
      runStatus: "failed",
      acceptanceStatus: "degraded",
      freshnessStatus: "fresh",
      reasonCode: "latest_failed_with_fresh_success",
      itemCount: 0
    })
    expect(row("hulu:all")).toMatchObject({
      runStatus: "success",
      acceptanceStatus: "failed",
      freshnessStatus: "stale",
      reasonCode: "stale_success"
    })
    expect(row("tmdb:all")).toMatchObject({
      acceptanceStatus: "blocked",
      reasonCode: "missing_credentials"
    })
    expect(row("justwatch:coverage")).toMatchObject({
      acceptanceStatus: "blocked",
      reasonCode: "commercial"
    })
    expect(response.summary).toMatchObject({
      total: response.items.length,
      passed: 1,
      degraded: 1
    })
    expect(response.summary.failed).toBeGreaterThan(0)
    expect(response.summary.blocked).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test --workspace backend -- sourceHealth
```

Expected: FAIL because `../src/services/sourceHealthService.js` does not exist.

- [ ] **Step 3: Create the service skeleton and helpers**

Create `backend/src/services/sourceHealthService.ts`:

```ts
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

type SourceHealthDatabase = Pick<PrismaClient, "sourceSyncRun">

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
  const latest = runs.latest
  const latestSuccess = runs.latestSuccess
  const runStatus = toRunStatus(latest?.status)

  if (scope.scheduleGroup === "manual") {
    return {
      runStatus,
      acceptanceStatus: "blocked",
      freshnessStatus: "manual",
      reasonCode: "manual_cache_missing"
    }
  }

  if (!latestSuccess) {
    return {
      runStatus,
      acceptanceStatus: runStatus === "running" ? "failed" : "failed",
      freshnessStatus: "never_succeeded",
      reasonCode: runStatus === "running" ? "latest_running_no_fresh_success" : "never_succeeded"
    }
  }

  const staleAfterHours = scope.healthPolicy.staleAfterHours
  const successAt = latestSuccess.finishedAt ?? latestSuccess.startedAt
  const isStale = staleAfterHours != null && hoursBetween(successAt, now) > staleAfterHours
  if (isStale) {
    return {
      runStatus,
      acceptanceStatus: "failed",
      freshnessStatus: "stale",
      reasonCode: "stale_success"
    }
  }

  if (latestSuccess.itemCount === 0 && !scope.healthPolicy.emptyOk) {
    return {
      runStatus,
      acceptanceStatus: "failed",
      freshnessStatus: "fresh",
      reasonCode: "empty_result"
    }
  }

  if (runStatus === "failed") {
    return {
      runStatus,
      acceptanceStatus: "degraded",
      freshnessStatus: "fresh",
      reasonCode: "latest_failed_with_fresh_success"
    }
  }

  if (runStatus === "running") {
    return {
      runStatus,
      acceptanceStatus: "degraded",
      freshnessStatus: "fresh",
      reasonCode: "latest_running_with_fresh_success"
    }
  }

  if (runStatus === "warning") {
    return {
      runStatus,
      acceptanceStatus: "degraded",
      freshnessStatus: "fresh",
      reasonCode: "latest_warning"
    }
  }

  return {
    runStatus,
    acceptanceStatus: "passed",
    freshnessStatus: "fresh",
    reasonCode: "passed"
  }
}
```

- [ ] **Step 4: Add row builders and service factory**

Append this code to `backend/src/services/sourceHealthService.ts`:

```ts
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
  const blocked = blockedReason(source, enabled, missingCredentials)
  if (blocked) return blockedRow(source, blocked, settings, scope.scope, scope.scheduleGroup)

  const runs = runsByKey.get(healthScopeKey(scope)) ?? { latest: null, latestSuccess: null }
  const status = rowStatus(scope, runs, now)
  const acceptedSamples = status.acceptanceStatus === "blocked"
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
    runStatus: status.runStatus,
    acceptanceStatus: status.acceptanceStatus,
    freshnessStatus: status.freshnessStatus,
    reasonCode: status.reasonCode,
    reason: reasonText(status.reasonCode),
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
  const samples = dependencies.samples ?? (async () => [])

  return {
    async getSourceHealth(now = new Date()): Promise<SourceHealthResponse> {
      const runs = await database.sourceSyncRun.findMany({
        where: { source: { in: SOURCE_CATALOG.map((source) => source.id) } },
        orderBy: { startedAt: "desc" },
        take: 500
      })
      const runsByKey = latestRunsByScope(runs)
      const healthScopeKeys = new Set(registeredHealthScopes.map((scope) => scope.sourceId))
      const rows = await Promise.all(registeredHealthScopes.map((scope) => {
        return scopeRow(scope, runsByKey, settings, samples, now)
      }))

      for (const source of SOURCE_CATALOG) {
        if (healthScopeKeys.has(source.id)) continue
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
```

- [ ] **Step 5: Run the service tests**

Run:

```bash
npm test --workspace backend -- sourceHealth
```

Expected: PASS for service tests. If TypeScript reports the `database.sourceSyncRun.findMany` type too wide for `SourceHealthDatabase`, change `SourceHealthDatabase` to `Pick<PrismaClient, "sourceSyncRun">` exactly as shown above.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/sourceHealthService.ts backend/tests/sourceHealth.test.ts
git commit -m "feat: 计算来源健康矩阵"
```

---

### Task 4: Add Persisted Acceptance Samples

**Files:**
- Create: `backend/src/services/sourceHealthSamples.ts`
- Modify: `backend/src/services/sourceHealthService.ts`
- Modify: `backend/tests/sourceHealth.test.ts`

**Interfaces:**
- Consumes: `RegisteredHealthScope`, Prisma `release`, `popularitySignal`, `mediaItem`
- Produces: `createSourceHealthSampleReader(database).samplesForScope(scope, limit)`

- [ ] **Step 1: Add failing sample tests**

Append this test to the `source health service` describe block in `backend/tests/sourceHealth.test.ts`:

```ts
  it("returns persisted acceptance samples without calling adapters", async () => {
    const now = new Date("2026-07-08T04:00:00Z")
    const media = await prisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "movie",
        titleDisplay: "Sample Movie",
        titleOriginal: "Sample Movie",
        firstReleaseDate: "2026-07-08",
        status: "upcoming",
        sourceContentType: "movie"
      }
    })
    await prisma.sourceSyncRun.create({
      data: {
        source: "trakt",
        scope: "popularity",
        status: "success",
        startedAt: new Date("2026-07-08T03:00:00Z"),
        finishedAt: new Date("2026-07-08T03:01:00Z"),
        itemCount: 1
      }
    })
    await prisma.popularitySignal.create({
      data: {
        mediaItemId: media.id,
        source: "trakt_trending",
        sourceCategory: "community_trend",
        platform: "Trakt",
        region: "GLOBAL",
        window: "week",
        rank: 1,
        capturedAt: new Date("2026-07-08T03:01:00Z"),
        isCurrent: true,
        sourceUrl: "https://trakt.tv/movies/sample-movie-2026"
      }
    })

    const settings = settingsWith({
      TRAKT_CLIENT_ID: "client-id",
      SOURCE_TRAKT_ENABLED: "true"
    })
    const service = createSourceHealthService({ database: prisma, settings })
    const response = await service.getSourceHealth(now)
    const row = response.items.find((item) => `${item.sourceId}:${item.scope}` === "trakt:popularity")

    expect(row?.samples).toEqual([
      {
        title: "Sample Movie",
        mediaType: "movie",
        signalKind: "community_trend",
        source: "trakt_trending",
        platform: "Trakt",
        region: "GLOBAL",
        sourceUrl: "https://trakt.tv/movies/sample-movie-2026",
        capturedAtOrFetchedAt: "2026-07-08T03:01:00.000Z"
      }
    ])
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test --workspace backend -- sourceHealth
```

Expected: FAIL because samples are currently always `[]`.

- [ ] **Step 3: Create sample reader**

Create `backend/src/services/sourceHealthSamples.ts`:

```ts
import type { PrismaClient } from "@prisma/client"
import type { SourceHealthSample, SourceSignalKind } from "@whatsnew/shared/settings"
import type { RegisteredHealthScope } from "../adapters/adapterRegistry.js"
import { db } from "../config/db.js"

type SourceHealthSampleDatabase = Pick<PrismaClient, "release" | "popularitySignal">

function primarySignalKind(scope: RegisteredHealthScope): SourceSignalKind {
  return scope.healthPolicy.expectedSignalKinds[0] ?? "metadata"
}

export function createSourceHealthSampleReader(database: SourceHealthSampleDatabase = db) {
  return {
    async samplesForScope(scope: RegisteredHealthScope, limit: number): Promise<SourceHealthSample[]> {
      if (scope.healthPolicy.sampleStrategy === "release") {
        const releases = await database.release.findMany({
          where: { source: scope.sourceId },
          include: { mediaItem: true },
          orderBy: { fetchedAt: "desc" },
          take: limit
        })

        return releases.map((release) => ({
          title: release.mediaItem.titleDisplay,
          mediaType: release.mediaItem.mediaType,
          signalKind: primarySignalKind(scope),
          source: release.source,
          platform: release.platform,
          region: release.region,
          sourceUrl: release.sourceUrl,
          capturedAtOrFetchedAt: release.fetchedAt.toISOString()
        }))
      }

      if (scope.healthPolicy.sampleStrategy === "popularity") {
        const signals = await database.popularitySignal.findMany({
          where: {
            isCurrent: true,
            OR: [
              { source: scope.sourceId },
              { source: { startsWith: `${scope.sourceId}_` } }
            ]
          },
          include: { mediaItem: true },
          orderBy: [
            { rank: "asc" },
            { capturedAt: "desc" }
          ],
          take: limit
        })

        return signals.map((signal) => ({
          title: signal.mediaItem.titleDisplay,
          mediaType: signal.mediaItem.mediaType,
          signalKind: primarySignalKind(scope),
          source: signal.source,
          platform: signal.platform,
          region: signal.region,
          sourceUrl: signal.sourceUrl,
          capturedAtOrFetchedAt: signal.capturedAt.toISOString()
        }))
      }

      return []
    }
  }
}

export const sourceHealthSampleReader = createSourceHealthSampleReader()
```

- [ ] **Step 4: Wire sample reader into health service**

Modify imports in `backend/src/services/sourceHealthService.ts`:

```ts
import { sourceHealthSampleReader } from "./sourceHealthSamples.js"
```

Change the `samples` fallback in `createSourceHealthService()`:

```ts
const samples = dependencies.samples ?? ((scope: RegisteredHealthScope, limit: number) => {
  return sourceHealthSampleReader.samplesForScope(scope, limit)
})
```

- [ ] **Step 5: Run sample tests**

Run:

```bash
npm test --workspace backend -- sourceHealth
```

Expected: PASS including `returns persisted acceptance samples without calling adapters`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/sourceHealthSamples.ts backend/src/services/sourceHealthService.ts backend/tests/sourceHealth.test.ts
git commit -m "feat: 添加来源健康验收样本"
```

---

### Task 5: Add `GET /api/source-health`

**Files:**
- Create: `backend/src/routes/sourceHealth.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/tests/api.test.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/integration-guide.md`

**Interfaces:**
- Consumes: `sourceHealthService.getSourceHealth()`
- Produces: `GET /api/source-health`

- [ ] **Step 1: Add failing route test**

Append this test to `backend/tests/api.test.ts`:

```ts
  it("returns source health summary and scope rows", async () => {
    await prisma.sourceSyncRun.create({
      data: {
        source: "trakt",
        scope: "popularity",
        status: "success",
        startedAt: new Date(),
        finishedAt: new Date(),
        itemCount: 3
      }
    })
    const response = await request(createApp()).get("/api/source-health")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      summary: expect.objectContaining({
        total: expect.any(Number),
        passed: expect.any(Number),
        degraded: expect.any(Number),
        failed: expect.any(Number),
        blocked: expect.any(Number),
        runnable: expect.any(Number),
        stale: expect.any(Number)
      })
    })
    expect(response.body.items.find((item: any) => item.sourceId === "trakt" && item.scope === "popularity")).toMatchObject({
      sourceName: "Trakt",
      scheduleGroup: "hourly",
      runStatus: expect.any(String),
      acceptanceStatus: expect.any(String),
      reasonCode: expect.any(String),
      samples: expect.any(Array)
    })
  })
```

- [ ] **Step 2: Run route test to verify it fails**

Run:

```bash
npm test --workspace backend -- api.test.ts
```

Expected: FAIL with 404 for `/api/source-health`.

- [ ] **Step 3: Create route**

Create `backend/src/routes/sourceHealth.ts`:

```ts
import { Router } from "express"
import { sourceHealthService } from "../services/sourceHealthService.js"

export const sourceHealthRouter = Router()

sourceHealthRouter.get("/", async (_req, res) => {
  res.json(await sourceHealthService.getSourceHealth())
})
```

- [ ] **Step 4: Mount route**

Modify `backend/src/app.ts` imports:

```ts
import { sourceHealthRouter } from "./routes/sourceHealth.js"
```

Add the route after `/api/sources`:

```ts
app.use("/api/source-health", sourceHealthRouter)
```

- [ ] **Step 5: Run route tests**

Run:

```bash
npm test --workspace backend -- api.test.ts sourceHealth
```

Expected: PASS for API and source health tests.

- [ ] **Step 6: Update architecture docs**

In `docs/architecture.md`, add this row to the public API routes table:

```md
| `GET /api/source-health` | Read-only source health matrix by adapter scope; does not trigger sync. |
```

Add this sentence under `Status Semantics`:

```md
`GET /api/source-health` separates run status from acceptance status, applies stale thresholds by schedule group, and returns blocked coverage rows for unavailable sources.
```

- [ ] **Step 7: Update integration guide**

Add this section to `docs/integration-guide.md` after `## Sources`:

````md
## Source Health

```bash
curl -s http://127.0.0.1:19993/api/source-health
```

Returns a read-only source health matrix. It does not trigger sync. Use `POST /api/sync` or `POST /api/sources/:source/sync` before reading this endpoint when you want a fresh run.

Top-level shape:

```json
{
  "generatedAt": "2026-07-08T04:00:00.000Z",
  "summary": {
    "total": 22,
    "passed": 8,
    "degraded": 1,
    "failed": 2,
    "blocked": 11,
    "runnable": 10,
    "stale": 2
  },
  "items": []
}
```

Each item is keyed by `sourceId + scope` and includes `runStatus`, `acceptanceStatus`, `freshnessStatus`, `reasonCode`, `reason`, `latestRun`, `lastSuccessAt`, `staleAfterHours` and up to 3 persisted `samples`.
````

- [ ] **Step 8: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected:

- `npm run typecheck` exits 0.
- Backend tests include the new source health tests and exit 0.
- Frontend tests still exit 0.
- Build exits 0.

- [ ] **Step 9: Commit**

```bash
git add backend/src/routes/sourceHealth.ts backend/src/app.ts backend/tests/api.test.ts docs/architecture.md docs/integration-guide.md
git commit -m "feat: 添加来源健康矩阵接口"
```

---

## Self-Review

### Spec Coverage

- Adapter/scope acceptance unit: Task 2 and Task 3.
- Read-only `GET /api/source-health`: Task 5 and ADR-0002.
- `runStatus` vs `acceptanceStatus`: Task 1 and Task 3.
- Four acceptance statuses: Task 1 and Task 3.
- Stale thresholds: Task 2 and Task 3.
- Empty result failure by default: Task 2 and Task 3.
- Samples from database only: Task 4.
- Planned/commercial/restricted/unimplemented coverage rows: Task 3.
- `summary + items`: Task 1 and Task 3.
- `reasonCode + reason`: Task 1 and Task 3.
- Shared reason code enum: Task 1.
- Health policy with adapter/scope registration: Task 2 and ADR-0001.

### Placeholder Scan

The placeholder audit passes: every task includes exact file paths, code snippets, commands and expected results.

### Type Consistency

- `SourceHealthReasonCode` values match `SOURCE_HEALTH_REASON_CODES`.
- `RegisteredHealthScope.scheduleGroup` uses `SourceHealthScheduleGroup`, while `RegisteredAdapter.scheduleGroup` keeps existing `ScheduleGroup`.
- `healthScopeKey()` accepts both `RegisteredAdapter` and `RegisteredHealthScope`.
- `SourceHealthResponse.summary` matches `SourceHealthSummary`.
