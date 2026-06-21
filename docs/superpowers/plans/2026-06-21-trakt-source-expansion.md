# WhatsNew Trakt 来源扩展实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不依赖 Trakt 用户 OAuth 的前提下，接入电影与剧集趋势榜、期待榜和未来 14 天公开日历，并让同一来源按小时与每日任务独立运行。

**Architecture:** 先把适配器返回值扩展为带完整榜单口径、删除来源条目和“只更新、不新建”语义的批次，再把注册表改成“来源 + 任务组 + 适配器”。Trakt 客户端复用 `SourceHttpClient` 的代理与脱敏能力，并用服务独立 `RateLimiter` 串行控制请求开始时间；两个 Trakt 适配器共享统一 DTO 和现有归并服务。

**Tech Stack:** TypeScript, Express 5, Prisma 5/MySQL, React 18, TanStack Query, Vitest, Testing Library, Undici, node-cron.

## Global Constraints

- JavaScript 和 TypeScript 不使用分号，使用 2 空格缩进。
- Trakt 连续请求的开始时间间隔不低于 2 秒。
- Trakt 公开接口只使用 `TRAKT_CLIENT_ID`，不要求 `TRAKT_CLIENT_SECRET`、`TRAKT_ACCESS_TOKEN` 或用户 OAuth。
- `trakt_trending` 的原始值是 `watchers`，`trakt_anticipated` 的原始值是 `list_count`，两者不得合成一个数值。
- Trakt 是数据来源，不是播放平台；日历中的未知平台写入 `Unspecified`，UI 显示“平台未提供”。
- 凭据、代理、响应正文和本地 `.env` 值不得进入日志、fixture、commit 或 API 响应。
- 优酷和爱奇艺保持用户当前关闭状态，本计划不得改写其开关。
- 前端保持 `19992`，后端保持 `19993`。
- 所有行为变更先写失败测试，再写最小实现；每个任务验证后独立提交中文 commit。

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `backend/prisma/schema.prisma` | Modify | 单集标题、同步能力范围、来源条目有效状态 |
| `backend/src/domain/types.ts` | Modify | 适配器批次、停用条目、完整榜单口径与只更新语义 |
| `backend/src/domain/matcher.ts` | Modify | 使用 TheTVDB ID 参与精确归并 |
| `backend/src/services/sourceSyncService.ts` | Modify | 归一化批次、元数据补全、来源停用与完整空榜处理 |
| `backend/src/settings/sourceCatalog.ts` | Modify | 多任务组、默认开关和 Trakt 激活 |
| `backend/src/settings/runtimeSettingsService.ts` | Modify | 区分用户开关与凭据完整后的可运行状态 |
| `backend/src/adapters/adapterRegistry.ts` | Modify | 注册同一来源的多个能力适配器 |
| `backend/src/scheduler.ts` | Modify | 按任务组运行能力适配器 |
| `backend/src/clients/traktClient.ts` | Create | Trakt 请求头、动态设置、代理、限流与错误 |
| `backend/src/adapters/traktAdapter.ts` | Replace | 趋势、期待与日历 DTO 映射 |
| `backend/src/scripts/syncTrakt.ts` | Create | 本地手动运行全部 Trakt 能力 |
| `backend/src/routes/sources.ts` | Modify | 手动同步返回多个能力的独立结果 |
| `shared/src/settings.ts` | Modify | 暴露 `runnable` 与缺失凭据名称 |
| `frontend/src/api/types.ts` | Modify | 单集标题和多能力同步响应类型 |
| `frontend/src/pages/SettingsPage.tsx` | Modify | 凭据门控、同步状态与按钮文案 |
| `frontend/src/pages/TrendingPage.tsx` | Modify | Trakt 两类榜单筛选和数值口径 |
| `frontend/src/pages/CalendarPage.tsx` | Modify | 平台未提供、季集号与单集标题 |
| `frontend/src/pages/MediaDetailPage.tsx` | Modify | 发行来源、平台语义和 Trakt 信号名称 |
| `frontend/src/utils/sourceLabel.ts` | Modify | Trakt 来源显示名称 |
| `backend/.env.example` | Modify | Trakt 开关与配置样例 |
| `README.md` | Modify | Trakt 数据口径、调度与凭据说明 |

---

