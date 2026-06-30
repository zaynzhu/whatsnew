# Source Semantics and China Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add source semantics metadata to WhatsNew so settings and source pages explain what each source contributes, how fresh it is, and why some sources are not syncable yet.

**Architecture:** Keep the metadata static in the existing source catalog, expose it through `GET /api/settings` and `GET /api/sources`, then render it in the existing React pages. This avoids a database migration and keeps source semantics close to source registration.

**Tech Stack:** TypeScript, Express, Prisma, React, Vite, Vitest, shared workspace package.

## Global Constraints

- 电影与剧集必须保留明确的 `mediaType`，不得把不同类型合并为同一作品。
- 热度信号必须保留来源、平台、地区和时间窗口，不生成无法解释的跨源真实排名。
- 所有外部 API 请求必须使用统一限频机制，同一服务连续请求间隔不低于 2 秒。
- TheTVDB 只允许免费 project API Key，不接入或回退到付费能力。
- Trakt 日历表示发行或播出排期，不等同于流媒体已上架。
- demo seed 仅用于显式开发测试，不得作为真实数据同步步骤或生产初始化步骤。
- 本计划不新增外部请求，不绕过登录、验证码、反爬或付费墙。

---

## File Structure

- Modify `shared/src/settings.ts`: define `SourceSignalKind`, `SourceAccessType`, `SourceSemanticsView`, and extend source response types.
- Modify `backend/src/settings/sourceCatalog.ts`: add semantics fields to each source definition.
- Modify `backend/src/routes/settings.ts`: include semantics fields in `GET /api/settings`.
- Modify `backend/src/routes/sources.ts`: return source catalog entries joined with latest sync run.
- Modify `frontend/src/api/types.ts`: update `SourcesResponse`.
- Modify `frontend/src/pages/SettingsPage.tsx`: show signal tags, coverage/freshness, and access type in the registry.
- Modify `frontend/src/pages/SourcesPage.tsx`: show the source catalog instead of only recent sync runs.
- Modify `frontend/src/styles.css`: add compact tag and source catalog styles.
- Modify tests in `backend/tests/sourceCatalog.test.ts`, `backend/tests/settingsApi.test.ts`, `backend/tests/api.test.ts`, and `frontend/tests/pages.test.tsx`.

## Task 1: Shared Source Semantics Types

**Files:**
- Modify: `shared/src/settings.ts`
- Test: `backend/tests/sourceCatalog.test.ts`

**Interfaces:**
- Produces: `SourceSignalKind`, `SourceAccessType`, `SourceSemanticsView`
- Consumes: Existing `SourceSettingsView`

- [ ] **Step 1: Extend shared types**

Add stable enums:

```ts
export const SOURCE_SIGNAL_KINDS = [
  "release_calendar", "platform_catalog", "platform_rank", "community_trend",
  "metadata", "availability", "box_office", "rating", "news_signal"
] as const
export type SourceSignalKind = (typeof SOURCE_SIGNAL_KINDS)[number]

export const SOURCE_ACCESS_TYPES = [
  "public_api", "free_key", "application", "commercial", "public_page", "restricted_page"
] as const
export type SourceAccessType = (typeof SOURCE_ACCESS_TYPES)[number]

export type SourceSemanticsView = {
  signalKinds: SourceSignalKind[]
  coverage: string
  cadence: string
  access: SourceAccessType
  freshnessNote: string
  riskNote: string
}
```

Then add `semantics: SourceSemanticsView` to `SourceSettingsView`.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: Type errors appear where source responses have not yet provided `semantics`.

## Task 2: Backend Catalog Metadata

**Files:**
- Modify: `backend/src/settings/sourceCatalog.ts`
- Modify: `backend/tests/sourceCatalog.test.ts`

**Interfaces:**
- Consumes: `SourceSemanticsView`
- Produces: `SourceDefinition["semantics"]`

- [ ] **Step 1: Add semantics to source definitions**

Change `SourceDefinition` and `source()` so every entry carries:

```ts
semantics: SourceSemanticsView
```

Use explicit metadata for key sources:

```ts
{
  signalKinds: ["community_trend", "metadata", "release_calendar"],
  coverage: "全球电影与剧集，社区观看和期待信号",
  cadence: "小时级热度，日级 14 天日历",
  access: "free_key",
  freshnessNote: "热度来自 Trakt 当前榜单，日历不代表流媒体可看",
  riskNote: "需要 Trakt Client ID；网络路径可能需要代理"
}
```

Set JustWatch to `access: "application"` or `commercial` with `supportsSync: false`; set FlixPatrol to `commercial`; set 猫眼/灯塔类来源 to `public_page` or `restricted_page` when added.

- [ ] **Step 2: Update catalog tests**

Assert:

```ts
expect(getSourceDefinition("trakt").semantics.signalKinds).toContain("community_trend")
expect(getSourceDefinition("justwatch").semantics.access).toBe("application")
expect(getSourceDefinition("flixpatrol").semantics.access).toBe("commercial")
expect(getSourceDefinition("youku").semantics.signalKinds).toContain("platform_rank")
```

- [ ] **Step 3: Run focused backend test**

Run: `npm test --workspace backend -- sourceCatalog`

Expected: source catalog tests pass.

## Task 3: API Response Shape

**Files:**
- Modify: `backend/src/routes/settings.ts`
- Modify: `backend/src/routes/sources.ts`
- Modify: `frontend/src/api/types.ts`
- Test: `backend/tests/settingsApi.test.ts`
- Test: `backend/tests/api.test.ts`

**Interfaces:**
- Produces: `SourcesResponse = { items: SourceCatalogItem[] }`
- Each item includes `semantics`, `latestRun`, status, enabled and runnable flags.

- [ ] **Step 1: Add settings semantics**

In `GET /api/settings`, include:

```ts
semantics: source.semantics
```

inside each source object.

- [ ] **Step 2: Change sources route**

Return one item per `SOURCE_CATALOG` entry, joined to the latest run by source. Include redacted errors through `redactStoredError`.

- [ ] **Step 3: Update API types**

Add:

```ts
export type SourceCatalogItem = SourceSettingsView
export type SourcesResponse = {
  items: SourceCatalogItem[]
}
```

- [ ] **Step 4: Run API tests**

Run: `npm test --workspace backend -- settingsApi api`

Expected: settings and sources route tests pass.

## Task 4: Frontend Source Semantics UI

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/pages/SourcesPage.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/tests/pages.test.tsx`
- Test: `frontend/tests/settingsPage.test.tsx`

**Interfaces:**
- Consumes: `source.semantics.signalKinds`, `coverage`, `cadence`, `access`, `riskNote`

- [ ] **Step 1: Add label maps**

Add local label maps for signal kinds and access types. Keep labels short:

```ts
release_calendar: "排期"
platform_catalog: "片库"
platform_rank: "平台榜"
community_trend: "社区热度"
metadata: "元数据"
availability: "可看性"
box_office: "票房"
rating: "口碑"
news_signal: "资讯"
```

- [ ] **Step 2: Render settings table semantics**

In the settings source table, add compact tags for signal kinds and one line for coverage plus cadence. Keep the existing operations column unchanged.

- [ ] **Step 3: Rebuild sources page**

Render source catalog cards or rows from `/api/sources`, showing:

- source name and group
- implementation status
- signal kind tags
- access type
- latest run status and item count
- risk note for planned, application, commercial and restricted sources

- [ ] **Step 4: Run frontend tests**

Run: `npm test --workspace frontend -- pages settingsPage`

Expected: page tests pass and assert that source semantics labels render.

## Task 5: Final Verification and Commit

**Files:**
- All files changed above

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Commit**

Run:

```bash
git add shared/src/settings.ts backend/src/settings/sourceCatalog.ts backend/src/routes/settings.ts backend/src/routes/sources.ts frontend/src/api/types.ts frontend/src/pages/SettingsPage.tsx frontend/src/pages/SourcesPage.tsx frontend/src/styles.css backend/tests/sourceCatalog.test.ts backend/tests/settingsApi.test.ts backend/tests/api.test.ts frontend/tests/pages.test.tsx frontend/tests/settingsPage.test.tsx
git commit -m "feat: 展示数据源口径说明"
```
