# WhatsNew TheTVDB 免费元数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只使用 TheTVDB 免费项目 API Key 接入电影与剧集每日增量元数据，并严格阻止老作品资料更新被误识别为新片。

**Architecture:** TheTVDB 客户端独立负责 v4 登录、内存 Token、401 单次刷新、动态代理和 2 秒限流；更新适配器读取最近 48 小时的 movie/series 更新流，去重后最多获取 40 个详情。适配器以 `createIfMissing` 区分近期发现与老作品补全，以 `retiredSourceRefs` 处理删除事件，不产生任何热度信号。

**Tech Stack:** TypeScript, Express 5, Prisma 5/MySQL, React 18, TanStack Query, Vitest, Testing Library, Undici, node-cron, TheTVDB v4 API.

## Global Constraints

- TheTVDB 必须使用免费项目 API Key；不购买个人订阅、不选择付费套餐、不绑定付款方式、不自动升级。
- 免费申请未通过、免费资格不满足或条款变化时，来源保持禁用，项目继续依赖 TVmaze、TMDb 和 Trakt。
- 提交免费申请属于持久外部操作；必须在用户看到最终申请字段并明确确认后才能点击提交。
- TheTVDB 连续请求的开始时间间隔不低于 2 秒，登录请求和数据请求共用同一个服务限流器。
- Bearer Token 只缓存在后端内存，不写 `.env`、数据库、日志或 API 响应。
- TheTVDB `score` 不得映射到 `heatScore`、`PopularitySignal.value` 或任何排名。
- TheTVDB 是元数据来源，不是播放平台；未知平台写入 `Unspecified`，UI 显示“平台未提供”。
- 凭据、代理、响应正文和本地 `.env` 值不得进入日志、fixture、commit 或 API 响应。
- 优酷和爱奇艺保持用户当前关闭状态。
- 前端保持 `19992`，后端保持 `19993`。
- 本计划依赖 `2026-06-21-trakt-source-expansion.md` Task 1 和 Task 2 的批次契约、只更新语义与分组调度。
- 所有行为变更先写失败测试，再写最小实现；每个任务验证后独立提交中文 commit。

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `backend/src/clients/theTvdbClient.ts` | Create | v4 登录、内存 Token、刷新、限流和请求 |
| `backend/src/adapters/theTvdbAdapter.ts` | Create | 48 小时更新流、分页、40 条详情上限、日期过滤与 DTO 映射 |
| `backend/src/settings/settingsFields.ts` | Modify | 可选 `THETVDB_PIN` 配置与脱敏 |
| `backend/src/settings/sourceCatalog.ts` | Modify | TheTVDB 免费来源激活、默认关闭与每日任务 |
| `backend/src/adapters/adapterRegistry.ts` | Modify | 注册 TheTVDB 每日更新适配器 |
| `backend/src/scripts/syncTheTvdb.ts` | Create | 本地手动运行 TheTVDB 更新 |
| `backend/package.json` | Modify | 增加手动同步脚本 |
| `backend/src/routes/media.ts` | Modify | 详情返回来源引用用于归属显示 |
| `shared/src/settings.ts` | Modify | 可选凭据字段继续保持结构化显示 |
| `frontend/src/api/types.ts` | Modify | 详情来源引用类型 |
| `frontend/src/pages/MediaDetailPage.tsx` | Modify | TheTVDB 归属和平台语义 |
| `frontend/src/utils/sourceLabel.ts` | Modify | TheTVDB 显示名称 |
| `backend/.env.example` | Modify | 免费 Key、可选 PIN、默认关闭样例 |
| `README.md` | Modify | 免费限定、归属、调度和失败回退说明 |

---

### Task 1: 实现 TheTVDB v4 客户端与内存 Token

**Files:**
- Create: `backend/src/clients/theTvdbClient.ts`
- Modify: `backend/src/settings/settingsFields.ts`
- Modify: `backend/src/routes/settings.ts`
- Create: `backend/tests/theTvdbClient.test.ts`
- Modify: `backend/tests/runtimeSettings.test.ts`
- Modify: `backend/tests/settingsApi.test.ts`

**Interfaces:**
- Produces: `TheTvdbClient.getUpdates(type, since, page)`, `getMovie(id)`, `getSeries(id)`
- Produces: `THETVDB_PIN` as an optional sensitive setting
- Consumes: runtime `THETVDB_API_KEY`, optional `THETVDB_PIN`, `THETVDB_BASE_URL`