### Task 1: 扩展适配器批次与持久化契约

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/domain/types.ts`
- Modify: `backend/src/domain/matcher.ts`
- Modify: `backend/src/services/sourceSyncService.ts`
- Modify: `backend/tests/domain.test.ts`
- Modify: `backend/tests/sync.test.ts`

**Interfaces:**
- Produces: `SourceFetchResult`, `SourceFetchBatch`, `SourceRefRetirement`
- Produces: `AdapterItem.createIfMissing?: boolean`
- Produces schema fields: `Release.episodeTitle`, `SourceSyncRun.scope`, `MediaSourceRef.isActive`
- Consumes: existing `AdapterItem[]` adapters without requiring immediate rewrites

- [ ] **Step 1: Write failing matcher and sync tests**

Add a matcher assertion proving an exact `tvdbId` with the same media type wins. Add these database cases to `backend/tests/sync.test.ts`:

```ts
it("persists episode titles and sync scope", async () => {
  const adapter: SourceAdapter = {
    source: "trakt",
    scope: "calendar",
    async fetchItems() {
      const [base] = await demoSeedAdapter.fetchItems()
      return [{
        ...base,
        releases: [{
          ...base.releases[0],
          source: "trakt",
          episodeTitle: "新的开始"
        }]
      }]
    }
  }

  const run = await runSourceSync(prisma, adapter)
  expect(run.scope).toBe("calendar")
  expect((await prisma.release.findFirstOrThrow()).episodeTitle).toBe("新的开始")
})

it("deactivates an explicitly complete empty popularity snapshot", async () => {
  await runSourceSync(prisma, adapterWithRank(2))
  await runSourceSync(prisma, {
    source: "history_test",
    scope: "popularity",
    async fetchItems() {
      return { items: [], completePopularitySources: ["history_test_rank"] }
    }
  })

  expect(await prisma.popularitySignal.count({ where: { isCurrent: true } })).toBe(0)
  expect((await prisma.mediaItem.findFirstOrThrow()).heatScore).toBe(0)
})

it("retires a deleted source ref without deleting the media item", async () => {
  await runSourceSync(prisma, adapterWithoutSignals())
  await runSourceSync(prisma, {
    source: "metadata_only",
    scope: "updates",
    async fetchItems() {
      return {
        items: [],
        retiredSourceRefs: [{ source: "metadata_only", sourceId: "demo-movie-1" }]
      }
    }
  })

  expect((await prisma.mediaSourceRef.findFirstOrThrow()).isActive).toBe(false)
  expect(await prisma.mediaItem.count()).toBe(1)
})

it("does not create an unmatched enrichment-only item", async () => {
  const [base] = await demoSeedAdapter.fetchItems()
  await runSourceSync(prisma, {
    source: "metadata_only",
    scope: "updates",
    async fetchItems() {
      return [{ ...base, media: { ...base.media, sourceId: "old-record" }, createIfMissing: false }]
    }
  })

  expect(await prisma.mediaItem.count()).toBe(0)
})
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test --workspace backend -- domain.test.ts sync.test.ts
```

Expected: FAIL because the new fields and batch return type do not exist.

- [ ] **Step 3: Add the additive Prisma fields and domain types**

Add these fields and indexes to their existing Prisma models:

```prisma
model MediaSourceRef {
  isActive Boolean @default(true)

  @@index([source, isActive])
}

model Release {
  episodeTitle String?
}

model SourceSyncRun {
  scope String @default("all")

  @@index([source, scope])
}
```

Extend `backend/src/domain/types.ts` with these exact contracts:

```ts
export interface ReleaseInput {
  episodeTitle?: string | null
}

export interface AdapterItem {
  media: NormalizedMediaInput
  releases: ReleaseInput[]
  popularitySignals: PopularitySignalInput[]
  createIfMissing?: boolean
}

export interface SourceRefRetirement {
  source: string
  sourceId: string
}

export interface SourceFetchBatch {
  items: AdapterItem[]
  retiredSourceRefs?: SourceRefRetirement[]
  completePopularitySources?: string[]
}

export type SourceFetchResult = AdapterItem[] | SourceFetchBatch

