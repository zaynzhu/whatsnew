# WhatsNew Settings And Source Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a settings workspace where proxy, credentials, source policy, connectivity tests, and manual sync controls are managed safely and take effect without restarting WhatsNew.

**Architecture:** Keep `backend/.env` as the persistent source of truth, add a runtime settings service that atomically writes the file and swaps an in-memory snapshot after success, and route all external HTTP traffic through a source-aware proxy client. A static typed source catalog drives both backend validation and the frontend registry; only implemented adapters can be enabled or synchronized.

**Tech Stack:** TypeScript, Express 5, React 18, TanStack Query, Zod, Vitest, Testing Library, Undici `ProxyAgent`, existing Prisma/MySQL sync history.

## Global Constraints

- JavaScript and TypeScript use no semicolons and 2-space indentation.
- Every external service keeps its own `RateLimiter`; consecutive requests to the same service start at least 2 seconds apart.
- Settings persist to `backend/.env`, while successful saves update the runtime snapshot immediately.
- A running source sync keeps its starting snapshot; the next test or sync receives the new settings.
- Sensitive values are never returned in full by an API, written to logs, committed, or included in test output.
- Global proxy plus per-source `inherit`, `direct`, and `custom` modes are required.
- Domestic sources default to `direct`; international sources default to `inherit`.
- Planned, blocked, and commercial sources must never be represented as active adapters.
- The settings page has no authentication by explicit user choice and is only suitable for a private LAN or NAS deployment.
- Frontend stays on `19992`; backend stays on `19993`.
- Use TDD for every behavior change and commit every independently verified task with `type: 中文描述`.

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `shared/src/settings.ts` | Create | Shared settings, proxy, source status, and API response types |
| `shared/package.json` | Modify | Export `@whatsnew/shared/settings` |
| `backend/src/settings/sourceCatalog.ts` | Create | Typed registry of all active and planned sources |
| `backend/src/settings/envFileStore.ts` | Create | Parse, preserve, back up, and atomically update `.env` |
| `backend/src/settings/runtimeSettingsService.ts` | Create | Validated in-memory settings snapshots and masked API views |
| `backend/src/settings/proxyResolver.ts` | Create | Resolve direct/global/custom proxy for a source and URL |
| `backend/src/settings/settingsFields.ts` | Create | Whitelisted global and source-derived environment keys |
| `backend/src/utils/sourceHttpClient.ts` | Create | Source-aware text/JSON HTTP requests through Undici |
| `backend/src/services/connectionTestService.ts` | Create | Lightweight proxy and source reachability tests |
| `backend/src/routes/settings.ts` | Create | Settings read/update and global proxy test API |
| `backend/src/routes/sources.ts` | Modify | Source catalog, connectivity test, enable policy, and sync guards |
| `backend/src/adapters/*.ts` | Modify | Read current settings snapshots and use source HTTP client |
| `backend/src/scheduler.ts` | Modify | Resolve enabled implemented adapters at each run |
| `backend/src/app.ts` | Modify | Mount settings routes |
| `backend/.env.example` | Modify | Document proxy, credential, and source policy keys without values |
| `frontend/src/pages/SettingsPage.tsx` | Create | Proxy form and source registry workspace |
| `frontend/src/components/SourceConfigDialog.tsx` | Create | Source credentials, Base URL, and custom proxy editor |
| `frontend/src/api/types.ts` | Modify | Re-export settings API types used by UI |
| `frontend/src/App.tsx` | Modify | Add settings navigation and route |
| `frontend/src/styles.css` | Modify | Responsive settings table, segmented controls, dialog, and status styles |

---

### Task 1: Typed Source Catalog And Shared Contracts

**Files:**
- Create: `shared/src/settings.ts`
- Modify: `shared/package.json`
- Create: `backend/src/settings/sourceCatalog.ts`
- Create: `backend/tests/sourceCatalog.test.ts`

**Interfaces:**
- Produces: `SourceId`, `ProxyMode`, `SourceImplementationStatus`, `SettingsResponse`, `SOURCE_CATALOG`, `getSourceDefinition(sourceId)`
- Consumes: no earlier task interfaces

- [ ] **Step 1: Write the failing catalog test**

```ts
import { describe, expect, it } from "vitest"
import { SOURCE_CATALOG, getSourceDefinition } from "../src/settings/sourceCatalog.js"

describe("source catalog", () => {
  it("lists the approved active and planned sources without pretending planned sources are syncable", () => {
    expect(SOURCE_CATALOG).toHaveLength(20)
    expect(SOURCE_CATALOG.filter((source) => source.implementationStatus === "active").map((source) => source.id)).toEqual([
      "tvmaze",
      "tmdb",
      "youku",
      "iqiyi"
    ])
    expect(getSourceDefinition("trakt").implementationStatus).toBe("blocked")
    expect(getSourceDefinition("justwatch").implementationStatus).toBe("commercial")
    expect(getSourceDefinition("tencent").supportsSync).toBe(false)
  })

  it("defaults domestic sources to direct and international sources to inherited proxy", () => {
    expect(getSourceDefinition("youku").defaultProxyMode).toBe("direct")
    expect(getSourceDefinition("tmdb").defaultProxyMode).toBe("inherit")
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test --workspace backend -- sourceCatalog.test.ts`

Expected: FAIL because `sourceCatalog.js` does not exist.

- [ ] **Step 3: Define shared contracts**

Create `shared/src/settings.ts` with these exact public contracts:

```ts
export const SOURCE_IDS = [
  "tvmaze", "tmdb", "trakt", "imdb", "thetvdb", "justwatch", "flixpatrol",
  "netflix", "prime_video", "hulu", "disney_plus", "max", "apple_tv_plus",
  "youku", "iqiyi", "tencent", "mango_tv", "bilibili", "douban", "mtime"
] as const
export type SourceId = (typeof SOURCE_IDS)[number]

export const PROXY_MODES = ["inherit", "direct", "custom"] as const
export type ProxyMode = (typeof PROXY_MODES)[number]

export const SOURCE_IMPLEMENTATION_STATUSES = ["active", "blocked", "planned", "commercial"] as const
export type SourceImplementationStatus = (typeof SOURCE_IMPLEMENTATION_STATUSES)[number]

export const SOURCE_GROUPS = ["global_metadata", "cross_platform", "international_platform", "china_platform"] as const
export type SourceGroup = (typeof SOURCE_GROUPS)[number]

export type SettingsFieldView = {
  key: string
  label: string
  type: "text" | "password" | "boolean" | "select"
  sensitive: boolean
  configured: boolean
  maskedValue: string | null
  value: string | null
  options?: string[]
}

export type SourceSettingsView = {
  id: string
  name: string
  description: string
  group: SourceGroup
  implementationStatus: SourceImplementationStatus
  enabled: boolean
  proxyMode: ProxyMode
  credentialsComplete: boolean
  supportsSync: boolean
  supportsEnable: boolean
  fields: SettingsFieldView[]
  latestRun: {
    status: string
    startedAt: string
    finishedAt: string | null
    itemCount: number
    durationMs: number | null
    errorMessage: string | null
  } | null
}

export type SettingsResponse = {
  proxyFields: SettingsFieldView[]
  sources: SourceSettingsView[]
}

export type SettingsUpdateRequest = {
  values: Record<string, string>
  clearKeys: string[]
}

export type SettingsUpdateResponse = {
  success: true
  effectiveImmediately: true
}

export type ConnectionTestResult = {
  mode: "direct" | "http_proxy" | "https_proxy" | "source"
  success: boolean
  durationMs: number
  statusCode: number | null
  errorType: string | null
  message: string
}
```

Add the following export to `shared/package.json` under `exports`:

```json
"./settings": {
  "types": "./dist/settings.d.ts",
  "default": "./dist/settings.js"
}
```

- [ ] **Step 4: Implement the source catalog**

Create `backend/src/settings/sourceCatalog.ts`. Define the catalog type exactly, then derive `SOURCE_<ID>_BASE_URL` unless the id appears in the override map:

```ts
export type SourceDefinition = {
  id: SourceId
  name: string
  description: string
  group: SourceGroup
  implementationStatus: SourceImplementationStatus
  defaultProxyMode: ProxyMode
  supportsSync: boolean
  supportsEnable: boolean
  testUrl: string
  baseUrlKey: string
  credentialKeys: readonly string[]
}

const BASE_URL_KEY_OVERRIDES: Partial<Record<SourceId, string>> = {
  tvmaze: "TVMAZE_BASE_URL",
  tmdb: "TMDB_BASE_URL",
  trakt: "TRAKT_BASE_URL",
  thetvdb: "THETVDB_BASE_URL",
  douban: "DOUBAN_BASE_URL"
}

function sourceBaseUrlKey(sourceId: SourceId): string {
  return BASE_URL_KEY_OVERRIDES[sourceId] ?? `SOURCE_${sourceId.toUpperCase()}_BASE_URL`
}

function source(
  id: SourceId,
  name: string,
  description: string,
  group: SourceGroup,
  implementationStatus: SourceImplementationStatus,
  defaultProxyMode: ProxyMode,
  supportsSync: boolean,
  supportsEnable: boolean,
  testUrl: string,
  credentialKeys: string[] = []
): SourceDefinition {
  return {
    id,
    name,
    description,
    group,
    implementationStatus,
    defaultProxyMode,
    supportsSync,
    supportsEnable,
    testUrl,
    baseUrlKey: sourceBaseUrlKey(id),
    credentialKeys
  }
}
```

Populate the catalog in this exact order:

```ts
export const SOURCE_CATALOG = [
  source("tvmaze", "TVmaze", "剧集与集数排期", "global_metadata", "active", "inherit", true, true, "https://api.tvmaze.com/shows/1"),
  source("tmdb", "TMDb", "电影、剧集、趋势和基础元数据", "global_metadata", "active", "inherit", true, true, "https://api.themoviedb.org/3/configuration", ["TMDB_API_KEY"]),
  source("trakt", "Trakt", "电影与剧集趋势", "global_metadata", "blocked", "inherit", false, false, "https://api.trakt.tv/shows/trending?limit=1", ["TRAKT_CLIENT_ID"]),
  source("imdb", "IMDb", "日更数据集与榜单", "global_metadata", "planned", "inherit", false, false, "https://datasets.imdbws.com/title.basics.tsv.gz"),
  source("thetvdb", "TheTVDB", "影视元数据与外部 ID", "global_metadata", "planned", "inherit", false, false, "https://api4.thetvdb.com/v4/login", ["THETVDB_API_KEY"]),
  source("justwatch", "JustWatch", "可看性与 Streaming Charts", "cross_platform", "commercial", "inherit", false, false, "https://www.justwatch.com/us/streaming-charts"),
  source("flixpatrol", "FlixPatrol", "多平台地区 Top 10", "cross_platform", "commercial", "inherit", false, false, "https://flixpatrol.com/calendar/upcoming/"),
  source("netflix", "Netflix", "官方 Top 10 与上新", "international_platform", "planned", "inherit", false, false, "https://www.netflix.com/tudum/top10/tv"),
  source("prime_video", "Prime Video", "Top 10、趋势与新内容", "international_platform", "planned", "inherit", false, false, "https://www.primevideo.com/collection/IncludedwithPrime"),
  source("hulu", "Hulu", "Top 15 与上新", "international_platform", "planned", "inherit", false, false, "https://www.hulu.com/hub/tv/collections/9979"),
  source("disney_plus", "Disney+", "官方上新日历", "international_platform", "planned", "inherit", false, false, "https://www.disneyplus.com/explore/articles/new-to-disney-plus"),
  source("max", "Max", "Top 10、即将上线与下架", "international_platform", "planned", "inherit", false, false, "https://help.max.com/us/Answer/Detail/000002558"),
  source("apple_tv_plus", "Apple TV+", "新片与热门榜", "international_platform", "planned", "inherit", false, false, "https://tv.apple.com/us/collection/new-releases/uts.col.tv-plus-newest-releases"),
  source("youku", "优酷", "电影、长剧、独播与热度", "china_platform", "active", "direct", true, true, "https://tv.youku.com/"),
  source("iqiyi", "爱奇艺", "新片速递、预约与平台内容", "china_platform", "active", "direct", true, true, "https://www.iqiyi.com/newOnlinePCW"),
  source("tencent", "腾讯视频", "影视频道与热榜", "china_platform", "planned", "direct", false, false, "https://v.qq.com/p/tv/"),
  source("mango_tv", "芒果TV", "热播、预约与追更日历", "china_platform", "planned", "direct", false, false, "https://www.mgtv.com/tv/"),
  source("bilibili", "哔哩哔哩", "番剧、国创与榜单", "china_platform", "planned", "direct", false, false, "https://www.bilibili.com/anime/"),
  source("douban", "豆瓣", "中国口碑与评分", "china_platform", "planned", "direct", false, false, "https://movie.douban.com/"),
  source("mtime", "时光网", "中文影视资讯补充", "china_platform", "planned", "direct", false, false, "https://www.mtime.com/"),
] as const
```