- [ ] **Step 1: Write failing authentication and retry tests**

Create `backend/tests/theTvdbClient.test.ts` with a fake `SourceHttpClient`. Cover these exact behaviors:

```ts
it("omits pin when only a free project key is configured", async () => {
  const requests: Array<{ url: string; body?: string; headers?: HeadersInit }> = []
  const httpClient = fakeHttpClient(async (url, options) => {
    requests.push({ url, body: options.body as string | undefined, headers: options.headers })
    if (url.endsWith("/login")) return { status: "success", data: { token: "memory-token" } }
    return { status: "success", data: [], links: { next: null } }
  })
  const client = createTheTvdbClient({ apiKey: "free-key", pin: "", httpClient })

  await client.getUpdates("movies", 123, 0)

  expect(JSON.parse(requests[0].body ?? "{}")).toEqual({ apikey: "free-key" })
  expect(requests[1].headers).toMatchObject({ Authorization: "Bearer memory-token" })
})

it("reuses the in-memory token and never persists it", async () => {
  await client.getMovie(1)
  await client.getSeries(2)
  expect(loginRequests).toHaveLength(1)
  expect(settings.update).not.toHaveBeenCalled()
  expect(JSON.stringify(settings.snapshot())).not.toContain("memory-token")
})

it("refreshes once after 401 and does not loop", async () => {
  await expect(client.getMovie(1)).resolves.toMatchObject({ id: 1 })
  expect(loginRequests).toHaveLength(2)
  expect(movieRequests).toHaveLength(2)
})
```

Also test:

- missing API Key throws `TheTVDB 凭据未配置`
- login response without token throws `TheTVDB 登录响应缺少 Token`
- two queued request starts are at least 5 ms apart with injected `minIntervalMs: 5`
- a second 401 is returned as failure
- no thrown error contains API Key, PIN or Token

- [ ] **Step 2: Write failing optional PIN settings tests**

Require `THETVDB_PIN` to be accepted, masked and returned as an optional source field, while `credentialsComplete` depends only on `THETVDB_API_KEY`:

```ts
expect(settings.fieldView("THETVDB_PIN").value).toBeNull()
expect(settings.fieldView("THETVDB_PIN").maskedValue).toBe("••••••••")
expect(theTvdb.credentialsComplete).toBe(true)
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npm test --workspace backend -- theTvdbClient.test.ts runtimeSettings.test.ts settingsApi.test.ts
```

Expected: FAIL because the client and optional setting do not exist.

- [ ] **Step 4: Add optional source fields**

Extend `SourceDefinition` with:

```ts
optionalCredentialKeys: readonly string[]
```

Default it to `[]` in the source helper. Give TheTVDB:

```ts
credentialKeys: ["THETVDB_API_KEY"]
optionalCredentialKeys: ["THETVDB_PIN"]
```

Add `THETVDB_PIN` to `GLOBAL_SETTING_KEYS` and the label map as `TheTVDB PIN（可选）`. Include `optionalCredentialKeys` when building the source's settings fields, but do not include them in `credentialsComplete` or `missingCredentials`.

- [ ] **Step 5: Implement the client**

Use these public types:

```ts
export type TheTvdbUpdateType = "movies" | "series"

export type TheTvdbUpdate = {
  recordId: number
  methodInt: 1 | 2 | 3
  timeStamp: number
  mergeToId?: number | null
  mergeToEntityType?: string | null
}

export type TheTvdbUpdatesResponse = {
  status: string
  data: TheTvdbUpdate[]
  links?: { next?: string | null }
}

export type TheTvdbAlias = { language?: string | null; name?: string | null }
export type TheTvdbGenre = { id: number; name?: string | null }
export type TheTvdbRemoteId = { id?: string | null; sourceName?: string | null }
export type TheTvdbRelease = { country?: string | null; date?: string | null; detail?: string | null }

export type TheTvdbMovie = {
  id: number
  name?: string | null
  slug?: string | null
  year?: string | null
  aliases?: TheTvdbAlias[]
  genres?: TheTvdbGenre[]
  image?: string | null
  originalCountry?: string | null
  originalLanguage?: string | null
  first_release?: TheTvdbRelease | null
  releases?: TheTvdbRelease[]
  remoteIds?: TheTvdbRemoteId[]
  status?: { name?: string | null } | null
  score?: number | null
}

export type TheTvdbSeries = {
  id: number
  name?: string | null
  slug?: string | null
  aliases?: TheTvdbAlias[]
  genres?: TheTvdbGenre[]
  image?: string | null
  country?: string | null
  originalCountry?: string | null
  originalLanguage?: string | null
  firstAired?: string | null
  nextAired?: string | null
  remoteIds?: TheTvdbRemoteId[]
  status?: { name?: string | null } | null
  score?: number | null
}

export type TheTvdbClient = {
  getUpdates(type: TheTvdbUpdateType, since: number, page: number): Promise<TheTvdbUpdatesResponse>
  getMovie(id: number): Promise<TheTvdbMovie>
  getSeries(id: number): Promise<TheTvdbSeries>
}
```