export interface SourceAdapter<Result extends SourceFetchResult = AdapterItem[]> {
  source: string
  scope?: string
  fetchItems(): Promise<Result>
}
```

Change `runSourceSync()` and registry-held adapters to accept `SourceAdapter<SourceFetchResult>`. The default generic keeps existing `SourceAdapter` declarations and direct array destructuring unchanged.

Add `tvdbId: number | null` to `ExistingMediaCandidate`, then add this exact-ID branch in `findBestMatch()`:

```ts
(input.tvdbId != null && candidate.tvdbId === input.tvdbId && sameMediaType)
```

- [ ] **Step 4: Normalize batches and persist the new semantics**

Add this helper in `sourceSyncService.ts`:

```ts
function normalizeFetchResult(result: SourceFetchResult): Required<SourceFetchBatch> {
  if (Array.isArray(result)) {
    return { items: result, retiredSourceRefs: [], completePopularitySources: [] }
  }

  return {
    items: result.items,
    retiredSourceRefs: result.retiredSourceRefs ?? [],
    completePopularitySources: result.completePopularitySources ?? []
  }
}
```

Change `upsertItem()` to return `null` before creation when no source-ref or matcher result exists and `createIfMissing === false`. Existing matched rows must fill only missing metadata and external IDs, while aliases, genres and countries are set unions:

```ts
if (!match && item.createIfMissing === false) return null

const mediaItem = match
  ? await prisma.mediaItem.update({
      where: { id: match.id },
      data: {
        titleAliases: toJsonArray(titleAliases),
        overview: match.overview ?? item.media.overview,
        posterUrl: match.posterUrl ?? item.media.posterUrl,
        productionCountries: toJsonArray(uniqueValues([
          ...parseJsonArray(match.productionCountries),
          ...item.media.productionCountries
        ])),
        genres: toJsonArray(uniqueValues([
          ...parseJsonArray(match.genres),
          ...item.media.genres
        ])),
        firstReleaseDate: match.firstReleaseDate ?? item.media.firstReleaseDate,
        originalLanguage: match.originalLanguage ?? item.media.originalLanguage,
        tmdbId: match.tmdbId ?? item.media.tmdbId,
        tvmazeId: match.tvmazeId ?? item.media.tvmazeId,
        imdbId: match.imdbId ?? item.media.imdbId,
        traktId: match.traktId ?? item.media.traktId,
        tvdbId: match.tvdbId ?? item.media.tvdbId
      }
    })
  : await prisma.mediaItem.create({
      data: {
        mediaType: item.media.mediaType,
        releaseForm: item.media.releaseForm,
        sourceContentType: item.media.sourceContentType,
        titleDisplay: item.media.titleDisplay,
        titleOriginal: item.media.titleOriginal,
        titleAliases: toJsonArray(titleAliases),
        overview: item.media.overview,
        posterUrl: item.media.posterUrl,
        productionCountries: toJsonArray(item.media.productionCountries),
        originalLanguage: item.media.originalLanguage,
        genres: toJsonArray(item.media.genres),
        firstReleaseDate: item.media.firstReleaseDate,
        status: item.media.status ?? "unknown",
        heatScore: 0,
        tmdbId: item.media.tmdbId,
        tvmazeId: item.media.tvmazeId,
        imdbId: item.media.imdbId,
        traktId: item.media.traktId,
        tvdbId: item.media.tvdbId
      }
    })
```

Extend `ExistingMediaCandidate` and the candidate query with these exact fields:

```ts
overview: string | null
posterUrl: string | null
productionCountries: string
genres: string
status: string
tvdbId: number | null
```

On every source-ref upsert set `isActive: true`. Write `episodeTitle: release.episodeTitle ?? null` with each release.

In `runSourceSync()`:

```ts
const batch = normalizeFetchResult(await adapter.fetchItems())
const { items, retiredSourceRefs, completePopularitySources } = batch

await prisma.mediaSourceRef.updateMany({
  where: {
    OR: retiredSourceRefs.map(({ source, sourceId }) => ({ source, sourceId }))
  },
  data: { isActive: false }
})

const signalSources = uniqueValues([
  ...completePopularitySources,
  ...items.flatMap((item) => item.popularitySignals.map((signal) => signal.source))
])
```

Do not call `updateMany` when `retiredSourceRefs` is empty. Create the run with `scope: adapter.scope ?? "all"`, skip `null` upsert results, and retain existing failure/redaction behavior.

- [ ] **Step 5: Generate Prisma client and verify GREEN**

Run:

```bash
npm run prisma:generate --workspace backend
npm test --workspace backend -- domain.test.ts sync.test.ts
npm run typecheck --workspace backend
```

Expected: all commands exit 0; the test bootstrap reports the `whatsnew_test` schema is in sync.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/domain/types.ts backend/src/domain/matcher.ts backend/src/services/sourceSyncService.ts backend/tests/domain.test.ts backend/tests/sync.test.ts
git commit -m "feat: 扩展来源同步批次契约"
```

---

### Task 2: 增加凭据门控与多任务组注册表