The `source()` helper must produce `SourceDefinition`, and `getSourceDefinition()` must throw `未知数据源: <id>` for an unknown id.

- [ ] **Step 5: Verify GREEN and shared typecheck**

Run:

```bash
npm run test --workspace backend -- sourceCatalog.test.ts
npm run typecheck --workspace shared
npm run typecheck --workspace backend
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add shared/package.json shared/src/settings.ts backend/src/settings/sourceCatalog.ts backend/tests/sourceCatalog.test.ts
git commit -m "feat: 添加数据源目录与设置契约"
```

---

### Task 2: Atomic Env Store And Runtime Settings

**Files:**
- Create: `backend/src/settings/settingsFields.ts`
- Create: `backend/src/settings/envFileStore.ts`
- Create: `backend/src/settings/runtimeSettingsService.ts`
- Create: `backend/tests/runtimeSettings.test.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `SOURCE_CATALOG`, `ProxyMode`, `SettingsFieldView`
- Produces: `EnvFileStore`, `RuntimeSettingsService`, singleton `runtimeSettings`, `sourceEnvKey(sourceId, suffix)`

- [ ] **Step 1: Write failing tests for persistence and masking**

Use a temporary directory in `backend/tests/runtimeSettings.test.ts` and cover these exact behaviors:

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "whatsnew-settings-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function fixtureSettings(content: string): Promise<RuntimeSettingsService> {
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, content)
  const settings = new RuntimeSettingsService(new EnvFileStore(envPath))
  await settings.load()
  return settings
}

it("preserves comments and swaps the runtime snapshot only after an atomic save", async () => {
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, "# proxy\nHTTPS_PROXY=http://old.test:7890\nTMDB_API_KEY=secret-old\n")
  const settings = new RuntimeSettingsService(new EnvFileStore(envPath))
  await settings.load()

  await settings.update({ HTTPS_PROXY: "http://new.test:7890" }, [])

  expect(await readFile(envPath, "utf8")).toContain("# proxy")
  expect(await readFile(envPath, "utf8")).toContain("HTTPS_PROXY=http://new.test:7890")
  expect(settings.get("HTTPS_PROXY")).toBe("http://new.test:7890")
  expect(await readFile(`${envPath}.backup.local`, "utf8")).toContain("http://old.test:7890")
})

it("never returns a sensitive value and keeps it when omitted", async () => {
  const settings = await fixtureSettings("TMDB_API_KEY=abcd-secret-1234\n")
  const field = settings.fieldView("TMDB_API_KEY")

  expect(field.value).toBeNull()
  expect(field.configured).toBe(true)
  expect(field.maskedValue).toBe("••••••••1234")

  await settings.update({}, [])
  expect(settings.get("TMDB_API_KEY")).toBe("abcd-secret-1234")
})

it("clears a sensitive value only when clearKeys explicitly includes it", async () => {
  const settings = await fixtureSettings("TMDB_API_KEY=abcd-secret-1234\n")
  await settings.update({}, ["TMDB_API_KEY"])
  expect(settings.get("TMDB_API_KEY")).toBe("")
})

it("rejects unknown keys and newline injection", async () => {
  const settings = await fixtureSettings("SYNC_ON_START=false\n")
  await expect(settings.update({ UNKNOWN_KEY: "x" }, [])).rejects.toThrow("未知配置项")
  await expect(settings.update({ HTTPS_PROXY: "ok\nINJECTED=yes" }, [])).rejects.toThrow("配置值不能包含换行")
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test --workspace backend -- runtimeSettings.test.ts`

Expected: FAIL because the settings modules do not exist.

- [ ] **Step 3: Implement field definitions and whitelisting**

`settingsFields.ts` must define global proxy fields and generate these keys for every catalog source:

```ts
export type SourceSettingSuffix = "ENABLED" | "PROXY_MODE" | "HTTP_PROXY" | "HTTPS_PROXY"

export function sourceEnvKey(sourceId: string, suffix: SourceSettingSuffix): string {
  return `SOURCE_${sourceId.toUpperCase()}_${suffix}`
}

export const GLOBAL_SETTING_KEYS = new Set([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "TVMAZE_BASE_URL",
  "TMDB_API_KEY",
  "TMDB_BASE_URL",
  "TMDB_IMAGE_BASE_URL",
  "TRAKT_CLIENT_ID",
  "TRAKT_CLIENT_SECRET",
  "TRAKT_ACCESS_TOKEN",
  "TRAKT_BASE_URL",
  "OMDB_API_KEY",
  "OMDB_BASE_URL",
  "THETVDB_API_KEY",
  "THETVDB_BASE_URL",
  "DOUBAN_COOKIE",
  "DOUBAN_BASE_URL"
])
```