Implement a closure-local `token: string | null`. The login body is:

```ts
const body = pin ? { apikey: apiKey, pin } : { apikey: apiKey }
```

Every login and authenticated request must execute through the same `RateLimiter`. Authenticated requests use `Authorization: Bearer ${token}`. Catch only `SourceHttpError` with `statusCode === 401`, clear the token, login once, then retry the original request once. All other failures propagate unchanged.

Use these exact v4 requests:

```ts
POST /login
GET /updates?since=<unix-seconds>&type=movies&page=<page>
GET /updates?since=<unix-seconds>&type=series&page=<page>
GET /movies/<id>/extended?short=true
GET /series/<id>/extended?short=true
```

The login request uses `Content-Type: application/json`. The three public data methods unwrap the official `{ status, data }` envelope and throw a Chinese error naming the endpoint when `data` is absent; they never include the response body in that error.

Use dynamic runtime settings on every public method call:

```ts
const current = settings.view()
const apiKey = options.apiKey ?? current.get("THETVDB_API_KEY")
const pin = options.pin ?? current.get("THETVDB_PIN")
const baseUrl = (options.baseUrl ?? current.get("THETVDB_BASE_URL") || "https://api4.thetvdb.com/v4")
  .replace(/\/$/, "")
const settingsOverride = captureSourceProxySettings(current, "thetvdb")
```

Do not expose a `getToken()` method and do not call `settings.update()`.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
npm test --workspace backend -- theTvdbClient.test.ts runtimeSettings.test.ts settingsApi.test.ts
npm run typecheck --workspace backend
```

Expected: all commands exit 0 and test output contains no fixture secrets.

Commit:

```bash
git add backend/src/clients/theTvdbClient.ts backend/src/settings/settingsFields.ts backend/src/settings/sourceCatalog.ts backend/src/routes/settings.ts backend/tests/theTvdbClient.test.ts backend/tests/runtimeSettings.test.ts backend/tests/settingsApi.test.ts
git commit -m "feat: 添加 TheTVDB 免费鉴权客户端"
```

---

### Task 2: 实现更新流、日期过滤与元数据映射

**Files:**
- Create: `backend/src/adapters/theTvdbAdapter.ts`
- Create: `backend/tests/theTvdbAdapter.test.ts`
- Modify: `backend/tests/sync.test.ts`

**Interfaces:**
- Produces: `createTheTvdbAdapter(options): SourceAdapter<SourceFetchBatch>` and `theTvdbAdapter`
- Produces: scope `updates`
- Consumes: `TheTvdbClient`, `SourceFetchBatch`, `createIfMissing`, `retiredSourceRefs`

- [ ] **Step 1: Write failing update selection tests**

Use `now: () => new Date("2026-06-21T12:00:00Z")` and assert the first updates request uses Unix seconds for `2026-06-19T12:00:00Z`. Cover:

```ts
it("deduplicates updates and keeps the newest 40 detail candidates", async () => {
  const result = await adapter.fetchItems()
  expect(client.getMovie).toHaveBeenCalledTimes(20)
  expect(client.getSeries).toHaveBeenCalledTimes(20)
  expect(new Set(detailIds).size).toBe(40)
})