**Files:**
- Modify: `backend/src/settings/sourceCatalog.ts`
- Modify: `backend/src/settings/runtimeSettingsService.ts`
- Modify: `backend/src/adapters/adapterRegistry.ts`
- Modify: `backend/src/scheduler.ts`
- Modify: `backend/src/routes/settings.ts`
- Modify: `shared/src/settings.ts`
- Modify: `backend/tests/sourceCatalog.test.ts`
- Modify: `backend/tests/runtimeSettings.test.ts`
- Modify: `backend/tests/scheduler.test.ts`
- Modify: `backend/tests/settingsApi.test.ts`

**Interfaces:**
- Produces: `ScheduleGroup = "hourly" | "daily"`
- Produces: `RuntimeSettingsService.sourceRunnable(sourceId)` and `missingCredentials(sourceId)`
- Produces: `RegisteredAdapter`, `getEnabledAdapters(group)`, `getEnabledAdaptersForSource(sourceId)`
- Consumes: existing source user switches without changing their stored values

- [ ] **Step 1: Write failing settings and registry tests**

Add these expectations:

```ts
it("keeps the user switch separate from credential readiness", async () => {
  const settings = await fixtureSettings("SOURCE_TMDB_ENABLED=true\nTMDB_API_KEY=\n")
  expect(settings.sourceEnabled("tmdb")).toBe(true)
  expect(settings.sourceRunnable("tmdb")).toBe(false)
  expect(settings.missingCredentials("tmdb")).toEqual(["TMDB_API_KEY"])
})
```

Update settings API tests to require:

```ts
expect(tmdb).toMatchObject({
  enabled: true,
  runnable: false,
  credentialsComplete: false,
  missingCredentials: ["TMDB_API_KEY"]
})
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test --workspace backend -- sourceCatalog.test.ts runtimeSettings.test.ts scheduler.test.ts settingsApi.test.ts
```

Expected: FAIL because multiple task groups and runnable state are not implemented.

- [ ] **Step 3: Extend source definitions without activating Trakt yet**

Define `ScheduleGroup`, add `defaultEnabled`, and replace the single `scheduleGroup` field with `scheduleGroups` in the existing `SourceDefinition`:

```ts
export type ScheduleGroup = "hourly" | "daily"

defaultEnabled: boolean
scheduleGroups: readonly ScheduleGroup[]
```

Existing hourly sources receive `scheduleGroups: ["hourly"]`, Netflix receives `["daily"]`, and all planned/commercial sources keep `["daily"]` plus `defaultEnabled: false`. Existing active sources keep `defaultEnabled: true`; do not alter values already stored in `.env`.

- [ ] **Step 4: Implement switch and credential separation**

Add to `RuntimeSettingsService`:

```ts
sourceEnabled(sourceId: string): boolean {
  const definition = getSourceDefinition(sourceId)
  if (definition.implementationStatus !== "active" || !definition.supportsEnable) return false
  return this.getBoolean(
    sourceEnvKey(sourceId, "ENABLED"),
    definition.defaultEnabled
  )
}

missingCredentials(sourceId: string): string[] {
  return getSourceDefinition(sourceId).credentialKeys.filter((key) => !this.get(key).trim())
}

sourceRunnable(sourceId: string): boolean {
  const definition = getSourceDefinition(sourceId)
  return this.sourceEnabled(sourceId)
    && definition.supportsSync
    && this.missingCredentials(sourceId).length === 0
}
```

Add to `SourceSettingsView`:

```ts
runnable: boolean
missingCredentials: string[]
```

Return both fields from `GET /api/settings`. Keep `enabled` as the user's switch state; never silently change it because a credential is missing.

- [ ] **Step 5: Implement the multi-adapter registry**

Use this exact public shape:

```ts
export type RegisteredAdapter = {
  sourceId: string
  scheduleGroup: ScheduleGroup
  adapter: SourceAdapter<SourceFetchResult>
}

export const registeredAdapters: RegisteredAdapter[] = [
  { sourceId: "tvmaze", scheduleGroup: "hourly", adapter: tvmazeAdapter },
  { sourceId: "tmdb", scheduleGroup: "hourly", adapter: tmdbAdapter },
  { sourceId: "netflix", scheduleGroup: "daily", adapter: netflixTop10Adapter },
  { sourceId: "youku", scheduleGroup: "hourly", adapter: youkuAdapter },
  { sourceId: "iqiyi", scheduleGroup: "hourly", adapter: iqiyiAdapter }
]

export function getEnabledAdapters(scheduleGroup?: ScheduleGroup): RegisteredAdapter[] {
  return registeredAdapters.filter((entry) => {
    return runtimeSettings.sourceRunnable(entry.sourceId)
      && (!scheduleGroup || entry.scheduleGroup === scheduleGroup)
  })
}

export function getEnabledAdaptersForSource(sourceId: string): RegisteredAdapter[] {
  if (!runtimeSettings.sourceRunnable(sourceId)) return []
  return registeredAdapters.filter((entry) => entry.sourceId === sourceId)
}
```