Build `KNOWN_SETTING_KEYS` from the global set, every catalog `baseUrlKey`, catalog credential keys, and four generated keys for every source. `isSensitiveKey()` must treat proxy URLs, database URLs, cookies, tokens, secrets, passwords, and API keys as sensitive.

- [ ] **Step 4: Implement `EnvFileStore`**

The class must expose:

```ts
export class EnvFileStore {
  constructor(private readonly envPath: string) {}
  async read(): Promise<Record<string, string>>
  async update(values: Record<string, string>): Promise<void>
}
```

`update()` must:

1. Read the current file.
2. Copy it to `${envPath}.backup.local`.
3. Replace known `KEY=` lines while preserving comments and order.
4. Append missing keys once.
5. Write `${envPath}.tmp` with mode `0o600`.
6. Rename the temporary file over the original.
7. Remove the temporary file if any write or rename step fails.

Quote values with `JSON.stringify(value)` when they contain spaces, `#`, single quotes, or double quotes. Reject `\r` and `\n` before writing.

- [ ] **Step 5: Implement `RuntimeSettingsService`**

Expose this public API:

```ts
export class RuntimeSettingsService {
  constructor(private readonly store: EnvFileStore, initialValues?: Record<string, string>)
  async load(): Promise<void>
  snapshot(): Readonly<Record<string, string>>
  get(key: string, fallback?: string): string
  getBoolean(key: string, fallback: boolean): boolean
  view(overrides?: Record<string, string>): SettingsReader
  sourceProxyMode(sourceId: string): ProxyMode
  sourceEnabled(sourceId: string): boolean
  fieldView(key: string, label?: string): SettingsFieldView
  async update(values: Record<string, string>, clearKeys: string[]): Promise<void>
}
```

`SettingsReader` exposes `get(key, fallback?)`, `getBoolean(key, fallback)`, and `sourceProxyMode(sourceId)`. `view(overrides)` validates override keys and returns a read-only overlay without mutating the live snapshot. `update()` validates all keys and values, writes through `EnvFileStore`, and only then swaps its frozen snapshot. `fieldView()` returns `value: null` for sensitive fields and a maximum four-character suffix mask. `sourceEnabled()` returns false for every non-active catalog source regardless of environment values.

Create the production singleton with `path.resolve(process.cwd(), ".env")`, and call `load()` during server startup before registering the scheduler.

- [ ] **Step 6: Update `.env.example` without secrets**

Add empty global proxy and credential keys plus active source policy defaults:

```dotenv
HTTP_PROXY=""
HTTPS_PROXY=""
TVMAZE_BASE_URL="https://api.tvmaze.com"
TRAKT_BASE_URL="https://api.trakt.tv"
TRAKT_CLIENT_SECRET=""
TRAKT_ACCESS_TOKEN=""
THETVDB_API_KEY=""
THETVDB_BASE_URL="https://api4.thetvdb.com/v4"
SOURCE_TVMAZE_ENABLED=true
SOURCE_TVMAZE_PROXY_MODE=inherit
SOURCE_TMDB_ENABLED=true
SOURCE_TMDB_PROXY_MODE=inherit
SOURCE_YOUKU_ENABLED=true
SOURCE_YOUKU_PROXY_MODE=direct
SOURCE_IQIYI_ENABLED=true
SOURCE_IQIYI_PROXY_MODE=direct
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm run test --workspace backend -- runtimeSettings.test.ts
npm run typecheck --workspace backend
```

Expected: all tests pass and typecheck exits 0.

```bash
git add backend/src/settings backend/tests/runtimeSettings.test.ts backend/.env.example backend/src/server.ts
git commit -m "feat: 添加立即生效的运行时设置服务"
```

---

### Task 3: Source-Aware Proxy HTTP Client

**Files:**
- Modify: `backend/package.json`
- Modify: `package-lock.json`
- Create: `backend/src/settings/proxyResolver.ts`
- Create: `backend/src/utils/sourceHttpClient.ts`
- Create: `backend/tests/sourceHttpClient.test.ts`
- Modify: `backend/src/utils/http.ts`

**Interfaces:**
- Consumes: `RuntimeSettingsService`, `sourceEnvKey()`, `ProxyMode`
- Produces: `resolveProxy()`, `SourceHttpClient`, singleton `sourceHttpClient`, `SourceHttpError`

- [ ] **Step 1: Install the explicit proxy transport dependency**

Run: `npm install undici@^6.19.8 --workspace backend`

Expected: `backend/package.json` and `package-lock.json` contain `undici`.

- [ ] **Step 2: Write failing proxy resolution and transport tests**

Test exact mode behavior without making network requests:

```ts
it("uses protocol-specific global proxy in inherit mode", () => {
  const settings = fakeSettings({
    HTTP_PROXY: "http://proxy.test:8080",
    HTTPS_PROXY: "http://proxy.test:8443",
    SOURCE_TMDB_PROXY_MODE: "inherit"
  })
  expect(resolveProxy(settings, "tmdb", "http://example.com")).toBe("http://proxy.test:8080")
  expect(resolveProxy(settings, "tmdb", "https://example.com")).toBe("http://proxy.test:8443")
})

it("forces direct mode even when a global proxy exists", () => {
  const settings = fakeSettings({ HTTPS_PROXY: "http://proxy.test:8443", SOURCE_YOUKU_PROXY_MODE: "direct" })
  expect(resolveProxy(settings, "youku", "https://tv.youku.com")).toBeNull()
})

it("uses a source custom proxy", () => {
  const settings = fakeSettings({
    SOURCE_TMDB_PROXY_MODE: "custom",
    SOURCE_TMDB_HTTPS_PROXY: "http://custom.test:7890"
  })
  expect(resolveProxy(settings, "tmdb", "https://api.themoviedb.org")).toBe("http://custom.test:7890")
})

it("passes a dispatcher only when a proxy resolves", async () => {
  const transport = vi.fn(async () => new Response("{}", { status: 200 }))
  const client = new SourceHttpClient(fakeSettings({ HTTPS_PROXY: "http://proxy.test:7890" }), transport, () => fakeDispatcher)
  await client.fetchJson("tmdb", "https://api.example.test/data", { timeoutMs: 1000 })
  expect(transport.mock.calls[0][1]?.dispatcher).toBe(fakeDispatcher)
})
```

