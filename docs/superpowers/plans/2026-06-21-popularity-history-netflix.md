# WhatsNew Popularity History And Netflix Top 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve source-specific popularity history, derive rank movement and events, expose current/history APIs and UI, then ingest Netflix's official global weekly Top 10.

**Architecture:** Keep `PopularitySignal` append-only and materialize one `isCurrent` row per media/source/platform/region/window identity. A dedicated snapshot service owns delta calculation, event generation, retention, and heat-score recomputation; adapters only emit raw observations. Netflix downloads the official XLSX through the existing source-aware HTTP client and writes weekly observations through the same history path.

**Tech Stack:** TypeScript, Express 5, Prisma 5/MySQL, React 18, TanStack Query, Vitest, Testing Library, Undici, ExcelJS, node-cron.

## Global Constraints

- JavaScript and TypeScript use no semicolons and 2-space indentation.
- Every external service keeps its own `RateLimiter`; consecutive requests to the same service start at least 2 seconds apart.
- Popularity remains source-specific; `heatScore` is only an auxiliary sort value.
- `rankDelta = previousRank - currentRank`; positive means rising and negative means falling.
- Every popularity identity has exactly one `isCurrent=true` row after a successful item transaction.
- History retention is 90 days and never deletes current rows.
- Netflix uses the public official XLSX and no new credential.
- Sensitive settings, proxies, response bodies, and local `.env` values never enter logs, fixtures, commits, or API responses.
- Frontend stays on `19992`; backend stays on `19993`.
- Use TDD for every behavior change and commit each independently verified task with `type: 中文描述`.

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `backend/prisma/schema.prisma` | Modify | Current/history marker, previous rank, sync-run relation, indexes |
| `backend/src/domain/popularityMovement.ts` | Create | Pure delta, movement, event and heat calculations |
| `backend/src/services/popularitySnapshotService.ts` | Create | Transactional snapshot persistence, events, heat and retention |
| `backend/src/services/sourceSyncService.ts` | Modify | Route all signals through snapshot service and preserve history |
| `backend/src/routes/trending.ts` | Modify | Current-only movement filters |
| `backend/src/routes/media.ts` | Modify | Current detail signals and bounded history endpoint |
| `frontend/src/pages/TrendingPage.tsx` | Modify | Movement tabs, source/platform filters and rank deltas |
| `frontend/src/pages/MediaDetailPage.tsx` | Modify | Source-grouped 30-day popularity timeline |
| `backend/src/adapters/netflixTop10Parser.ts` | Create | Validate and parse Netflix XLSX rows |
| `backend/src/adapters/netflixTop10Adapter.ts` | Create | Map latest weekly rows into normalized media and signals |
| `backend/src/utils/sourceHttpClient.ts` | Modify | Binary response helper |
| `backend/src/settings/sourceCatalog.ts` | Modify | Activate Netflix and assign daily schedule |
| `backend/src/adapters/adapterRegistry.ts` | Modify | Register Netflix and select adapters by schedule |
| `backend/src/scheduler.ts` | Modify | Hourly and daily source groups |
| `backend/src/scripts/syncNetflix.ts` | Create | Manual Netflix sync command |

---

### Task 1: Popularity Schema And Pure Movement Rules

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/domain/types.ts`
- Create: `backend/src/domain/popularityMovement.ts`
- Create: `backend/tests/popularityMovement.test.ts`

**Interfaces:**
- Produces: `PopularityMovement`, `calculateRankDelta()`, `classifyMovement()`, `classifyPopularityEvent()`, `heatFromCurrentSignals()`
- Produces schema fields: `sourceSyncRunId`, `isCurrent`, `previousRank`
- Consumes: existing `PopularitySignalInput`

- [ ] **Step 1: Write the failing pure-domain tests**

```ts
import { describe, expect, it } from "vitest"
import {
  calculateRankDelta,
  classifyMovement,
  classifyPopularityEvent,
  heatFromCurrentSignals
} from "../src/domain/popularityMovement.js"