Keep a `getImplementedAdaptersForSource(sourceId)` function for the route to distinguish `source_not_implemented` from disabled or missing credentials.

Update scheduler loops to call `runSourceSync(db, entry.adapter)`. Initial sync runs all enabled entries once. The daily cron remains `15 9 * * *` in `Asia/Shanghai`; the hourly cron remains `0 * * * *`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm run build --workspace shared
npm test --workspace backend -- sourceCatalog.test.ts runtimeSettings.test.ts scheduler.test.ts settingsApi.test.ts
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/settings/sourceCatalog.ts backend/src/settings/runtimeSettingsService.ts backend/src/adapters/adapterRegistry.ts backend/src/scheduler.ts backend/src/routes/settings.ts shared/src/settings.ts backend/tests/sourceCatalog.test.ts backend/tests/runtimeSettings.test.ts backend/tests/scheduler.test.ts backend/tests/settingsApi.test.ts
git commit -m "feat: 添加来源凭据门控与分组调度"
```

---

### Task 3: 实现 Trakt 客户端、榜单与日历适配器

**Files:**
- Create: `backend/src/clients/traktClient.ts`
- Replace: `backend/src/adapters/traktAdapter.ts`
- Modify: `backend/src/adapters/adapterRegistry.ts`
- Modify: `backend/src/settings/sourceCatalog.ts`
- Create: `backend/src/scripts/syncTrakt.ts`
- Modify: `backend/package.json`
- Create: `backend/tests/traktClient.test.ts`
- Create: `backend/tests/traktAdapter.test.ts`
- Modify: `backend/tests/sourceCatalog.test.ts`

**Interfaces:**
- Produces: `TraktClient.get<T>(path)`
- Produces: `createTraktPopularityAdapter()`, `createTraktCalendarAdapter()`
- Produces adapters with scopes `popularity` and `calendar`
- Consumes: Task 1 `SourceFetchBatch` and Task 2 `RegisteredAdapter`

- [ ] **Step 1: Write failing client tests**

Use a fake `SourceHttpClient` and a 5 ms test interval:

```ts
it("uses only the public client ID header and spaces request starts", async () => {
  const starts: number[] = []
  const fetchJson = vi.fn(async (_sourceId, _url, options) => {
    starts.push(Date.now())
    expect(options.headers).toEqual({
      "trakt-api-key": "client-id",
      "trakt-api-version": "2"
    })
    expect(JSON.stringify(options.headers)).not.toContain("secret")
    expect(JSON.stringify(options.headers)).not.toContain("Bearer")
    return { ok: true }
  })
  const client = createTraktClient({
    clientId: "client-id",
    minIntervalMs: 5,
    httpClient: { fetchJson } as unknown as SourceHttpClient
  })

  await Promise.all([client.get("/movies/trending"), client.get("/shows/trending")])
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(5)
})
```

Also test that an empty runtime Client ID throws `Trakt 凭据未配置`, the base URL is trimmed once, and proxy settings are captured at request time.

- [ ] **Step 2: Write failing adapter fixture tests**

Define fixtures containing one movie and one show for each response shape. Assert exact DTO fields:

```ts
expect(movie.media).toMatchObject({
  source: "trakt",
  sourceId: "trakt:movie:101",
  mediaType: "movie",
  titleDisplay: "示例电影",
  imdbId: "tt0000101",
  tmdbId: 201,
  traktId: 101,
  tvdbId: null
})
expect(movie.popularitySignals).toEqual(expect.arrayContaining([
  expect.objectContaining({
    source: "trakt_trending",
    window: "current",
    rank: 1,
    value: 321,
    valueLabel: "321 watchers"
  }),
  expect.objectContaining({
    source: "trakt_anticipated",
    window: "upcoming",
    rank: 1,
    value: 88,
    valueLabel: "88 list_count"
  })
]))
```

For a show calendar row assert:

```ts
expect(show.releases[0]).toMatchObject({
  platform: "Unspecified",
  source: "trakt",
  releaseDate: "2026-06-25",
  seasonNumber: 2,
  episodeNumber: 3,
  episodeTitle: "新的开始"
})
```

Also assert both calendar calls use the same injected `today` value and a 14-day window, and an all-empty successful popularity fetch returns `completePopularitySources: ["trakt_trending", "trakt_anticipated"]`.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npm test --workspace backend -- traktClient.test.ts traktAdapter.test.ts
```