Define the test helpers above the tests:

```ts
import type { Dispatcher } from "undici"
import { vi } from "vitest"
import type { ProxyMode } from "@whatsnew/shared/settings"
import type { SettingsReader } from "../src/settings/runtimeSettingsService.js"
import { getSourceDefinition } from "../src/settings/sourceCatalog.js"
import { resolveProxy } from "../src/settings/proxyResolver.js"
import { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function fakeSettings(values: Record<string, string>): SettingsReader {
  return {
    get(key: string, fallback = "") {
      return values[key] ?? fallback
    },
    getBoolean(key: string, fallback: boolean) {
      if (!(key in values)) return fallback
      return values[key] === "true"
    },
    sourceProxyMode(sourceId: string) {
      return (values[`SOURCE_${sourceId.toUpperCase()}_PROXY_MODE`] ?? getSourceDefinition(sourceId).defaultProxyMode) as ProxyMode
    }
  }
}

const fakeDispatcher = {} as Dispatcher
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm run test --workspace backend -- sourceHttpClient.test.ts`

Expected: FAIL because proxy resolver and client do not exist.

- [ ] **Step 4: Implement `resolveProxy()`**

```ts
export function resolveProxy(settings: SettingsReader, sourceId: string, targetUrl: string): string | null {
  const mode = settings.sourceProxyMode(sourceId)
  if (mode === "direct") return null

  const protocolKey: "HTTP_PROXY" | "HTTPS_PROXY" = new URL(targetUrl).protocol === "http:" ? "HTTP_PROXY" : "HTTPS_PROXY"
  if (mode === "custom") {
    return settings.get(sourceEnvKey(sourceId, protocolKey)) || null
  }

  return settings.get(protocolKey) || null
}
```

- [ ] **Step 5: Implement `SourceHttpClient`**

The client must expose:

```ts
export class SourceHttpClient {
  constructor(
    private readonly settings: RuntimeSettingsService,
    private readonly transport = undiciFetch,
    private readonly createDispatcher = (proxyUrl: string) => new ProxyAgent(proxyUrl)
  ) {}

  async fetchJson<T>(sourceId: string, url: string, options: SourceRequestOptions): Promise<T>
  async fetchText(sourceId: string, url: string, options: SourceRequestOptions): Promise<string>
  async request(sourceId: string, url: string, options: SourceRequestOptions): Promise<Response>
}
```

Define request options exactly as:

```ts
export type SourceRequestOptions = Omit<RequestInit, "signal"> & {
  timeoutMs: number
  settingsOverride?: Record<string, string>
}
```

For each request, call `settings.view(options.settingsOverride)` and pass that reader to `resolveProxy()`. Cache dispatchers by exact proxy URL. Abort on timeout. Throw `SourceHttpError` with `statusCode`, `sourceId`, and a maximum 500-character response body snippet. Redact URL query values named `api_key`, `key`, `token`, and `access_token` from all messages.

Keep `backend/src/utils/http.ts` as a compatibility wrapper that delegates to `sourceHttpClient`; no external adapter may call global `fetch` after Task 4.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm run test --workspace backend -- sourceHttpClient.test.ts
npm run typecheck --workspace backend
```

Expected: PASS and exit 0.

```bash
git add backend/package.json package-lock.json backend/src/settings/proxyResolver.ts backend/src/utils/http.ts backend/src/utils/sourceHttpClient.ts backend/tests/sourceHttpClient.test.ts
git commit -m "feat: 添加按数据源选择代理的请求层"
```

---

### Task 4: Migrate Active Adapters And Dynamic Scheduler

**Files:**
- Modify: `backend/src/adapters/tmdbAdapter.ts`
- Modify: `backend/src/adapters/tvmazeAdapter.ts`
- Modify: `backend/src/adapters/youkuAdapter.ts`
- Modify: `backend/src/adapters/iqiyiAdapter.ts`
- Modify: `backend/src/scheduler.ts`
- Modify: `backend/src/routes/sources.ts`
- Create: `backend/src/adapters/adapterRegistry.ts`
- Modify tests: `backend/tests/tmdbAdapter.test.ts`, `backend/tests/tvmazeAdapter.test.ts`, `backend/tests/youkuAdapter.test.ts`, `backend/tests/iqiyiAdapter.test.ts`, `backend/tests/scheduler.test.ts`

**Interfaces:**
- Consumes: `runtimeSettings`, `SourceHttpClient`, `sourceHttpClient`, `SOURCE_CATALOG`
- Produces: `implementedAdapters`, `getEnabledAdapters()`, `getEnabledAdapter(sourceId)`

- [ ] **Step 1: Write failing adapter and scheduler tests**

For each adapter test, inject a fake `SourceHttpClient` and assert it receives the source id. Add this scheduler behavior:

```ts
it("resolves enabled adapters at execution time", async () => {
  mocks.settings.sourceEnabled.mockImplementation((sourceId: string) => sourceId !== "tmdb")
  const { registerScheduler } = await import("../src/scheduler.js")
  registerScheduler()
  await mocks.schedule.mock.calls[0][1]()

  expect(mocks.runSourceSync).not.toHaveBeenCalledWith(mocks.db, mocks.tmdbAdapter)
  expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.tvmazeAdapter)
})
```

Add a second assertion that changing `sourceEnabled("tmdb")` to true before the next scheduled callback includes TMDb without restarting.

- [ ] **Step 2: Run adapter and scheduler tests and verify RED**

Run:

```bash
npm run test --workspace backend -- tmdbAdapter.test.ts tvmazeAdapter.test.ts youkuAdapter.test.ts iqiyiAdapter.test.ts scheduler.test.ts
```

Expected: FAIL because adapters still call `fetchJson` or global `fetch`, and the scheduler uses a fixed array.

- [ ] **Step 3: Create the adapter registry**

```ts
export const implementedAdapters = {
  tvmaze: tvmazeAdapter,
  tmdb: tmdbAdapter,
  youku: youkuAdapter,
  iqiyi: iqiyiAdapter
} as const