it("turns deleted records into inactive source refs", async () => {
  const result = await adapter.fetchItems()
  expect(result).toMatchObject({
    retiredSourceRefs: [
      { source: "thetvdb", sourceId: "thetvdb:movie:10" },
      { source: "thetvdb", sourceId: "thetvdb:series:20" }
    ]
  })
})
```

Test pagination until `links.next` is null and that duplicate `(type, recordId)` rows retain the greatest `timeStamp`.

- [ ] **Step 2: Write failing date-boundary and score tests**

Create movie fixtures for `2026-05-22`, `2026-12-18`, and dates immediately outside those bounds. Create series fixtures for recent `firstAired` and `nextAired` through `2026-07-21`.

Assert:

```ts
expect(recentMovie.createIfMissing).toBe(true)
expect(oldMovie.createIfMissing).toBe(false)
expect(oldMovie.releases).toEqual([])
expect(upcomingSeries.createIfMissing).toBe(true)
expect(result.items.flatMap((item) => item.popularitySignals)).toEqual([])
expect(JSON.stringify(result)).not.toContain('"score"')
```

Also assert exact normalized IDs, aliases, image, genres, status, country, original language and release dates.

- [ ] **Step 3: Run and verify RED**

Run:

```bash
npm test --workspace backend -- theTvdbAdapter.test.ts sync.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Import response records and implement pure helpers**

Import `TheTvdbMovie`, `TheTvdbSeries`, `TheTvdbRemoteId` and `TheTvdbRelease` from `theTvdbClient.ts`. Keep one local union for mapping:

```ts
type TheTvdbDetail = TheTvdbMovie | TheTvdbSeries
```

Implement pure inclusive-window helpers using ISO `YYYY-MM-DD` values:

```ts
function inDateWindow(value: string | null, start: string, end: string): boolean {
  return value != null && value >= start && value <= end
}
```

Use local date arithmetic helpers, not millisecond division across DST boundaries, to derive `today - 30`, `today + 180`, and `today + 30`.

- [ ] **Step 5: Collect, deduplicate and cap updates**

For each type, request pages starting at `0` until `links.next` is empty. Maintain a `Set` of visited next links; throw `TheTVDB 更新分页循环` if a link repeats. Merge movie and series rows, then:

1. deduplicate by `${type}:${recordId}`, retaining the largest `timeStamp`
2. map every `methodInt === 3` to `retiredSourceRefs`
3. sort non-delete rows by `timeStamp` descending
4. take at most 40 total detail records
5. fetch details sequentially through the client

Do not issue a detail request for a delete row.

- [ ] **Step 6: Map movie and series DTOs**

Use stable IDs:

```ts
thetvdb:movie:<id>
thetvdb:series:<id>
```

Map remote IDs by normalized `sourceName`:

```ts
function remoteId(records: TheTvdbRemoteId[] | undefined, names: string[]): string | null {
  const accepted = new Set(names.map((name) => name.toLowerCase()))
  return records?.find((record) => {
    return record.sourceName && accepted.has(record.sourceName.toLowerCase())
  })?.id?.trim() || null
}
```

Parse TMDb IDs only when the value is a finite positive integer. Preserve IMDb IDs as strings. Every item has `popularitySignals: []`; never read the `score` property during mapping.

Map media status without copying arbitrary source text:

```ts
function mappedStatus(kind: "movie" | "series", releaseDate: string | null, statusName: string | null, today: string): MediaStatus {
  if (releaseDate && releaseDate > today) return "upcoming"
  if (kind === "movie") return releaseDate ? "released" : "unknown"
  if (statusName?.toLowerCase().includes("ended")) return "ended"
  return releaseDate ? "ongoing" : "unknown"
}
```

For a recent movie, create one release with `first_release.date`. For a series, prefer a relevant `nextAired`, otherwise a relevant `firstAired`. Use:

```ts
{
  platform: "Unspecified",
  region: country ?? "GLOBAL",
  releaseTime: null,
  releasePattern: mediaType === "movie" ? "movie_release" : "series_air_date",
  releaseStatus: releaseDate > today ? "upcoming" : releaseDate === today ? "airing_today" : "available",
  seasonNumber: null,
  episodeNumber: null,
  episodeTitle: null,
  source: "thetvdb",
  sourceUrl
}
```

Set `createIfMissing` to true only for the approved date windows. For stale items set `createIfMissing: false` and `releases: []`, allowing Task 1's sync service to enrich an existing match without creating a historical title.

- [ ] **Step 7: Verify GREEN and commit**

Run:

```bash
npm test --workspace backend -- theTvdbAdapter.test.ts sync.test.ts
npm run typecheck --workspace backend
```

Expected: all commands exit 0; tests prove no score-derived popularity and no stale unmatched creation.

Commit:

```bash
git add backend/src/adapters/theTvdbAdapter.ts backend/tests/theTvdbAdapter.test.ts backend/tests/sync.test.ts
git commit -m "feat: 添加 TheTVDB 每日元数据同步"
```