Expected: FAIL because the client and real adapters do not exist.

- [ ] **Step 4: Implement the Trakt client**

Create `backend/src/clients/traktClient.ts` with this public factory:

```ts
type TraktClientOptions = {
  clientId?: string
  baseUrl?: string
  minIntervalMs?: number
  timeoutMs?: number
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

export type TraktClient = {
  get<T>(path: string): Promise<T>
}

export function createTraktClient(options: TraktClientOptions = {}): TraktClient {
  const settings = options.settings ?? runtimeSettings
  const httpClient = options.httpClient ?? sourceHttpClient
  const limiter = new RateLimiter(options.minIntervalMs ?? 2000)

  return {
    async get<T>(path: string): Promise<T> {
      const current = settings.view()
      const clientId = options.clientId ?? current.get("TRAKT_CLIENT_ID")
      if (!clientId) throw new Error("Trakt 凭据未配置")
      const baseUrl = (options.baseUrl ?? current.get("TRAKT_BASE_URL") || "https://api.trakt.tv")
        .replace(/\/$/, "")
      const settingsOverride = captureSourceProxySettings(current, "trakt")

      return limiter.run(() => httpClient.fetchJson<T>("trakt", `${baseUrl}${path}`, {
        headers: {
          "trakt-api-key": clientId,
          "trakt-api-version": "2"
        },
        timeoutMs: options.timeoutMs ?? 30000,
        settingsOverride
      }))
    }
  }
}
```

Do not read `TRAKT_CLIENT_SECRET`, `TRAKT_ACCESS_TOKEN` or `TRAKT_REDIRECT_URI` anywhere in this client.

- [ ] **Step 5: Implement normalized Trakt mapping**

In `traktAdapter.ts`, define typed response records for `ids`, movie, show, episode, trending, anticipated and calendar rows. Use these exact adapter factories:

```ts
type TraktAdapterOptions = {
  client?: TraktClient
  today?: () => string
}

export function createTraktPopularityAdapter(options: TraktAdapterOptions = {}): SourceAdapter<SourceFetchBatch>
export function createTraktCalendarAdapter(options: TraktAdapterOptions = {}): SourceAdapter

export const traktPopularityAdapter = createTraktPopularityAdapter()
export const traktCalendarAdapter = createTraktCalendarAdapter()
```

The popularity adapter uses `Promise.all()` for the four logical calls; `TraktClient` still serializes their starts through its limiter. Merge by `movie:<traktId>` or `show:<traktId>`, then attach separate signals with ranks based on array order.

The calendar adapter calls:

```ts
client.get(`/calendars/all/movies/${today}/14`)
client.get(`/calendars/all/shows/${today}/14`)
```

Normalize show `first_aired` timestamps with `.slice(0, 10)`. For movies, copy `released` to both the release and `media.firstReleaseDate`. For shows, set `media.firstReleaseDate` only when the row is season 1 episode 1; otherwise leave it null rather than pretending an episode date is the series premiere.

Group repeated calendar rows by Trakt movie/show ID before returning them. Append unique releases by `releaseDate + seasonNumber + episodeNumber`; never return one AdapterItem per episode because the sync service replaces releases per source for each item.

Use these stable source URLs:

```ts
function movieUrl(slug: string): string {
  return `https://trakt.tv/movies/${slug}`
}

function showUrl(slug: string): string {
  return `https://trakt.tv/shows/${slug}`
}
```

Never infer a streaming platform. Set calendar release fields to `platform: "Unspecified"`, `region: "GLOBAL"`, `releasePattern: "calendar_release"` for movies and `"episode_release"` for shows.

- [ ] **Step 6: Activate and register Trakt**

Set the Trakt source definition to:

```ts
implementationStatus: "active"
supportsSync: true
supportsEnable: true
defaultEnabled: true
scheduleGroups: ["hourly", "daily"]
credentialKeys: ["TRAKT_CLIENT_ID"]
```

Register:

```ts
{ sourceId: "trakt", scheduleGroup: "hourly", adapter: traktPopularityAdapter },
{ sourceId: "trakt", scheduleGroup: "daily", adapter: traktCalendarAdapter }
```

Create `syncTrakt.ts` to load runtime settings, obtain both enabled Trakt entries, run them sequentially, print only scope/status/item count, and exit non-zero if no entry is runnable or any run fails. Add `"sync:trakt": "tsx src/scripts/syncTrakt.ts"` to backend scripts.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
npm test --workspace backend -- traktClient.test.ts traktAdapter.test.ts sourceCatalog.test.ts scheduler.test.ts
npm run typecheck --workspace backend
```