export function getEnabledAdapters() {
  return Object.entries(implementedAdapters)
    .filter(([sourceId]) => runtimeSettings.sourceEnabled(sourceId))
    .map(([, adapter]) => adapter)
}

export function getEnabledAdapter(sourceId: string) {
  const adapter = implementedAdapters[sourceId as keyof typeof implementedAdapters]
  if (!adapter || !runtimeSettings.sourceEnabled(sourceId)) return null
  return adapter
}
```

- [ ] **Step 4: Migrate adapter configuration reads**

Each `create*Adapter` accepts optional `httpClient` and `settings`. At the start of `fetchItems()`, resolve Base URL, credentials, and image URL from the current settings snapshot unless an explicit test option overrides them. Use these source IDs for every HTTP request:

```ts
await httpClient.fetchJson<T>("tmdb", url, { headers, timeoutMs: TMDB_TIMEOUT_MS })
await httpClient.fetchJson<T>("tvmaze", url, { timeoutMs: TVMAZE_TIMEOUT_MS })
await httpClient.fetchText("youku", page.url, { headers: USER_AGENT_HEADERS, timeoutMs: YOUKU_TIMEOUT_MS })
await httpClient.fetchText("iqiyi", url, { headers: USER_AGENT_HEADERS, timeoutMs: IQIYI_TIMEOUT_MS })
```

Do not remove each adapter's own `RateLimiter`. Resolve settings once per `fetchItems()` so a running sync remains internally consistent.

- [ ] **Step 5: Make scheduler and source sync routes dynamic**

Replace the scheduler's fixed adapter array with `getEnabledAdapters()` inside both initial and cron loops. Replace the route-local adapter map with `getEnabledAdapter(req.params.source)`. Return:

- `404 source_not_implemented` when the catalog entry has no adapter.
- `409 source_disabled` when an implemented source is disabled.
- Existing sync result when enabled.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm run test --workspace backend -- tmdbAdapter.test.ts tvmazeAdapter.test.ts youkuAdapter.test.ts iqiyiAdapter.test.ts scheduler.test.ts api.test.ts
npm run typecheck --workspace backend
```

Expected: all tests pass.

```bash
git add backend/src/adapters backend/src/scheduler.ts backend/src/routes/sources.ts backend/tests
git commit -m "refactor: 迁移现有数据源到运行时配置"
```

---

### Task 5: Settings And Connectivity APIs

**Files:**
- Create: `backend/src/services/connectionTestService.ts`
- Create: `backend/src/routes/settings.ts`
- Modify: `backend/src/routes/sources.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/settingsApi.test.ts`

**Interfaces:**
- Consumes: `runtimeSettings`, `SOURCE_CATALOG`, `sourceHttpClient`, Prisma latest `SourceSyncRun`
- Produces: `GET/PUT /api/settings`, `POST /api/settings/proxy/test`, `POST /api/sources/:source/test`

- [ ] **Step 1: Write failing API tests**

Cover these exact contracts:

```ts
it("returns masked settings and every catalog source", async () => {
  const response = await request(createApp()).get("/api/settings")
  expect(response.status).toBe(200)
  expect(response.body.sources).toHaveLength(20)
  expect(response.body.proxyFields.find((field: any) => field.key === "HTTPS_PROXY").value).toBeNull()
  expect(JSON.stringify(response.body)).not.toContain("secret-proxy-password")
})

it("updates settings immediately without accepting unknown keys", async () => {
  const response = await request(createApp()).put("/api/settings").send({
    values: { SOURCE_TMDB_PROXY_MODE: "direct" },
    clearKeys: []
  })
  expect(response.body).toEqual({ success: true, effectiveImmediately: true })
  expect(testSettings.sourceProxyMode("tmdb")).toBe("direct")

  const rejected = await request(createApp()).put("/api/settings").send({ values: { EVIL: "1" }, clearKeys: [] })
  expect(rejected.status).toBe(400)
})

it("tests a planned source without making it active", async () => {
  const response = await request(createApp()).post("/api/sources/imdb/test")
  expect(response.status).toBe(200)
  expect(response.body.implementationStatus).toBe("planned")
  expect(response.body.result.mode).toBe("source")
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test --workspace backend -- settingsApi.test.ts`

Expected: 404 responses because settings and connection-test routes are missing.

- [ ] **Step 3: Implement connection error classification**

`connectionTestService.ts` must map:

- `AbortError` to `timeout`.
- `ENOTFOUND` or `EAI_AGAIN` to `dns_error`.
- proxy connection refusal while a proxy is selected to `proxy_unreachable`.
- HTTP 401 to `unauthorized`.
- HTTP 403 with body or server header containing `cloudflare` to `cloudflare_blocked`, otherwise `forbidden`.
- missing catalog credentials to `credential_missing` before network access.
- a commercial API operation that explicitly requires unavailable commercial credentials to `commercial_access_required`; the catalog's public-page reachability test still performs a network request.
- all other HTTP failures to `http_error` and remaining failures to `unknown`.