describe("popularity movement", () => {
  it("treats a lower current rank as positive movement", () => {
    expect(calculateRankDelta(12, 7)).toBe(5)
    expect(classifyMovement(12, 7)).toBe("rising")
    expect(classifyMovement(7, 12)).toBe("falling")
    expect(classifyMovement(null, 8)).toBe("new")
    expect(classifyMovement(8, 8)).toBe("stable")
  })

  it("emits at most one event using the approved thresholds", () => {
    expect(classifyPopularityEvent(null, 8)).toBe("rank_entered")
    expect(classifyPopularityEvent(14, 9)).toBe("heat_rising")
    expect(classifyPopularityEvent(10, 5)).toBe("heat_rising")
    expect(classifyPopularityEvent(4, 7)).toBe("rank_changed")
    expect(classifyPopularityEvent(4, 5)).toBeNull()
  })

  it("uses the strongest current rank as the auxiliary heat score", () => {
    expect(heatFromCurrentSignals([{ rank: 18 }, { rank: 3 }, { rank: null }])).toBe(98)
    expect(heatFromCurrentSignals([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test --workspace backend -- popularityMovement.test.ts`

Expected: FAIL because `popularityMovement.js` does not exist.

- [ ] **Step 3: Implement the pure rules**

```ts
export type PopularityMovement = "new" | "rising" | "falling" | "stable"
export type PopularityEventType = "rank_entered" | "heat_rising" | "rank_changed"

export function calculateRankDelta(previousRank: number | null, currentRank: number | null): number | null {
  if (previousRank == null || currentRank == null) return null
  return previousRank - currentRank
}

export function classifyMovement(previousRank: number | null, currentRank: number | null): PopularityMovement {
  if (previousRank == null && currentRank != null) return "new"
  const delta = calculateRankDelta(previousRank, currentRank)
  if (delta == null || delta === 0) return "stable"
  return delta > 0 ? "rising" : "falling"
}

export function classifyPopularityEvent(
  previousRank: number | null,
  currentRank: number | null
): PopularityEventType | null {
  if (currentRank == null) return null
  if (previousRank == null) return currentRank <= 10 ? "rank_entered" : null
  const delta = previousRank - currentRank
  if (delta >= 5 || (previousRank > 10 && currentRank <= 10)) return "heat_rising"
  return Math.abs(delta) >= 3 ? "rank_changed" : null
}

export function heatFromCurrentSignals(signals: Array<{ rank: number | null }>): number {
  return signals.reduce((score, signal) => {
    return Math.max(score, signal.rank == null ? 0 : Math.max(0, 101 - signal.rank))
  }, 0)
}
```

Extend `PopularitySignalInput` with `capturedAt?: Date`. In Prisma add to `PopularitySignal`:

```prisma
sourceSyncRunId String?
isCurrent       Boolean  @default(true)
previousRank    Int?

sourceSyncRun SourceSyncRun? @relation(fields: [sourceSyncRunId], references: [id], onDelete: SetNull)

@@index([mediaItemId, source, isCurrent])
@@index([source, window, isCurrent, rank])
@@index([capturedAt, isCurrent])
@@index([sourceSyncRunId])
```

Add `popularitySignals PopularitySignal[]` to `SourceSyncRun`.

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run:

```bash
npm run prisma:generate --workspace backend
npm test --workspace backend -- popularityMovement.test.ts
npm run typecheck --workspace backend
```

Expected: all commands exit 0.

- [ ] **Step 5: Confirm the test database received the additive schema**

Run: `npm test --workspace backend -- popularityMovement.test.ts`

The backend test script runs `prepareTestDatabase.ts` before Vitest. Expected output must identify `whatsnew_test`, report the schema is in sync, and pass the focused test. Do not run `prisma:push` against the development database in this task.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/domain/types.ts backend/src/domain/popularityMovement.ts backend/tests/popularityMovement.test.ts
git commit -m "feat: 添加热度历史数据契约"
```

---

### Task 2: Transactional Popularity Snapshot Service

**Files:**
- Create: `backend/src/services/popularitySnapshotService.ts`
- Create: `backend/tests/popularitySnapshotService.test.ts`
- Modify: `backend/src/services/eventService.ts`

**Interfaces:**
- Consumes: Task 1 movement functions and Prisma fields
- Produces: `PopularitySnapshotService.persistSignal()`, `persistSignals()`, `pruneHistory()`

Use these public types:

```ts
export type PersistSignalInput = {
  mediaItemId: string
  mediaTitle: string
  signal: PopularitySignalInput
  sourceSyncRunId: string
  capturedAt: Date
}

export class PopularitySnapshotService {
  constructor(private readonly prisma: PrismaClient) {}
  persistSignal(input: PersistSignalInput): Promise<PopularitySignal>
  persistSignals(inputs: PersistSignalInput[]): Promise<PopularitySignal[]>
  pruneHistory(signalSources: string[], cutoff: Date): Promise<number>
}
```

- [ ] **Step 1: Write failing database tests**

Cover all of these in `popularitySnapshotService.test.ts` using `testPrisma` and the existing database cleanup helper:

```ts
function input(
  overrides: Partial<PopularitySignalInput>,
  capturedAt: Date
): PersistSignalInput {
  return {
    mediaItemId: mediaId,
    mediaTitle: "示例剧",
    sourceSyncRunId: runId,
    capturedAt,
    signal: {
      source: "tmdb_trending",
      sourceCategory: "metadata_community",
      platform: "TMDb",
      region: "GLOBAL",
      window: "week",
      rank: null,
      rankDelta: null,
      value: null,
      valueLabel: null,
      sourceUrl: "https://example.test/source",
      ...overrides
    }
  }
}

it("appends history and leaves exactly one current snapshot", async () => {
  const first = await service.persistSignal(input({ rank: 12 }, new Date("2026-06-20T00:00:00Z")))
  const second = await service.persistSignal(input({ rank: 7 }, new Date("2026-06-21T00:00:00Z")))
  expect(first.rankDelta).toBeNull()
  expect(second.previousRank).toBe(12)
  expect(second.rankDelta).toBe(5)
  expect(await testPrisma.popularitySignal.count()).toBe(2)
  expect(await testPrisma.popularitySignal.count({ where: { isCurrent: true } })).toBe(1)
})

it("updates rather than duplicates the same capturedAt", async () => {
  const capturedAt = new Date("2026-06-21T00:00:00Z")
  await service.persistSignal(input({ rank: 7, value: 100 }, capturedAt))
  await service.persistSignal(input({ rank: 7, value: 120 }, capturedAt))
  expect(await testPrisma.popularitySignal.count()).toBe(1)
  expect((await testPrisma.popularitySignal.findFirst())?.value).toBe(120)
})

it("recomputes heat from every current source", async () => {
  const dayOne = new Date("2026-06-21T00:00:00Z")
  await service.persistSignal(input({ source: "tmdb_trending", rank: 3 }, dayOne))
  await service.persistSignal(input({ source: "iqiyi_reserve", rank: 20 }, dayOne))
  expect((await testPrisma.mediaItem.findUnique({ where: { id: mediaId } }))?.heatScore).toBe(98)
})
```

Also test: one event maximum per snapshot, payload fields, no event for 1-2 rank movement, and pruning deletes only old `isCurrent=false` rows.

- [ ] **Step 2: Run and verify RED**

Run: `npm test --workspace backend -- popularitySnapshotService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement event creation**

Add to `eventService.ts`:

```ts
export type PopularityEventPayload = {
  source: string
  platform: string | null
  region: string | null
  window: string
  previousRank: number | null
  currentRank: number | null
  rankDelta: number | null
  capturedAt: string
}

export async function createPopularityEvent(
  prisma: Prisma.TransactionClient,
  mediaItemId: string,
  mediaTitle: string,
  eventType: "rank_entered" | "heat_rising" | "rank_changed",
  payload: PopularityEventPayload,
  sourceUrl: string | null
): Promise<void> {
  const descriptions = {
    rank_entered: `${mediaTitle} 新进入 ${payload.source} 前十`,
    heat_rising: `${mediaTitle} 在 ${payload.source} 上升 ${payload.rankDelta} 位`,
    rank_changed: `${mediaTitle} 在 ${payload.source} 排名发生变化`
  }
  await prisma.changeEvent.create({
    data: {
      mediaItemId,
      eventType,
      title: descriptions[eventType],
      description: descriptions[eventType],
      source: payload.source,
      sourceUrl,
      eventAt: new Date(payload.capturedAt),
      payload: JSON.stringify(payload)
    }
  })
}
```

- [ ] **Step 4: Implement transactional persistence**

Inside `persistSignal()`, use `this.prisma.$transaction(async (tx) => { ... })`. Query the previous current row with exact nullable `platform`, `region`, and `window`. If `previous.capturedAt.getTime() === capturedAt.getTime()`, update its observation fields and return it without an event. Otherwise mark matching current rows false, create the new row with calculated fields, generate at most one classified event, query all current ranks for the media item, and update `MediaItem.heatScore` with `heatFromCurrentSignals()`.

`pruneHistory()` must execute exactly this predicate:

```ts
const result = await this.prisma.popularitySignal.deleteMany({
  where: {
    source: { in: signalSources },
    isCurrent: false,
    capturedAt: { lt: cutoff }
  }
})
return result.count
```

- [ ] **Step 5: Verify service tests and backend typecheck**

Run:

```bash
npm test --workspace backend -- popularitySnapshotService.test.ts
npm run typecheck --workspace backend
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/popularitySnapshotService.ts backend/src/services/eventService.ts backend/tests/popularitySnapshotService.test.ts
git commit -m "feat: 添加热度快照与异动服务"
```

---

### Task 3: Source Sync History Integration And Retention

**Files:**
- Modify: `backend/src/services/sourceSyncService.ts`
- Modify: `backend/tests/sync.test.ts`

**Interfaces:**
- Consumes: `PopularitySnapshotService`
- Produces: source syncs that append history, recompute heat, and return `warning` on retention-only failure

- [ ] **Step 1: Change the sync integration tests to require history**

Add a two-run case with controlled time:

```ts
vi.setSystemTime(new Date("2026-06-20T00:00:00Z"))
await runSourceSync(testPrisma, adapterWithRank(12))
vi.setSystemTime(new Date("2026-06-21T00:00:00Z"))
await runSourceSync(testPrisma, adapterWithRank(7))

const signals = await testPrisma.popularitySignal.findMany({ orderBy: { capturedAt: "asc" } })
expect(signals).toHaveLength(2)
expect(signals.map((signal) => signal.isCurrent)).toEqual([false, true])
expect(signals[1].rankDelta).toBe(5)
```

Replace the old assertion that popularity counts stay unchanged after two syncs. Keep release rows idempotent. Add a source with no signals after a hot source and assert the existing heat score remains unchanged.

- [ ] **Step 2: Run and verify RED**

Run: `npm test --workspace backend -- sync.test.ts`

Expected: FAIL because old sync deletes signals and overwrites heat.

- [ ] **Step 3: Integrate the service**

In `upsertItem()`:

- remove `heatFromSignals()` and all popularity `deleteMany/createMany` code
- do not set `heatScore` when updating a matched media item
- initialize new media with `heatScore: 0`
- call `snapshotService.persistSignals()` with one input per adapter signal
- use `signal.capturedAt ?? startedAt` as the snapshot timestamp
- pass the current `SourceSyncRun.id`

After all items succeed, collect unique signal source names and prune with:

```ts
const cutoff = new Date(finishedAt.getTime() - 90 * 24 * 60 * 60 * 1000)
```

Catch only pruning errors, set run status to `warning`, and store the redacted message. Data persistence errors still set the run to `failed`.

- [ ] **Step 4: Verify focused and full backend tests**

Run:

```bash
npm test --workspace backend -- sync.test.ts popularitySnapshotService.test.ts
npm test --workspace backend
npm run typecheck --workspace backend
```

Expected: 15 or more backend test files pass and no existing adapter regression appears.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/sourceSyncService.ts backend/tests/sync.test.ts
git commit -m "refactor: 将数据源同步接入热度历史"
```

---

### Task 4: Current Trending And Popularity History APIs

**Files:**
- Modify: `backend/src/routes/trending.ts`
- Modify: `backend/src/routes/media.ts`
- Modify: `backend/tests/api.test.ts`
- Modify: `frontend/src/api/types.ts`

**Interfaces:**
- Produces: `GET /api/trending` current-only movement filters
- Produces: `GET /api/media/:id/popularity-history`
- Produces frontend types: `PopularityMovement`, `PopularityHistoryResponse`

- [ ] **Step 1: Add failing API tests**

Seed current and historical rows, then cover:

```ts
const rising = await request(createApp()).get("/api/trending?movement=rising&source=tmdb_trending")
expect(rising.status).toBe(200)
expect(rising.body.items).toHaveLength(1)
expect(rising.body.items[0]).toMatchObject({ isCurrent: true, previousRank: 12, rank: 7, rankDelta: 5 })

const history = await request(createApp()).get(`/api/media/${mediaId}/popularity-history?days=30&limit=10`)
expect(history.status).toBe(200)
expect(history.body.items.map((item: { rank: number }) => item.rank)).toEqual([12, 7])

expect((await request(createApp()).get(`/api/media/${mediaId}/popularity-history?days=91`)).status).toBe(400)
```

Also verify `/api/media/:id` returns only current signals and `movement=new|falling|stable` predicates.

- [ ] **Step 2: Run and verify RED**

Run: `npm test --workspace backend -- api.test.ts`

Expected: FAIL because historical rows leak into trending/detail and the history endpoint is absent.

- [ ] **Step 3: Implement validated query handling**

Use Zod schemas:

```ts
const trendingQuerySchema = z.object({
  source: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  mediaType: z.string().min(1).optional(),
  releaseForm: z.string().min(1).optional(),
  window: z.string().min(1).optional(),
  movement: z.enum(["new", "rising", "falling", "stable"]).optional()
})

const historyQuerySchema = z.object({
  source: z.string().min(1).optional(),
  days: z.coerce.number().int().min(1).max(90).default(30),
  limit: z.coerce.number().int().min(1).max(1000).default(300)
})
```

Map movements to Prisma predicates:

```ts
new: { previousRank: null, rank: { not: null } }
rising: { rankDelta: { gt: 0 } }
falling: { rankDelta: { lt: 0 } }
stable: { rankDelta: 0 }
```

All trending queries include `isCurrent: true`. History cutoff is `new Date(Date.now() - days * 86_400_000)` and results order by `capturedAt: "asc"`.

- [ ] **Step 4: Update frontend contracts**

Add `isCurrent: boolean` and `previousRank: number | null` to `PopularitySignal`, plus:

```ts
export type PopularityMovement = "new" | "rising" | "falling" | "stable"
export type PopularityHistoryResponse = {
  items: Omit<PopularitySignal, "mediaItem">[]
}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test --workspace backend -- api.test.ts
npm run typecheck
```

```bash
git add backend/src/routes/trending.ts backend/src/routes/media.ts backend/tests/api.test.ts frontend/src/api/types.ts
git commit -m "feat: 添加当前热度与历史查询接口"
```

---

### Task 5: Trending Movement UI And Media Timeline

**Files:**
- Modify: `frontend/src/pages/TrendingPage.tsx`
- Modify: `frontend/src/pages/MediaDetailPage.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/tests/pages.test.tsx`

**Interfaces:**
- Consumes: Task 4 APIs and types
- Produces: URL-backed movement/source/platform filters and 30-day detail timeline

- [ ] **Step 1: Add failing frontend tests**

Cover these behaviors:

```tsx
it("writes movement and source filters to the URL and API request", async () => {
  renderRoute("/trending")
  await user.click(await screen.findByRole("tab", { name: "上升" }))
  await user.selectOptions(screen.getByLabelText("热度来源"), "tmdb_trending")
  expect(fetchMock).toHaveBeenCalledWith("/api/trending?movement=rising&source=tmdb_trending")
})

it("renders positive, negative and new rank movement", async () => {
  renderRoute("/trending")
  expect(await screen.findByText("上升 5 位")).toHaveClass("movementUp")
  expect(screen.getByText("下降 3 位")).toHaveClass("movementDown")
  expect(screen.getByText("新进榜")).toHaveClass("movementNew")
})

it("loads a bounded popularity timeline on media detail", async () => {
  renderRoute("/media/media-1")
  expect(fetchMock).toHaveBeenCalledWith("/api/media/media-1/popularity-history?days=30")
  expect(await screen.findByRole("heading", { name: "热度时间线" })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test --workspace frontend -- pages.test.tsx`

Expected: FAIL because filters and history UI do not exist.

- [ ] **Step 3: Implement URL-backed trending controls**

Use `useSearchParams`. Build the API URL from non-empty parameters in the fixed order `movement`, `source`, `platform`, `mediaType`. Render tabs with `role="tablist"` and `aria-selected`; use `<select>` for source/platform. Preserve the source-specific row model.

Movement text is exact:

```ts
function movementLabel(signal: PopularitySignal): string {
  if (signal.previousRank == null && signal.rank != null) return "新进榜"
  if ((signal.rankDelta ?? 0) > 0) return `上升 ${signal.rankDelta} 位`
  if ((signal.rankDelta ?? 0) < 0) return `下降 ${Math.abs(signal.rankDelta!)} 位`
  return "排名不变"
}
```

- [ ] **Step 4: Implement the detail timeline**

Load with query key `["popularity-history", id, 30]`. Group rows by `source`, render source headings and chronological rows with date, rank, delta and `valueLabel`. Do not add a chart library.

- [ ] **Step 5: Add responsive styles**

Add stable classes `.trendingToolbar`, `.movementTabs`, `.movementUp`, `.movementDown`, `.movementNew`, `.popularityTimeline`, and `.timelineRow`. Below 720px, tabs scroll inside their own strip, selects stack, and timeline rows use one column without page-level overflow.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test --workspace frontend
npm run typecheck --workspace frontend
npm run build --workspace frontend
```

```bash
git add frontend/src/pages/TrendingPage.tsx frontend/src/pages/MediaDetailPage.tsx frontend/src/styles.css frontend/tests/pages.test.tsx
git commit -m "feat: 添加热度异动筛选与历史时间线"
```

---

### Task 6: Netflix XLSX Parser And Adapter

**Files:**
- Modify: `backend/package.json`
- Modify: `package-lock.json`
- Modify: `backend/src/utils/sourceHttpClient.ts`
- Create: `backend/src/adapters/netflixTop10Parser.ts`
- Create: `backend/src/adapters/netflixTop10Adapter.ts`
- Create: `backend/tests/netflixTop10Adapter.test.ts`

**Interfaces:**
- Produces: `SourceHttpClient.fetchBuffer()`
- Produces: `parseNetflixTop10Workbook(buffer)` and `createNetflixTop10Adapter()`
- Consumes: Task 1 `capturedAt` signal field and existing proxy/rate-limit infrastructure

- [ ] **Step 1: Install ExcelJS**

Run: `npm install exceljs@^4.4.0 --workspace backend`

Expected: dependency appears in `backend/package.json` and lockfile.

- [ ] **Step 2: Write failing parser and adapter tests**

Build an in-memory workbook in the test using ExcelJS with the exact columns from the spec. Include two weeks and all four categories. Assert only the latest week returns and mappings are exact:

```ts
expect(items).toHaveLength(4)
expect(items.map((item) => item.media.mediaType)).toEqual(["movie", "movie", "series", "series"])
expect(items[2].popularitySignals[0]).toMatchObject({
  source: "netflix_top10",
  sourceCategory: "official_platform",
  platform: "Netflix",
  region: "GLOBAL",
  window: "week",
  rank: 1,
  value: 12_500_000,
  capturedAt: new Date("2026-06-14T00:00:00.000Z")
})
```

Also assert:

- a workbook missing `weekly_views` rejects with `Netflix Top 10 缺少列: weekly_views`
- a workbook with no non-empty `week` rejects with `Netflix Top 10 没有有效周次`
- an invalid ZIP buffer rejects with `Netflix Top 10 文件无法解析`
- the source request uses inherited proxy settings, a 10-second timeout, and one 2-second limiter

- [ ] **Step 3: Run and verify RED**

Run: `npm test --workspace backend -- netflixTop10Adapter.test.ts`

Expected: FAIL because parser and adapter do not exist.

- [ ] **Step 4: Add binary HTTP support**

```ts
async fetchBuffer(sourceId: string, url: string, options: SourceRequestOptions): Promise<Buffer> {
  const response = await this.request(sourceId, url, options)
  return Buffer.from(await response.arrayBuffer())
}
```

- [ ] **Step 5: Implement strict XLSX parsing**

`parseNetflixTop10Workbook()` loads the first sheet, maps the header row by name, validates these nine required columns, normalizes Excel values, rejects empty weeks, selects `week === max(week)`, and returns typed rows sorted by category then rank. Wrap ExcelJS load failures as `new Error("Netflix Top 10 文件无法解析")`; do not catch the explicit missing-column or empty-week errors. It never logs cell contents.

- [ ] **Step 6: Implement the adapter**

Use constants:

```ts
const NETFLIX_TOP10_URL = "https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx"
const NETFLIX_TIMEOUT_MS = 10000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
```

Snapshot settings once at `fetchItems()` start, call `fetchBuffer("netflix", url, { timeoutMs, settingsOverride })` inside the limiter, then map rows using the exact source fields and category rules from the spec. `valueLabel` must be Chinese and include views, hours and cumulative weeks. `season_title` values other than empty or `N/A` become aliases.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm test --workspace backend -- netflixTop10Adapter.test.ts sourceHttpClient.test.ts
npm run typecheck --workspace backend
```

```bash
git add backend/package.json package-lock.json backend/src/utils/sourceHttpClient.ts backend/src/adapters/netflixTop10Parser.ts backend/src/adapters/netflixTop10Adapter.ts backend/tests/netflixTop10Adapter.test.ts
git commit -m "feat: 接入 Netflix 官方 Top 10 适配器"
```

---

### Task 7: Netflix Catalog, Scheduling And Manual Sync

**Files:**
- Modify: `backend/src/settings/sourceCatalog.ts`
- Modify: `backend/src/adapters/adapterRegistry.ts`
- Modify: `backend/src/scheduler.ts`
- Create: `backend/src/scripts/syncNetflix.ts`
- Modify: `backend/package.json`
- Modify: `backend/.env.example`
- Modify: `backend/tests/sourceCatalog.test.ts`
- Modify: `backend/tests/scheduler.test.ts`

**Interfaces:**
- Adds `scheduleGroup: "hourly" | "daily"` to `SourceDefinition`
- Produces `getEnabledAdapters(scheduleGroup?)`
- Makes Netflix active, enableable, testable and syncable

- [ ] **Step 1: Write failing catalog and scheduler tests**

Update active source expectation to:

```ts
["tvmaze", "tmdb", "netflix", "youku", "iqiyi"]
```

Assert Netflix has `scheduleGroup === "daily"`, four existing active adapters are hourly, planned sources remain unsyncable, hourly cron invokes no Netflix adapter, daily cron invokes only enabled daily adapters, and initial sync still invokes all enabled adapters.

- [ ] **Step 2: Run and verify RED**

Run: `npm test --workspace backend -- sourceCatalog.test.ts scheduler.test.ts`

Expected: FAIL because Netflix remains planned and schedules are not grouped.

- [ ] **Step 3: Extend the source catalog and registry**

Add `scheduleGroup` to every catalog entry through the `source()` helper, defaulting to `daily` for planned sources. Configure TVmaze, TMDb, Youku and iQIYI as `hourly`; configure Netflix as:

```ts
source(
  "netflix",
  "Netflix",
  "官方全球周榜与观看次数",
  "international_platform",
  "active",
  "inherit",
  true,
  true,
  "https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx",
  [],
  "daily"
)
```

Register `netflixTop10Adapter` and change `getEnabledAdapters(scheduleGroup?)` to filter via `getSourceDefinition(sourceId).scheduleGroup` when a group is provided.

- [ ] **Step 4: Split scheduler groups**

Keep hourly cron at `0 * * * *`. Add daily cron at `15 9 * * *` with `{ timezone: "Asia/Shanghai" }`. Each callback loops only its group. `runInitialSync()` remains all enabled adapters.

- [ ] **Step 5: Add manual command and example settings**

Create `syncNetflix.ts` matching the four existing scripts: load runtime settings, run `runSourceSync(db, netflixTop10Adapter)`, print only source/status/itemCount/duration, and disconnect Prisma in `finally`.

Add:

```json
"sync:netflix": "tsx src/scripts/syncNetflix.ts"
```

and to `.env.example`:

```dotenv
SOURCE_NETFLIX_BASE_URL="https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx"
SOURCE_NETFLIX_ENABLED=true
SOURCE_NETFLIX_PROXY_MODE=inherit
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test --workspace backend -- sourceCatalog.test.ts scheduler.test.ts
npm run typecheck --workspace backend
```

```bash
git add backend/src/settings/sourceCatalog.ts backend/src/adapters/adapterRegistry.ts backend/src/scheduler.ts backend/src/scripts/syncNetflix.ts backend/package.json backend/.env.example backend/tests/sourceCatalog.test.ts backend/tests/scheduler.test.ts
git commit -m "feat: 启用 Netflix 每日榜单同步"
```

---

### Task 8: Database Migration, Live Verification And Documentation

**Files:**
- Modify, ignored: `backend/.env`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-06-21-popularity-history-netflix-design.md` only if an explicitly accepted implementation difference exists

**Interfaces:**
- Consumes all earlier tasks
- Produces a verified development database, live Netflix data, browser-checked UI and runtime documentation

- [ ] **Step 1: Apply the additive schema to the development database**

The schema change only adds nullable/defaulted columns, indexes and a nullable relation. Run without printing `DATABASE_URL`:

```bash
npm run prisma:push --workspace backend
```

Then run the test-database preparation script and confirm both databases report in sync.

- [ ] **Step 2: Run full automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run real Netflix sync twice**

Run `npm run sync:netflix --workspace backend` twice with at least two seconds between starts. Record only status, item count and duration. Query the database through a short script and prove:

- Netflix has 40 current rows for the latest four Top 10 categories
- the second same-week sync did not increase the Netflix snapshot count
- no duplicate current identity exists
- Netflix source run is success or warning, never fake success after parser failure

- [ ] **Step 4: Verify movement with controlled test data**

Use the test database, not the development database, to write rank 12 then rank 7 on consecutive timestamps. Verify `rankDelta=5`, one current row, one historical row, one `heat_rising` event, trending rising filter and history API order.

- [ ] **Step 5: Browser verification**

With frontend `19992` and backend `19993`, inspect `/trending`, `/media/:id`, and `/settings` at 1440x900 and 390x844. Confirm no page-level horizontal overflow, filter URL persistence, current-only rows, timeline readability, Netflix active status, disabled controls for non-active sources, and no sensitive plaintext in DOM values.

- [ ] **Step 6: Update README**

Document:

- append-only 90-day popularity history
- positive/negative rank-delta semantics
- movement filters and history endpoint
- Netflix official weekly source and daily check schedule
- source-specific ranking disclaimer
- manual `sync:netflix` command

- [ ] **Step 7: Final safety audit and commit**

Confirm `git status --ignored` shows `backend/.env` ignored and no downloaded XLSX under the repository. Search tracked changes for proxy URLs, API keys and the Tavily key prefix without printing matches from ignored files.

```bash
git add README.md docs/superpowers/specs/2026-06-21-popularity-history-netflix-design.md
git commit -m "docs: 更新热度历史与 Netflix 运行说明"
```

---

## Completion Gate

Before marking this plan complete, prove every item from current state:

- Historical popularity snapshots survive later syncs.
- Every identity has exactly one current row.
- Same-period Netflix retries are idempotent.
- Rank delta direction and movement labels match the approved semantics.
- One snapshot creates no more than one event.
- Heat score uses all current sources and is not overwritten by sync order.
- Retention removes only old non-current rows.
- Trending and media detail APIs never return unbounded history by default.
- Trending filters and detail timelines work on desktop and mobile.
- Netflix parses the official latest week into four source-specific Top 10 lists.
- Netflix uses unified proxy, timeout and 2-second rate limiting.
- Netflix is active and daily; planned/commercial sources remain non-syncable.
- Full tests, typecheck, build, real sync, live APIs and browser checks pass.
- No credential, proxy value or downloaded source file is tracked by Git.