Expected: all commands exit 0 and no output contains fixture credentials.

- [ ] **Step 8: Commit**

```bash
git add backend/src/clients/traktClient.ts backend/src/adapters/traktAdapter.ts backend/src/adapters/adapterRegistry.ts backend/src/settings/sourceCatalog.ts backend/src/scripts/syncTrakt.ts backend/package.json backend/tests/traktClient.test.ts backend/tests/traktAdapter.test.ts backend/tests/sourceCatalog.test.ts backend/tests/scheduler.test.ts
git commit -m "feat: 接入 Trakt 热度与播出日历"
```

---

### Task 4: 完成手动同步 API 与前端来源语义

**Files:**
- Modify: `backend/src/routes/sources.ts`
- Modify: `backend/tests/api.test.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/pages/TrendingPage.tsx`
- Modify: `frontend/src/pages/CalendarPage.tsx`
- Modify: `frontend/src/pages/MediaDetailPage.tsx`
- Modify: `frontend/src/utils/sourceLabel.ts`
- Modify: `frontend/tests/pages.test.tsx`
- Modify: `frontend/tests/settingsPage.test.tsx`
- Modify: `backend/.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces: `POST /api/sources/trakt/sync -> { items: SourceSyncRun[] }`
- Consumes: `SourceSettingsView.runnable`, `missingCredentials`, `ReleaseRow.episodeTitle`

- [ ] **Step 1: Write failing API and UI tests**

Backend API assertions:

```ts
expect(response.body.items.map((run: { scope: string }) => run.scope)).toEqual([
  "popularity",
  "calendar"
])
```

Settings UI assertions:

```ts
expect(screen.getByText("缺少 TRAKT_CLIENT_ID")).toBeInTheDocument()
expect(screen.getByRole("button", { name: "同步 Trakt" })).toBeDisabled()
```

Trending and calendar assertions:

```ts
expect(screen.getByRole("option", { name: "Trakt 趋势榜" })).toBeInTheDocument()
expect(screen.getByRole("option", { name: "Trakt 期待榜" })).toBeInTheDocument()
expect(screen.getByText("平台未提供 · GLOBAL")).toBeInTheDocument()
expect(screen.getByText("S2 E3 · 新的开始")).toBeInTheDocument()
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test --workspace backend -- api.test.ts settingsApi.test.ts
npm test --workspace frontend -- pages.test.tsx settingsPage.test.tsx
```

Expected: FAIL because the route still returns one run and the UI lacks the new semantics.

- [ ] **Step 3: Return per-capability manual sync results**

In `POST /api/sources/:source/sync`:

1. Use `getImplementedAdaptersForSource()` for 404 detection.
2. Return `409 { error: "source_disabled" }` when the user switch is off.
3. Return `409 { error: "credential_missing", missingCredentials }` when credentials are incomplete.
4. Run each enabled entry sequentially and return `{ items: runs }`.

Do not stop after a run with `status="failed"`; return both capability results so the UI can show partial outcomes.

- [ ] **Step 4: Render exact source semantics**

Add `episodeTitle: string | null` and `scope: string` to frontend API types. Add source filter options:

```ts
["trakt_trending", "Trakt 趋势榜"],
["trakt_anticipated", "Trakt 期待榜"]
```

Add `Trakt` to platform options. In calendar and detail views use:

```ts
const platformLabel = release.platform === "Unspecified"
  ? "平台未提供"
  : release.platform

const episodeLabel = release.seasonNumber != null && release.episodeNumber != null
  ? `S${release.seasonNumber} E${release.episodeNumber}${release.episodeTitle ? ` · ${release.episodeTitle}` : ""}`
  : null