The service returns `ConnectionTestResult`, never throws raw network errors to a route, and truncates the Chinese message to 500 characters after redaction.

- [ ] **Step 4: Implement settings routes**

`GET /api/settings` joins catalog definitions, runtime field views, and each source's latest sync run. `PUT /api/settings` parses this Zod schema:

```ts
const updateSchema = z.object({
  values: z.record(z.string()),
  clearKeys: z.array(z.string()).default([])
})
```

`POST /api/settings/proxy/test` accepts optional unsaved `HTTP_PROXY` and `HTTPS_PROXY` values and returns three results for `direct`, `http_proxy`, and `https_proxy`. Use `http://example.com/` and `https://example.com/` with a 10-second timeout.

`POST /api/sources/:source/test` looks up the catalog entry, executes its `testUrl` through the source client, and returns both immutable `implementationStatus` and the connection result.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test --workspace backend -- settingsApi.test.ts api.test.ts
npm run typecheck --workspace backend
```

Expected: all tests pass.

```bash
git add backend/src/services/connectionTestService.ts backend/src/routes/settings.ts backend/src/routes/sources.ts backend/src/app.ts backend/tests/settingsApi.test.ts
git commit -m "feat: 添加设置与数据源连通性接口"
```

---

### Task 6: Global Proxy Settings Page

**Files:**
- Modify: `frontend/package.json`
- Modify: `package-lock.json`
- Create: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/styles.css`
- Create: `frontend/tests/settingsPage.test.tsx`

**Interfaces:**
- Consumes: `SettingsResponse`, `SettingsUpdateRequest`, `SettingsUpdateResponse`, `ConnectionTestResult`
- Produces: `/settings` route with global proxy editing, testing, and immediate-save state

- [ ] **Step 1: Install the interaction-test dependency**

Run: `npm install -D @testing-library/user-event@^14.5.2 --workspace frontend`

Expected: `frontend/package.json` and `package-lock.json` contain `@testing-library/user-event`.

- [ ] **Step 2: Write failing navigation and proxy form tests**

```tsx
it("opens settings and keeps stored proxy secrets masked", async () => {
  mockSettingsApi()
  renderRoute("/settings")
  expect(await screen.findByRole("heading", { name: "系统设置" })).toBeInTheDocument()
  expect(screen.getByLabelText("HTTPS 代理")).toHaveAttribute("type", "password")
  expect(screen.queryByDisplayValue("http://secret-proxy.test:7890")).not.toBeInTheDocument()
})

it("saves a changed proxy and reports immediate effect", async () => {
  const fetchSpy = mockSettingsApi()
  renderRoute("/settings")
  await userEvent.type(await screen.findByLabelText("HTTPS 代理"), "http://proxy.test:7890")
  await userEvent.click(screen.getByRole("button", { name: "保存设置" }))
  expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/settings"), expect.objectContaining({ method: "PUT" }))
  expect(await screen.findByText("设置已立即生效")).toBeInTheDocument()
})
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm run test --workspace frontend -- settingsPage.test.tsx`

Expected: FAIL because `/settings` and the page do not exist.

- [ ] **Step 4: Add settings navigation and types**

Add `{ to: "/settings", label: "设置", icon: Settings }` after the sources navigation item and mount `<Route path="/settings" element={<SettingsPage />} />`. Re-export settings contracts from `@whatsnew/shared/settings` in `frontend/src/api/types.ts`.

- [ ] **Step 5: Implement the global proxy form**

`SettingsPage` must:

- Load `GET /api/settings` with query key `settings`.
- Hold only changed values in local state.
- Render HTTP and HTTPS password inputs with masked placeholders.
- Provide eye icons that reveal only newly typed local values.
- Send `{ values: changedValues, clearKeys }` to `PUT /api/settings`.
- Clear local values and invalidate the query after success.
- Show `设置已立即生效` only after a successful response.
- Send unsaved values to `POST /api/settings/proxy/test` and render the three returned results.

Use `Save`, `Eye`, `EyeOff`, `PlugZap`, and `Settings` Lucide icons. Do not add explanatory feature copy or nested cards.

- [ ] **Step 6: Add responsive styles**

Add stable `.settingsLayout`, `.proxySettings`, `.settingsActions`, `.connectionResults`, and `.sourceTable` dimensions. At widths below 720px, stack proxy fields and actions, preserve at least 44px button targets, and allow the source table to scroll horizontally without causing page-level overflow.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm run test --workspace frontend -- settingsPage.test.tsx app.test.tsx
npm run typecheck --workspace frontend
```

Expected: all tests pass.

```bash
git add frontend/package.json package-lock.json frontend/src/pages/SettingsPage.tsx frontend/src/App.tsx frontend/src/api/types.ts frontend/src/styles.css frontend/tests/settingsPage.test.tsx
git commit -m "feat: 添加立即生效的代理设置界面"
```

---

### Task 7: Source Registry And Configuration Dialog

**Files:**
- Create: `frontend/src/components/SourceConfigDialog.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/tests/settingsPage.test.tsx`

**Interfaces:**
- Consumes: `SourceSettingsView`, settings PUT API, source test API, existing source sync API
- Produces: grouped source registry with enable, proxy mode, test, sync, and credential controls

- [ ] **Step 1: Add failing source registry tests**

```tsx
it("keeps planned and commercial sources visible but not enableable", async () => {
  mockSettingsApi()
  renderRoute("/settings")
  expect(await screen.findByText("IMDb")).toBeInTheDocument()
  expect(screen.getByText("JustWatch")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "启用 IMDb" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "同步 JustWatch" })).toBeDisabled()
})