---

### Task 3: 激活每日任务、设置 UI 与来源归属

**Files:**
- Modify: `backend/src/settings/sourceCatalog.ts`
- Modify: `backend/src/adapters/adapterRegistry.ts`
- Create: `backend/src/scripts/syncTheTvdb.ts`
- Modify: `backend/package.json`
- Modify: `backend/src/routes/media.ts`
- Modify: `backend/.env.example`
- Modify: `README.md`
- Modify: `backend/tests/sourceCatalog.test.ts`
- Modify: `backend/tests/scheduler.test.ts`
- Modify: `backend/tests/api.test.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/MediaDetailPage.tsx`
- Modify: `frontend/src/utils/sourceLabel.ts`
- Modify: `frontend/tests/pages.test.tsx`

**Interfaces:**
- Produces: active but default-disabled TheTVDB source
- Produces: daily registered adapter with scope `updates`
- Produces: detail `sourceRefs` and visible TheTVDB attribution

- [ ] **Step 1: Write failing catalog, scheduler and attribution tests**

Catalog assertions:

```ts
expect(getSourceDefinition("thetvdb")).toMatchObject({
  implementationStatus: "active",
  supportsSync: true,
  supportsEnable: true,
  defaultEnabled: false,
  scheduleGroups: ["daily"],
  credentialKeys: ["THETVDB_API_KEY"],
  optionalCredentialKeys: ["THETVDB_PIN"]
})
```

Scheduler assertion: a configured and enabled TheTVDB source runs only in the daily job. A missing API Key or `SOURCE_THETVDB_ENABLED=false` prevents the run.

Detail API and UI assertions:

```ts
expect(response.body.sourceRefs).toEqual(expect.arrayContaining([
  expect.objectContaining({ source: "thetvdb", isActive: true })
]))
expect(screen.getByText("数据来源 TheTVDB")).toBeInTheDocument()
expect(screen.getByText("平台未提供")).toBeInTheDocument()
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test --workspace backend -- sourceCatalog.test.ts scheduler.test.ts api.test.ts
npm test --workspace frontend -- pages.test.tsx
```

Expected: FAIL because TheTVDB is still planned and detail attribution is absent.

- [ ] **Step 3: Activate and register TheTVDB without enabling it**

Set the source definition exactly as asserted in Step 1. Register:

```ts
{ sourceId: "thetvdb", scheduleGroup: "daily", adapter: theTvdbAdapter }
```

The source remains non-runnable by default because `defaultEnabled` is false and its required API Key is missing. Do not modify the local `.env` in this task.

Create `syncTheTvdb.ts` to load settings, resolve the enabled TheTVDB entry, run it once, print only scope/status/item count, and exit non-zero for disabled, missing credentials or failed run. Add `"sync:thetvdb": "tsx src/scripts/syncTheTvdb.ts"`.

- [ ] **Step 4: Return and render source attribution**

Change the detail query to include active and inactive `sourceRefs` ordered by source. Add the frontend type:

```ts
type MediaSourceRef = {
  id: string
  source: string
  sourceId: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}
```

Render active sources as `数据来源 ${sourceLabel(source)}`. Render inactive refs only inside a muted `历史来源` line. For releases, continue converting `Unspecified` to “平台未提供” and show `来源 TheTVDB`.

Add `thetvdb: "TheTVDB"` to `sourceLabel.ts`.

- [ ] **Step 5: Document the free-only policy**

Add to `.env.example`:

```dotenv
THETVDB_API_KEY=""
THETVDB_PIN=""
THETVDB_BASE_URL="https://api4.thetvdb.com/v4"
SOURCE_THETVDB_ENABLED=false
SOURCE_THETVDB_PROXY_MODE=inherit
```

README must state:

- only a free project API Key is supported
- PIN is optional and omitted when not required
- the source defaults off until the user explicitly enables it
- daily sync reads a 48-hour overlap and caps detail calls at 40
- old metadata updates do not become new titles
- `score` is ignored for popularity
- TheTVDB attribution is shown wherever its data appears
- paid access is never an automatic fallback

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
npm test --workspace backend -- sourceCatalog.test.ts scheduler.test.ts api.test.ts settingsApi.test.ts
npm test --workspace frontend -- pages.test.tsx settingsPage.test.tsx
npm run typecheck
npm run build
```

Expected: all commands exit 0; settings shows active/default-off/missing-Key without exposing PIN or API Key.

Commit:

```bash
git add backend/src/settings/sourceCatalog.ts backend/src/adapters/adapterRegistry.ts backend/src/scripts/syncTheTvdb.ts backend/package.json backend/src/routes/media.ts backend/.env.example README.md backend/tests/sourceCatalog.test.ts backend/tests/scheduler.test.ts backend/tests/api.test.ts frontend/src/api/types.ts frontend/src/pages/MediaDetailPage.tsx frontend/src/utils/sourceLabel.ts frontend/tests/pages.test.tsx
git commit -m "feat: 启用 TheTVDB 免费元数据来源"
```

---

### Task 4: 经用户确认申请免费 Key 并完成真实验证

**Files:**
- Local only: `backend/.env`
- Verify only: TheTVDB account pages
- Verify only: MySQL development database
- Verify only: running frontend and backend
- Modify after successful live verification: `README.md`

**Interfaces:**
- Consumes: explicit user confirmation immediately before form submission
- Produces: free v4 project Key and a verified daily source

- [ ] **Step 1: Re-check free terms at action time**

Use `kimi-webbridge` with the user's logged-in browser to open the official API application page. Confirm all of the following before entering data:

- a free project tier is still available for the project's real revenue/use case
- the form does not require payment details
- the form does not enroll the user in a personal paid subscription
- the terms allow the described personal self-hosted, non-commercial use with attribution

If any condition fails, stop this task, leave `SOURCE_THETVDB_ENABLED=false`, and report the exact official page text without submitting.

- [ ] **Step 2: Prepare the form but do not submit**

Fill only these approved values:

```text
Company / Project Revenue: actual applicable free tier
Company or Project Name: WhatsNew
Media Center: Other, or the closest truthful option
Description: Personal self-hosted non-commercial dashboard that monitors upcoming and newly released movies and TV series. It uses TheTVDB metadata, external IDs, artwork, first-air dates and next-air dates. TheTVDB attribution is displayed. Data is not resold.
```

Take a screenshot or read back every field to the user. Do not click Submit in this step.

- [ ] **Step 3: Obtain action-time confirmation**

Ask the user one direct question: `TheTVDB 免费项目申请已按上述内容填好，确认现在提交吗？`

Only an explicit affirmative answer authorizes the next step. Previous approval of the design or implementation plan does not count as submission approval.

- [ ] **Step 4: Submit only the free application and retrieve the Key**

After explicit confirmation, click Submit once. If any payment, upgrade or subscription prompt appears, stop immediately and do not continue.

When a free v4 API Key is available, save it through the local settings API without printing it. Save a PIN only if the approved free project page explicitly provides or requires one. Verify `GET /api/settings` reports `credentialsComplete: true`; never print `maskedValue`.

If approval is asynchronous, keep the source disabled and resume this step only after the account page shows a free project Key.

- [ ] **Step 5: Enable and run a real daily sync**

Explicitly set `SOURCE_THETVDB_ENABLED=true` through the settings API, run the connection test, then run one manual sync. Expected:

- login succeeds without paid subscription
- sync scope is `updates`
- status is `success` or a reviewed `warning`
- detail count is at most 40
- runtime duration is consistent with 2-second request spacing

- [ ] **Step 6: Verify database and security invariants**

Assert with non-secret queries:

- new TheTVDB source refs use `thetvdb:movie:<id>` or `thetvdb:series:<id>`
- no unmatched title outside the date window was created
- stale matched records may gain IDs/aliases/images but no new release
- deleted update records set `MediaSourceRef.isActive=false`
- TheTVDB releases use `platform="Unspecified"`
- there are zero popularity signals whose source begins with `thetvdb`
- no Token, API Key, PIN or proxy exists in `SourceSyncRun.errorMessage`, API responses or logs

- [ ] **Step 7: Run complete automated and browser verification**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Open `http://127.0.0.1:19992/` in desktop and mobile widths. Verify settings state, source attribution, “平台未提供”, no overlapping text, and no secret values in rendered DOM or network responses.

- [ ] **Step 8: Record only non-secret live status and commit**

Update README's source status table to state that TheTVDB free v4 integration was live-verified, including the verification date but no account ID, Key, PIN, Token, response body or project application identifier.

Run `git diff --check`, then commit:

```bash
git add README.md
git commit -m "docs: 记录 TheTVDB 免费来源验证"
```

If a free Key is still pending, do not make this commit and keep the task open.