```

Show `sourceLabel(release.source)` beside every detail release. Map `trakt`, `trakt_trending` and `trakt_anticipated` to Chinese-readable labels without changing stored source IDs.

In settings, compute sync eligibility from `source.runnable`. When credentials are incomplete, render `缺少 ${source.missingCredentials.join("、")}` and keep the source's user switch unchanged.

- [ ] **Step 5: Document configuration and keep local switches intact**

Add to `.env.example`:

```dotenv
TRAKT_CLIENT_ID=""
TRAKT_BASE_URL="https://api.trakt.tv"
SOURCE_TRAKT_ENABLED=true
SOURCE_TRAKT_PROXY_MODE=inherit
```

README must state:

- Trakt public sync needs only Client ID
- hourly scope: trends and anticipated
- daily scope: 14-day movie/show calendar
- `watchers` and `list_count` are separate source-specific signals
- Trakt calendar does not prove streaming availability

Do not edit the existing local `SOURCE_YOUKU_ENABLED` or `SOURCE_IQIYI_ENABLED` lines.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
npm test --workspace backend -- api.test.ts settingsApi.test.ts
npm test --workspace frontend -- pages.test.tsx settingsPage.test.tsx
npm run typecheck
npm run build
```

Expected: all commands exit 0.

Commit:

```bash
git add backend/src/routes/sources.ts backend/tests/api.test.ts frontend/src/api/types.ts frontend/src/pages/SettingsPage.tsx frontend/src/pages/TrendingPage.tsx frontend/src/pages/CalendarPage.tsx frontend/src/pages/MediaDetailPage.tsx frontend/src/utils/sourceLabel.ts frontend/tests/pages.test.tsx frontend/tests/settingsPage.test.tsx backend/.env.example README.md
git commit -m "feat: 展示 Trakt 来源与同步状态"
```

---

### Task 5: 安全复制本地凭据并完成真实链路验证

**Files:**
- Local only: `backend/.env`
- Verify only: MySQL development database
- Verify only: running frontend and backend

**Interfaces:**
- Consumes: PixelReel local `TRAKT_CLIENT_ID`
- Produces: real Trakt rows and current popularity snapshots in WhatsNew

- [ ] **Step 1: Confirm the worktree is clean before touching local secrets**

Run:

```bash
git status --short
git check-ignore backend/.env
```

Expected: no tracked changes and `backend/.env` is ignored.

- [ ] **Step 2: Copy only the Client ID without printing it**

Use a local script that parses PixelReel's `.env`, sends only `TRAKT_CLIENT_ID` to the already-running WhatsNew settings API, and prints only the HTTP status. The script must fail if the source value is empty and must not read or copy Client Secret, Access Token or Redirect URI.

Afterward call `GET /api/settings` and assert only:

```json
{
  "id": "trakt",
  "credentialsComplete": true,
  "runnable": true
}
```

Never print the field's `maskedValue` during this verification.

- [ ] **Step 3: Apply the additive schema to the development database**

Confirm the redacted database target is the intended WhatsNew development database, then run:

```bash
npm run prisma:push --workspace backend
```

Expected: Prisma reports the schema is in sync. Do not use `--force-reset` or any destructive reset option.

- [ ] **Step 4: Run a real connection test and manual sync**

Run the source connection test, then `POST /api/sources/trakt/sync`. Expected:

- HTTP 200
- two runs with scopes `popularity` and `calendar`
- both statuses are `success` or an explicitly reviewed `warning`
- item counts are greater than zero
- wall time reflects the 2-second request spacing

- [ ] **Step 5: Verify data semantics in MySQL and API**

Query only non-secret fields and assert:

- current `trakt_trending` signals exist with `valueLabel` containing `watchers`
- current `trakt_anticipated` signals exist with `valueLabel` containing `list_count`
- Trakt movie and show source refs use stable IDs
- calendar releases use `platform="Unspecified"`
- show releases preserve season, episode and episode title
- no Trakt response created `TRAKT_ACCESS_TOKEN`

Run the same manual sync a second time. Expected: source refs and releases remain idempotent; current popularity identities remain one row each while history behavior follows the existing snapshot rules.

- [ ] **Step 6: Run the complete verification suite**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
git status --short
```

Expected: all commands exit 0 and the worktree remains clean because only ignored local settings and database rows changed.

- [ ] **Step 7: Verify the running UI in the in-app browser**

Open `http://127.0.0.1:19992/` and inspect desktop and mobile widths. Verify:

- settings shows Trakt active, enabled, credentials ready and two-scope sync result
- heat page exposes Trakt trends and anticipated filters
- calendar shows source Trakt and “平台未提供” without pretending Trakt is a streamer
- season, episode and episode title do not overlap at mobile width
- no credential or proxy value appears in DOM text, network response or error text

No commit is created for this task because it changes only ignored local credentials and runtime data.