it("changes active source proxy mode and tests connectivity", async () => {
  const fetchSpy = mockSettingsApi()
  renderRoute("/settings")
  await userEvent.click(await screen.findByRole("button", { name: "TMDb 直连" }))
  await userEvent.click(screen.getByRole("button", { name: "测试 TMDb" }))
  expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/sources/tmdb/test"), expect.any(Object))
})

it("never reveals a stored credential in the source dialog", async () => {
  mockSettingsApi()
  renderRoute("/settings")
  await userEvent.click(await screen.findByRole("button", { name: "配置 TMDb" }))
  expect(screen.getByLabelText("TMDb API Key")).toHaveValue("")
  expect(screen.getByText("已配置 ••••••••1234")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test --workspace frontend -- settingsPage.test.tsx`

Expected: FAIL because the registry controls and dialog do not exist.

- [ ] **Step 3: Implement grouped source table**

Render source groups in catalog order. Each row includes name, description, implementation status, enable checkbox, `inherit/direct/custom` segmented control, credentials status, latest run, and icon buttons for test, sync, and configure. Use tooltips for icon-only buttons.

Rules:

- Enable and sync are disabled unless `implementationStatus === "active"` and the capability flag is true.
- `blocked`, `planned`, and `commercial` status labels remain immutable.
- Changing enable or proxy mode saves that one generated key immediately.
- Testing never changes implementation status.
- Sync invalidates `settings`, `sources`, and `dashboard` queries after success.

- [ ] **Step 4: Implement `SourceConfigDialog`**

Use a real modal dialog with `role="dialog"`, focusable close icon, source title, credential/Base URL fields, custom proxy fields, clear checkboxes for configured sensitive values, cancel, and save. The component accepts:

```ts
type SourceConfigDialogProps = {
  source: SourceSettingsView
  open: boolean
  onClose: () => void
  onSave: (request: SettingsUpdateRequest) => Promise<void>
}
```

Never populate a sensitive input from `maskedValue`; render the mask as adjacent status text. Show custom proxy inputs only when proxy mode is `custom`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test --workspace frontend -- settingsPage.test.tsx pages.test.tsx app.test.tsx
npm run typecheck --workspace frontend
npm run build --workspace frontend
```

Expected: all commands pass.

```bash
git add frontend/src/components/SourceConfigDialog.tsx frontend/src/pages/SettingsPage.tsx frontend/src/styles.css frontend/tests/settingsPage.test.tsx
git commit -m "feat: 添加数据源设置与连通性面板"
```

---

### Task 8: Safe Proxy Import And End-To-End Verification

**Files:**
- Modify, ignored: `backend/.env`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-06-20-settings-source-registry-design.md` only if implementation behavior differs and the difference has been deliberately accepted

**Interfaces:**
- Consumes: complete settings UI, runtime service, source HTTP client, active adapters
- Produces: verified local runtime with real proxy configuration and operational settings page

- [ ] **Step 1: Import existing proxy values without printing them**

Use a short shell command or Node script that reads PixelReel's `express-backend/.env`, copies only existing `HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, and `https_proxy` values into WhatsNew's ignored `backend/.env`, and prints only this shape:

```json
{"HTTP_PROXY":"configured|missing","HTTPS_PROXY":"configured|missing"}
```

Do not echo, log, diff, or commit actual values.

- [ ] **Step 2: Run the full automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: backend and frontend test suites pass, all three workspaces typecheck, production build exits 0, and `git diff --check` prints nothing.

- [ ] **Step 3: Verify immediate runtime behavior**

With backend and frontend running on `19993` and `19992`:

1. Read `GET /api/settings`; verify sensitive values are masked and all 20 catalog entries exist.
2. Save a harmless proxy mode change for TMDb; verify `effectiveImmediately: true`.
3. Call `POST /api/sources/tmdb/test` without restarting; verify the response reports the newly selected path.
4. Restore the intended TMDb mode.
5. Test TVmaze, TMDb, Trakt, IMDb, TheTVDB, JustWatch, FlixPatrol, Youku, iQIYI, Tencent Video, MangoTV, Bilibili, Douban, and Mtime.
6. Record only status, duration, HTTP status, and classified error; never record credentials or proxy URLs.

- [ ] **Step 4: Verify UI at desktop and mobile widths**

Use the in-app browser on `http://127.0.0.1:19992/settings` and inspect at 1440x900 and 390x844. Confirm:

- no page-level horizontal overflow;
- proxy inputs and save/test actions remain usable;
- source table remains readable or scrolls within its own region;
- dialog fits the viewport and can close;
- sensitive saved values never appear in DOM text or input values;
- source states and disabled controls match backend capability flags.

- [ ] **Step 5: Update README**

Document the private-LAN security boundary, settings URL, immediate-effect semantics, proxy modes, and the rule that planned/commercial entries are catalog visibility rather than implemented adapters.

- [ ] **Step 6: Commit runtime-safe documentation and any final verified fixes**

```bash
git add README.md docs/superpowers/specs/2026-06-20-settings-source-registry-design.md
git commit -m "docs: 更新设置与数据源运行说明"
```

Do not stage `backend/.env` or its local backup.

---

## Completion Gate

Before marking this plan complete, prove every item below from current state:

- `GET /api/settings` returns no sensitive plaintext.
- `PUT /api/settings` atomically persists an allowlisted change and updates runtime behavior without restart.
- Global and per-source proxy modes select the correct path for HTTP and HTTPS targets.
- TMDb, TVmaze, Youku, and iQIYI use the unified source HTTP client and retain independent 2-second rate limiting.
- Scheduler and manual sync obey source enable settings at execution time.
- All 20 approved sources appear with honest implementation status.
- Planned or commercial sources cannot be enabled or synchronized.
- Proxy and source tests classify failures without writing media data.
- Settings UI supports proxy editing, masked credentials, source proxy policy, testing, and sync controls.
- PixelReel proxy import leaves no secret in Git output or tracked files.
- Full tests, typecheck, build, live API checks, and desktop/mobile browser checks pass.
