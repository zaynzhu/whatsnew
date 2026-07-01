# International Platform Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first batch of official international platform release sources: Hulu Press Schedule, Disney+ New to Disney+, and Max WBD Pressroom.

**Architecture:** Keep scraping narrow and explainable: parsers convert official HTML into `PlatformReleaseCandidate` records, adapters map candidates to existing `AdapterItem` objects, and source sync persists them through the existing matcher. Hulu, Disney+, and Max become daily, disabled-by-default active sources; Prime Video and Apple TV+ stay non-runnable planned sources with corrected semantics.

**Tech Stack:** TypeScript, Express, Prisma, Vitest, npm workspaces, `SourceHttpClient`, `RateLimiter`, `cheerio@1.0.0` for HTML parsing.

## Global Constraints

- 电影与剧集必须保留明确的 `mediaType`，不得把不同类型合并为同一作品。
- 热度信号必须保留来源、平台、地区和时间窗口，不生成无法解释的跨源真实排名。
- 所有外部 API 请求必须使用统一限频机制，同一服务连续请求间隔不低于 2 秒。
- 不绕过登录、地区限制、App 限制、验证码、DRM 或付费墙。
- 不使用 Playwright/真实浏览器作为后台定时采集依赖。
- 首版不把 Prime Video 或 Apple TV+ 客户端集合页默认启用。
- 首版 Hulu、Disney+、Max 不生成 `PopularitySignal`。
- 首版不改动 MySQL schema；如果现有 `Release` / `MediaItem` 无法表达官方上新，先停止并补设计。
- `backend/.env`、代理地址、API Key、Token、Cookie 和数据库凭据不得提交或输出到日志。
- Commit 使用 `type: 中文描述`，每次只提交一个独立变更。

---

## File Structure

- Modify `backend/package.json` and `package-lock.json`: add `cheerio@1.0.0`.
- Create `backend/src/adapters/platformPageUtils.ts`: shared text cleanup, English date parsing, stable source IDs, media classification and `AdapterItem` mapping for platform release pages.
- Create `backend/tests/platformPageUtils.test.ts`: shared utility coverage.
- Create `backend/src/adapters/huluScheduleParser.ts`: parse Hulu Press Schedule HTML tables.
- Create `backend/src/adapters/huluAdapter.ts`: fetch Hulu schedule and map candidates to `AdapterItem[]`.
- Create `backend/tests/huluAdapter.test.ts`: parser and adapter tests.
- Create `backend/src/adapters/disneyPlusParser.ts`: parse Disney+ New to Disney+ article content.
- Create `backend/src/adapters/disneyPlusAdapter.ts`: fetch Disney+ page and map candidates to `AdapterItem[]`.
- Create `backend/tests/disneyPlusAdapter.test.ts`: parser and adapter tests.
- Create `backend/src/adapters/maxPressParser.ts`: parse WBD Pressroom monthly What's New pages.
- Create `backend/src/adapters/maxAdapter.ts`: fetch Max press page and map candidates to `AdapterItem[]`.
- Create `backend/tests/maxAdapter.test.ts`: parser and adapter tests.
- Modify `backend/src/settings/sourceCatalog.ts`: activate Hulu, Disney+, Max; correct Prime Video and Apple TV+ semantics.
- Modify `backend/src/adapters/adapterRegistry.ts`: register the three new daily adapters.
- Modify `backend/src/scripts/syncHulu.ts`, `backend/src/scripts/syncDisneyPlus.ts`, `backend/src/scripts/syncMax.ts`: manual sync commands.
- Modify `backend/tests/sourceCatalog.test.ts`, `backend/tests/scheduler.test.ts`, `backend/tests/api.test.ts`: catalog, scheduling and source route expectations.
- Modify `README.md`: document the three new official platform sources and the planned status of Prime Video / Apple TV+.

## Task 1: Shared HTML Platform Utilities

**Files:**
- Modify: `backend/package.json`
- Modify: `package-lock.json`
- Create: `backend/src/adapters/platformPageUtils.ts`
- Create: `backend/tests/platformPageUtils.test.ts`

**Interfaces:**
- Produces:
  - `PlatformReleaseCandidate`
  - `PlatformAdapterConfig`
  - `cleanPlatformText(value: string | null | undefined): string | null`
  - `parseEnglishReleaseDate(text: string, fallbackYear: number): string | null`
  - `candidateToAdapterItem(config: PlatformAdapterConfig, candidate: PlatformReleaseCandidate, today: string): AdapterItem | null`
- Consumes: existing `AdapterItem`, `MediaType`, `ReleaseForm`.

- [ ] **Step 1: Install HTML parser dependency**

Run:

```bash
npm install cheerio@1.0.0 --workspace backend
```

Expected: `backend/package.json` gains `cheerio`, and `package-lock.json` changes.

- [ ] **Step 2: Write failing utility tests**

Create `backend/tests/platformPageUtils.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  candidateToAdapterItem,
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformAdapterConfig
} from "../src/adapters/platformPageUtils.js"

const config: PlatformAdapterConfig = {
  source: "hulu",
  platform: "Hulu",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: "https://press.hulu.com/schedule/"
}

describe("platformPageUtils", () => {
  it("cleans repeated whitespace and html entities from platform text", () => {
    expect(cleanPlatformText("  The&nbsp;Bear\\n Season 5  ")).toBe("The Bear Season 5")
    expect(cleanPlatformText("   ")).toBeNull()
  })

  it("parses English release dates with the supplied year", () => {
    expect(parseEnglishReleaseDate("July 1", 2026)).toBe("2026-07-01")
    expect(parseEnglishReleaseDate("Jul. 9, 2026", 2025)).toBe("2026-07-09")
    expect(parseEnglishReleaseDate("Coming soon", 2026)).toBeNull()
  })

  it("maps clear platform candidates to release-only adapter items", () => {
    const item = candidateToAdapterItem(config, {
      title: "The Bear: Complete Season 5",
      sourceContentType: "series",
      releaseDate: "2026-07-01",
      description: "FX series returns",
      labels: ["Complete Season 5"],
      sourceUrl: "https://press.hulu.com/schedule/"
    }, "2026-07-01")

    expect(item?.media).toMatchObject({
      source: "hulu",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "The Bear: Complete Season 5",
      firstReleaseDate: "2026-07-01",
      status: "released"
    })
    expect(item?.media.sourceId).toMatch(/^hulu-[a-f0-9]{12}$/)
    expect(item?.releases[0]).toMatchObject({
      platform: "Hulu",
      region: "US",
      releaseDate: "2026-07-01",
      releasePattern: "platform_schedule",
      releaseStatus: "airing_today",
      source: "hulu"
    })
    expect(item?.popularitySignals).toEqual([])
  })

  it("skips candidates without a concrete date or media type", () => {
    expect(candidateToAdapterItem(config, {
      title: "Ambiguous Showcase",
      sourceContentType: "collection",
      releaseDate: "2026-07-01",
      description: null,
      labels: [],
      sourceUrl: "https://press.hulu.com/schedule/"
    }, "2026-07-01")).toBeNull()

    expect(candidateToAdapterItem(config, {
      title: "Movie Without Day",
      sourceContentType: "movie",
      releaseDate: null,
      description: null,
      labels: ["Movie"],
      sourceUrl: "https://press.hulu.com/schedule/"
    }, "2026-07-01")).toBeNull()
  })
})
```

- [ ] **Step 3: Run failing utility tests**

Run:

```bash
npm test --workspace backend -- platformPageUtils
```

Expected: FAIL because `platformPageUtils.ts` does not exist.

- [ ] **Step 4: Implement shared utility module**

Create `backend/src/adapters/platformPageUtils.ts`:

```ts
import { createHash } from "node:crypto"
import type { MediaType, ReleaseForm } from "@whatsnew/shared/media"
import type { AdapterItem } from "../domain/types.js"

export type PlatformReleaseCandidate = {
  title: string
  sourceContentType: string
  releaseDate: string | null
  description: string | null
  labels: string[]
  sourceUrl: string
}

export type PlatformAdapterConfig = {
  source: "hulu" | "disney_plus" | "max"
  platform: "Hulu" | "Disney+" | "Max"
  region: string
  defaultLanguage: string | null
  defaultGenres: string[]
  sourceUrl: string
}

type PlatformClassification = {
  mediaType: MediaType
  releaseForm: ReleaseForm
}

const MONTHS: Record<string, string> = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  sept: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12"
}

export function cleanPlatformText(value: string | null | undefined): string | null {
  const cleaned = value
    ?.replace(/&nbsp;/gi, " ")
    .replace(/\\s+/g, " ")
    .trim()

  return cleaned || null
}

export function parseEnglishReleaseDate(text: string, fallbackYear: number): string | null {
  const normalized = text.replace(/,/g, " ").replace(/\\./g, "").replace(/\\s+/g, " ").trim()
  const match = normalized.match(/\\b([A-Za-z]+)\\s+(\\d{1,2})(?:\\s+(\\d{4}))?\\b/)
  if (!match) return null

  const month = MONTHS[match[1].toLowerCase()]
  if (!month) return null

  const day = match[2].padStart(2, "0")
  const year = match[3] ?? String(fallbackYear)

  return `${year}-${month}-${day}`
}

function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12)
}

function classifyCandidate(candidate: PlatformReleaseCandidate): PlatformClassification | null {
  const combined = [
    candidate.sourceContentType,
    candidate.title,
    candidate.description,
    ...candidate.labels
  ].filter(Boolean).join(" ").toLowerCase()

  if (combined.includes("documentary") || combined.includes("docuseries")) {
    if (combined.includes("film") || combined.includes("movie")) {
      return { mediaType: "documentary", releaseForm: "documentary_film" }
    }
    return { mediaType: "documentary", releaseForm: "documentary_series" }
  }

  if (combined.includes("movie") || combined.includes("film")) {
    return { mediaType: "movie", releaseForm: "streaming_movie" }
  }

  if (
    combined.includes("series") ||
    combined.includes("season") ||
    combined.includes("episode") ||
    combined.includes("show")
  ) {
    return { mediaType: "series", releaseForm: "tv_series" }
  }

  if (combined.includes("special") || combined.includes("reality")) {
    return { mediaType: "variety", releaseForm: "variety_season" }
  }

  return null
}

function mediaStatus(releaseDate: string, today: string): "upcoming" | "released" {
  return releaseDate > today ? "upcoming" : "released"
}

function releaseStatus(releaseDate: string, today: string): "upcoming" | "airing_today" | "available" {
  if (releaseDate > today) return "upcoming"
  if (releaseDate === today) return "airing_today"
  return "available"
}

export function candidateToAdapterItem(
  config: PlatformAdapterConfig,
  candidate: PlatformReleaseCandidate,
  today: string
): AdapterItem | null {
  const title = cleanPlatformText(candidate.title)
  if (!title || !candidate.releaseDate) return null

  const classification = classifyCandidate(candidate)
  if (!classification) return null

  const sourceId = `${config.source}-${stableHash([
    title,
    candidate.releaseDate,
    candidate.sourceUrl
  ].join("|"))}`
  const status = mediaStatus(candidate.releaseDate, today)

  return {
    media: {
      source: config.source,
      sourceId,
      mediaType: classification.mediaType,
      releaseForm: classification.releaseForm,
      sourceContentType: candidate.sourceContentType,
      titleDisplay: title,
      titleOriginal: null,
      titleAliases: [],
      overview: candidate.description,
      posterUrl: null,
      productionCountries: [],
      originalLanguage: config.defaultLanguage,
      genres: config.defaultGenres,
      firstReleaseDate: candidate.releaseDate,
      status,
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [{
      platform: config.platform,
      region: config.region,
      releaseDate: candidate.releaseDate,
      releaseTime: null,
      releasePattern: "platform_schedule",
      releaseStatus: releaseStatus(candidate.releaseDate, today),
      seasonNumber: null,
      episodeNumber: null,
      source: config.source,
      sourceUrl: candidate.sourceUrl
    }],
    popularitySignals: []
  }
}
```

- [ ] **Step 5: Run utility tests**

Run:

```bash
npm test --workspace backend -- platformPageUtils
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json package-lock.json backend/src/adapters/platformPageUtils.ts backend/tests/platformPageUtils.test.ts
git commit -m "feat: 添加平台页面解析工具"
```

## Task 2: Hulu Press Schedule Adapter

**Files:**
- Create: `backend/src/adapters/huluScheduleParser.ts`
- Create: `backend/src/adapters/huluAdapter.ts`
- Create: `backend/tests/huluAdapter.test.ts`

**Interfaces:**
- Consumes:
  - `PlatformReleaseCandidate`
  - `candidateToAdapterItem(config, candidate, today)`
- Produces:
  - `parseHuluSchedule(html: string, sourceUrl: string, fallbackYear: number): PlatformReleaseCandidate[]`
  - `createHuluAdapter(options?: HuluAdapterOptions): SourceAdapter`
  - `huluAdapter`

- [ ] **Step 1: Write failing Hulu parser and adapter tests**

Create `backend/tests/huluAdapter.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { createHuluAdapter } from "../src/adapters/huluAdapter.js"
import { parseHuluSchedule } from "../src/adapters/huluScheduleParser.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function fakeSettings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-hulu-env"), values)
}

const scheduleHtml = `
  <html>
    <body>
      <table>
        <tr><th>Date</th><th>Title</th><th>Network</th><th>Status</th></tr>
        <tr>
          <td>July 1</td>
          <td>The Bear: Complete Season 5</td>
          <td>FX</td>
          <td>Added</td>
        </tr>
        <tr>
          <td>July 2, 2026</td>
          <td>Sci-Fi Movie</td>
          <td>Hulu Original</td>
          <td>Premiere</td>
        </tr>
        <tr>
          <td>July 3</td>
          <td>Ambiguous Showcase</td>
          <td>Hulu</td>
          <td>Added</td>
        </tr>
      </table>
    </body>
  </html>
`

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("Hulu schedule parser", () => {
  it("parses schedule table rows into dated release candidates", () => {
    const rows = parseHuluSchedule(scheduleHtml, "https://press.hulu.com/schedule/", 2026)

    expect(rows).toEqual([
      expect.objectContaining({
        title: "The Bear: Complete Season 5",
        sourceContentType: "series",
        releaseDate: "2026-07-01",
        labels: expect.arrayContaining(["FX", "Added"])
      }),
      expect.objectContaining({
        title: "Sci-Fi Movie",
        sourceContentType: "movie",
        releaseDate: "2026-07-02"
      }),
      expect.objectContaining({
        title: "Ambiguous Showcase",
        sourceContentType: "unknown",
        releaseDate: "2026-07-03"
      })
    ])
  })

  it("throws when the schedule page contains no usable dated rows", () => {
    expect(() => parseHuluSchedule("<html><table></table></html>", "https://press.hulu.com/schedule/", 2026))
      .toThrow("Hulu schedule 没有可解析条目")
  })
})

describe("Hulu adapter", () => {
  it("fetches the official schedule and maps only classifiable dated rows", async () => {
    const fetchText = vi.fn(async () => scheduleHtml)
    const adapter = createHuluAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      settings: fakeSettings({ HTTPS_PROXY: "http://proxy.test:7890" }),
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    const items = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledWith(
      "hulu",
      "https://press.hulu.com/schedule/",
      expect.objectContaining({
        timeoutMs: 30000,
        settingsOverride: expect.objectContaining({
          HTTPS_PROXY: "http://proxy.test:7890",
          SOURCE_HULU_PROXY_MODE: "inherit"
        })
      })
    )
    expect(items).toHaveLength(2)
    expect(items[0].media).toMatchObject({
      source: "hulu",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "The Bear: Complete Season 5",
      firstReleaseDate: "2026-07-01"
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "Hulu",
      region: "US",
      releaseDate: "2026-07-01",
      releaseStatus: "airing_today",
      sourceUrl: "https://press.hulu.com/schedule/"
    })
    expect(items[0].popularitySignals).toEqual([])
  })
})
```

- [ ] **Step 2: Run failing Hulu tests**

Run:

```bash
npm test --workspace backend -- huluAdapter
```

Expected: FAIL because Hulu parser and adapter files do not exist.

- [ ] **Step 3: Implement Hulu schedule parser**

Create `backend/src/adapters/huluScheduleParser.ts`:

```ts
import { load } from "cheerio"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

function inferContentType(title: string, labels: string[]): string {
  const text = [title, ...labels].join(" ").toLowerCase()
  if (text.includes("movie") || text.includes("film")) return "movie"
  if (text.includes("season") || text.includes("series") || text.includes("episode")) return "series"
  if (text.includes("documentary")) return "documentary"
  if (text.includes("special")) return "special"
  return "unknown"
}

export function parseHuluSchedule(
  html: string,
  sourceUrl: string,
  fallbackYear: number
): PlatformReleaseCandidate[] {
  const $ = load(html)
  const candidates: PlatformReleaseCandidate[] = []

  $("tr").each((_index, row) => {
    const cells = $(row).find("td").map((_cellIndex, cell) => {
      return cleanPlatformText($(cell).text())
    }).get().filter((value): value is string => value != null)

    if (cells.length < 2) return
    const releaseDate = parseEnglishReleaseDate(cells[0], fallbackYear)
    const title = cleanPlatformText(cells[1])
    if (!releaseDate || !title) return

    const labels = cells.slice(2)
    candidates.push({
      title,
      sourceContentType: inferContentType(title, labels),
      releaseDate,
      description: labels.length > 0 ? labels.join(" · ") : null,
      labels,
      sourceUrl
    })
  })

  if (candidates.length === 0) throw new Error("Hulu schedule 没有可解析条目")
  return candidates
}
```

- [ ] **Step 4: Implement Hulu adapter**

Create `backend/src/adapters/huluAdapter.ts`:

```ts
import type { SourceAdapter } from "../domain/types.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"
import {
  candidateToAdapterItem,
  type PlatformAdapterConfig
} from "./platformPageUtils.js"
import { parseHuluSchedule } from "./huluScheduleParser.js"

type HuluAdapterOptions = {
  url?: string
  minIntervalMs?: number
  today?: () => string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const HULU_SCHEDULE_URL = "https://press.hulu.com/schedule/"
const HULU_TIMEOUT_MS = 30000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000

function todayLocalDate(): string {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

const CONFIG: PlatformAdapterConfig = {
  source: "hulu",
  platform: "Hulu",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: HULU_SCHEDULE_URL
}

export function createHuluAdapter(options: HuluAdapterOptions = {}): SourceAdapter {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const today = options.today ?? todayLocalDate

  return {
    source: "hulu",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_HULU_BASE_URL")) || HULU_SCHEDULE_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "hulu")
      const html = await limiter.run(() => httpClient.fetchText("hulu", url, {
        timeoutMs: HULU_TIMEOUT_MS,
        settingsOverride,
        headers: { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }
      }))
      const todayValue = today()
      const candidates = parseHuluSchedule(html, url, Number(todayValue.slice(0, 4)))

      return candidates
        .map((candidate) => candidateToAdapterItem({ ...CONFIG, sourceUrl: url }, candidate, todayValue))
        .filter((item): item is NonNullable<typeof item> => item != null)
    }
  }
}

export const huluAdapter = createHuluAdapter()
```

- [ ] **Step 5: Run Hulu tests**

Run:

```bash
npm test --workspace backend -- huluAdapter
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/adapters/huluScheduleParser.ts backend/src/adapters/huluAdapter.ts backend/tests/huluAdapter.test.ts
git commit -m "feat: 添加 Hulu 上新适配器"
```

## Task 3: Disney+ New To Disney+ Adapter

**Files:**
- Create: `backend/src/adapters/disneyPlusParser.ts`
- Create: `backend/src/adapters/disneyPlusAdapter.ts`
- Create: `backend/tests/disneyPlusAdapter.test.ts`

**Interfaces:**
- Consumes:
  - `parseEnglishReleaseDate(text, fallbackYear)`
  - `candidateToAdapterItem(config, candidate, today)`
- Produces:
  - `parseDisneyPlusNewReleases(html: string, sourceUrl: string, fallbackYear: number): PlatformReleaseCandidate[]`
  - `createDisneyPlusAdapter(options?: DisneyPlusAdapterOptions): SourceAdapter`
  - `disneyPlusAdapter`

- [ ] **Step 1: Write failing Disney+ tests**

Create `backend/tests/disneyPlusAdapter.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDisneyPlusAdapter } from "../src/adapters/disneyPlusAdapter.js"
import { parseDisneyPlusNewReleases } from "../src/adapters/disneyPlusParser.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function fakeSettings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-disney-env"), values)
}

const disneyHtml = `
  <main>
    <h1>New on Disney+ in July 2026</h1>
    <h2>July 2</h2>
    <h3>Ocean Movie</h3>
    <p>Original movie premiere.</p>
    <h2>July 9</h2>
    <h3>Galaxy Adventures Season 2</h3>
    <p>New series episodes arrive weekly.</p>
    <h2>Coming Later This Month</h2>
    <h3>Undated Feature</h3>
  </main>
`

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Disney+ parser", () => {
  it("parses dated article sections into platform candidates", () => {
    const rows = parseDisneyPlusNewReleases(disneyHtml, "https://www.disneyplus.com/explore/articles/new-to-disney-plus", 2026)

    expect(rows).toEqual([
      expect.objectContaining({
        title: "Ocean Movie",
        sourceContentType: "movie",
        releaseDate: "2026-07-02",
        description: "Original movie premiere."
      }),
      expect.objectContaining({
        title: "Galaxy Adventures Season 2",
        sourceContentType: "series",
        releaseDate: "2026-07-09"
      })
    ])
  })

  it("throws when no dated titles can be parsed", () => {
    expect(() => parseDisneyPlusNewReleases("<main><h1>Marketing</h1></main>", "https://example.test", 2026))
      .toThrow("Disney+ 页面没有可解析条目")
  })
})

describe("Disney+ adapter", () => {
  it("fetches the New to Disney+ article and maps dated titles", async () => {
    const fetchText = vi.fn(async () => disneyHtml)
    const adapter = createDisneyPlusAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      settings: fakeSettings({}),
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    const items = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledWith(
      "disney_plus",
      "https://www.disneyplus.com/explore/articles/new-to-disney-plus",
      expect.objectContaining({ timeoutMs: 30000 })
    )
    expect(items).toHaveLength(2)
    expect(items[0].media).toMatchObject({
      source: "disney_plus",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      titleDisplay: "Ocean Movie"
    })
    expect(items[1].media).toMatchObject({
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "Galaxy Adventures Season 2"
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "Disney+",
      region: "US",
      releaseDate: "2026-07-02",
      releaseStatus: "upcoming"
    })
  })
})
```

- [ ] **Step 2: Run failing Disney+ tests**

Run:

```bash
npm test --workspace backend -- disneyPlusAdapter
```

Expected: FAIL because Disney+ parser and adapter files do not exist.

- [ ] **Step 3: Implement Disney+ parser**

Create `backend/src/adapters/disneyPlusParser.ts`:

```ts
import { load } from "cheerio"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

function inferContentType(title: string, description: string | null): string {
  const text = `${title} ${description ?? ""}`.toLowerCase()
  if (text.includes("movie") || text.includes("film") || text.includes("feature")) return "movie"
  if (text.includes("season") || text.includes("series") || text.includes("episode")) return "series"
  if (text.includes("documentary")) return "documentary"
  if (text.includes("special")) return "special"
  return "unknown"
}

export function parseDisneyPlusNewReleases(
  html: string,
  sourceUrl: string,
  fallbackYear: number
): PlatformReleaseCandidate[] {
  const $ = load(html)
  const candidates: PlatformReleaseCandidate[] = []
  let currentDate: string | null = null

  $("h2, h3, h4, li").each((_index, element) => {
    const text = cleanPlatformText($(element).text())
    if (!text) return

    const parsedDate = parseEnglishReleaseDate(text, fallbackYear)
    if (parsedDate) {
      currentDate = parsedDate
      return
    }

    if (!currentDate) return
    if (/coming later|streaming now|also streaming/i.test(text)) return

    const tagName = element.tagName.toLowerCase()
    if (!["h3", "h4", "li"].includes(tagName)) return

    const description = cleanPlatformText($(element).next("p").text())
    candidates.push({
      title: text,
      sourceContentType: inferContentType(text, description),
      releaseDate: currentDate,
      description,
      labels: [],
      sourceUrl
    })
  })

  if (candidates.length === 0) throw new Error("Disney+ 页面没有可解析条目")
  return candidates
}
```

- [ ] **Step 4: Implement Disney+ adapter**

Create `backend/src/adapters/disneyPlusAdapter.ts`:

```ts
import type { SourceAdapter } from "../domain/types.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"
import {
  candidateToAdapterItem,
  type PlatformAdapterConfig
} from "./platformPageUtils.js"
import { parseDisneyPlusNewReleases } from "./disneyPlusParser.js"

type DisneyPlusAdapterOptions = {
  url?: string
  minIntervalMs?: number
  today?: () => string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const DISNEY_PLUS_URL = "https://www.disneyplus.com/explore/articles/new-to-disney-plus"
const DISNEY_PLUS_TIMEOUT_MS = 30000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000

function todayLocalDate(): string {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

const CONFIG: PlatformAdapterConfig = {
  source: "disney_plus",
  platform: "Disney+",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: DISNEY_PLUS_URL
}

export function createDisneyPlusAdapter(options: DisneyPlusAdapterOptions = {}): SourceAdapter {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const today = options.today ?? todayLocalDate

  return {
    source: "disney_plus",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_DISNEY_PLUS_BASE_URL")) || DISNEY_PLUS_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "disney_plus")
      const html = await limiter.run(() => httpClient.fetchText("disney_plus", url, {
        timeoutMs: DISNEY_PLUS_TIMEOUT_MS,
        settingsOverride,
        headers: { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }
      }))
      const todayValue = today()
      const candidates = parseDisneyPlusNewReleases(html, url, Number(todayValue.slice(0, 4)))

      return candidates
        .map((candidate) => candidateToAdapterItem({ ...CONFIG, sourceUrl: url }, candidate, todayValue))
        .filter((item): item is NonNullable<typeof item> => item != null)
    }
  }
}

export const disneyPlusAdapter = createDisneyPlusAdapter()
```

- [ ] **Step 5: Run Disney+ tests**

Run:

```bash
npm test --workspace backend -- disneyPlusAdapter
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/adapters/disneyPlusParser.ts backend/src/adapters/disneyPlusAdapter.ts backend/tests/disneyPlusAdapter.test.ts
git commit -m "feat: 添加 Disney+ 上新适配器"
```

## Task 4: Max WBD Press Adapter

**Files:**
- Create: `backend/src/adapters/maxPressParser.ts`
- Create: `backend/src/adapters/maxAdapter.ts`
- Create: `backend/tests/maxAdapter.test.ts`

**Interfaces:**
- Consumes:
  - `parseEnglishReleaseDate(text, fallbackYear)`
  - `candidateToAdapterItem(config, candidate, today)`
- Produces:
  - `parseMaxWhatsNew(html: string, sourceUrl: string, fallbackYear: number): PlatformReleaseCandidate[]`
  - `createMaxAdapter(options?: MaxAdapterOptions): SourceAdapter`
  - `maxAdapter`

- [ ] **Step 1: Write failing Max tests**

Create `backend/tests/maxAdapter.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { createMaxAdapter } from "../src/adapters/maxAdapter.js"
import { parseMaxWhatsNew } from "../src/adapters/maxPressParser.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

function fakeSettings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-max-env"), values)
}

const maxHtml = `
  <article>
    <h1>What's New On HBO Max This July</h1>
    <p>July 1</p>
    <ul>
      <li>Sinners, 2025 (HBO)</li>
      <li>Rage: Season 1 (HBO Original)</li>
    </ul>
    <p>July 15, 2026</p>
    <p>Feature Film: Opus</p>
    <p>Coming later this month</p>
    <p>Undated Promo</p>
  </article>
`

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Max press parser", () => {
  it("parses dated WBD press sections into platform candidates", () => {
    const rows = parseMaxWhatsNew(maxHtml, "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july", 2026)

    expect(rows).toEqual([
      expect.objectContaining({
        title: "Sinners",
        sourceContentType: "movie",
        releaseDate: "2026-07-01"
      }),
      expect.objectContaining({
        title: "Rage: Season 1",
        sourceContentType: "series",
        releaseDate: "2026-07-01"
      }),
      expect.objectContaining({
        title: "Opus",
        sourceContentType: "movie",
        releaseDate: "2026-07-15"
      })
    ])
  })

  it("throws when the press page has no dated titles", () => {
    expect(() => parseMaxWhatsNew("<article><p>Only marketing copy</p></article>", "https://example.test", 2026))
      .toThrow("Max press 页面没有可解析条目")
  })
})

describe("Max adapter", () => {
  it("fetches the configured WBD press page and maps dated titles", async () => {
    const fetchText = vi.fn(async () => maxHtml)
    const adapter = createMaxAdapter({
      httpClient: { fetchText } as unknown as SourceHttpClient,
      settings: fakeSettings({}),
      minIntervalMs: 0,
      today: () => "2026-07-01"
    })

    const items = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledWith(
      "max",
      "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july",
      expect.objectContaining({ timeoutMs: 30000 })
    )
    expect(items).toHaveLength(3)
    expect(items[0].media).toMatchObject({
      source: "max",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      titleDisplay: "Sinners"
    })
    expect(items[1].media).toMatchObject({
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "Rage: Season 1"
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "Max",
      region: "US",
      releaseDate: "2026-07-01"
    })
  })
})
```

- [ ] **Step 2: Run failing Max tests**

Run:

```bash
npm test --workspace backend -- maxAdapter
```

Expected: FAIL because Max parser and adapter files do not exist.

- [ ] **Step 3: Implement Max press parser**

Create `backend/src/adapters/maxPressParser.ts`:

```ts
import { load } from "cheerio"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

function titleFromRaw(value: string): string {
  return value
    .replace(/^Feature Film:\\s*/i, "")
    .replace(/,\\s*\\d{4}\\b.*$/, "")
    .replace(/\\s*\\((?:HBO|Max|HBO Original|Max Original)[^)]+\\)\\s*$/i, "")
    .trim()
}

function inferContentType(title: string, raw: string): string {
  const text = `${title} ${raw}`.toLowerCase()
  if (text.includes("feature film") || text.includes("movie") || text.includes("film")) return "movie"
  if (text.includes("season") || text.includes("series") || text.includes("episode")) return "series"
  if (text.includes("documentary")) return "documentary"
  if (text.includes("special")) return "special"
  return "unknown"
}

export function parseMaxWhatsNew(
  html: string,
  sourceUrl: string,
  fallbackYear: number
): PlatformReleaseCandidate[] {
  const $ = load(html)
  const candidates: PlatformReleaseCandidate[] = []
  let currentDate: string | null = null

  $("article, main, body").first().find("p, li, h2, h3").each((_index, element) => {
    const raw = cleanPlatformText($(element).text())
    if (!raw) return

    const parsedDate = parseEnglishReleaseDate(raw, fallbackYear)
    if (parsedDate) {
      currentDate = parsedDate
      return
    }

    if (!currentDate) return
    if (/coming later|check back|streaming now/i.test(raw)) return

    const title = cleanPlatformText(titleFromRaw(raw))
    if (!title) return

    candidates.push({
      title,
      sourceContentType: inferContentType(title, raw),
      releaseDate: currentDate,
      description: raw,
      labels: [],
      sourceUrl
    })
  })

  if (candidates.length === 0) throw new Error("Max press 页面没有可解析条目")
  return candidates
}
```

- [ ] **Step 4: Implement Max adapter**

Create `backend/src/adapters/maxAdapter.ts`:

```ts
import type { SourceAdapter } from "../domain/types.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"
import {
  candidateToAdapterItem,
  type PlatformAdapterConfig
} from "./platformPageUtils.js"
import { parseMaxWhatsNew } from "./maxPressParser.js"

type MaxAdapterOptions = {
  url?: string
  minIntervalMs?: number
  today?: () => string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

const MAX_PRESS_URL = "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july"
const MAX_TIMEOUT_MS = 30000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000

function todayLocalDate(): string {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

const CONFIG: PlatformAdapterConfig = {
  source: "max",
  platform: "Max",
  region: "US",
  defaultLanguage: "en",
  defaultGenres: [],
  sourceUrl: MAX_PRESS_URL
}

export function createMaxAdapter(options: MaxAdapterOptions = {}): SourceAdapter {
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const today = options.today ?? todayLocalDate

  return {
    source: "max",
    async fetchItems() {
      const currentSettings = settings.view()
      const url = (options.url ?? currentSettings.get("SOURCE_MAX_BASE_URL")) || MAX_PRESS_URL
      const settingsOverride = captureSourceProxySettings(currentSettings, "max")
      const html = await limiter.run(() => httpClient.fetchText("max", url, {
        timeoutMs: MAX_TIMEOUT_MS,
        settingsOverride,
        headers: { "user-agent": "Mozilla/5.0 WhatsNewBot/0.1" }
      }))
      const todayValue = today()
      const candidates = parseMaxWhatsNew(html, url, Number(todayValue.slice(0, 4)))

      return candidates
        .map((candidate) => candidateToAdapterItem({ ...CONFIG, sourceUrl: url }, candidate, todayValue))
        .filter((item): item is NonNullable<typeof item> => item != null)
    }
  }
}

export const maxAdapter = createMaxAdapter()
```

- [ ] **Step 5: Run Max tests**

Run:

```bash
npm test --workspace backend -- maxAdapter
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/adapters/maxPressParser.ts backend/src/adapters/maxAdapter.ts backend/tests/maxAdapter.test.ts
git commit -m "feat: 添加 Max 上新适配器"
```

## Task 5: Catalog, Registry, Scheduler And Manual Commands

**Files:**
- Modify: `backend/src/settings/sourceCatalog.ts`
- Modify: `backend/src/adapters/adapterRegistry.ts`
- Create: `backend/src/scripts/syncHulu.ts`
- Create: `backend/src/scripts/syncDisneyPlus.ts`
- Create: `backend/src/scripts/syncMax.ts`
- Modify: `backend/package.json`
- Modify: `backend/tests/sourceCatalog.test.ts`
- Modify: `backend/tests/scheduler.test.ts`
- Modify: `backend/tests/api.test.ts`

**Interfaces:**
- Consumes:
  - `huluAdapter`
  - `disneyPlusAdapter`
  - `maxAdapter`
- Produces:
  - Active daily sources `hulu`, `disney_plus`, `max`
  - npm scripts `sync:hulu`, `sync:disney-plus`, `sync:max`

- [ ] **Step 1: Update catalog tests first**

Modify `backend/tests/sourceCatalog.test.ts` active source expectation:

```ts
expect(SOURCE_CATALOG.filter((source) => source.implementationStatus === "active").map((source) => source.id)).toEqual([
  "tvmaze",
  "tmdb",
  "trakt",
  "thetvdb",
  "netflix",
  "hulu",
  "disney_plus",
  "max",
  "youku",
  "iqiyi"
])
```

Add assertions:

```ts
expect(getSourceDefinition("hulu")).toMatchObject({
  implementationStatus: "active",
  supportsSync: true,
  supportsEnable: true,
  defaultEnabled: false,
  scheduleGroups: ["daily"],
  testUrl: "https://press.hulu.com/schedule/"
})
expect(getSourceDefinition("hulu").semantics).toMatchObject({
  signalKinds: ["platform_catalog", "release_calendar"],
  access: "public_page"
})
expect(getSourceDefinition("disney_plus")).toMatchObject({
  implementationStatus: "active",
  supportsSync: true,
  supportsEnable: true,
  defaultEnabled: false,
  scheduleGroups: ["daily"],
  testUrl: "https://www.disneyplus.com/explore/articles/new-to-disney-plus"
})
expect(getSourceDefinition("max")).toMatchObject({
  implementationStatus: "active",
  supportsSync: true,
  supportsEnable: true,
  defaultEnabled: false,
  scheduleGroups: ["daily"],
  testUrl: "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july"
})
expect(getSourceDefinition("prime_video").semantics.signalKinds).toEqual(["platform_catalog"])
expect(getSourceDefinition("apple_tv_plus").semantics.signalKinds).toEqual(["news_signal"])
expect(getSourceDefinition("apple_tv_plus").supportsSync).toBe(false)
```

- [ ] **Step 2: Update scheduler tests first**

In `backend/tests/scheduler.test.ts`, add hoisted mocks:

```ts
huluAdapter: { source: "hulu" },
disneyPlusAdapter: { source: "disney_plus" },
maxAdapter: { source: "max" },
```

Add mocks:

```ts
vi.mock("../src/adapters/huluAdapter.js", () => ({
  huluAdapter: mocks.huluAdapter
}))

vi.mock("../src/adapters/disneyPlusAdapter.js", () => ({
  disneyPlusAdapter: mocks.disneyPlusAdapter
}))

vi.mock("../src/adapters/maxAdapter.js", () => ({
  maxAdapter: mocks.maxAdapter
}))
```

Update daily schedule expectation:

```ts
expect(mocks.runSourceSync).toHaveBeenCalledTimes(6)
expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.netflixAdapter)
expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.traktCalendarAdapter)
expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.theTvdbAdapter)
expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.huluAdapter)
expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.disneyPlusAdapter)
expect(mocks.runSourceSync).toHaveBeenCalledWith(mocks.db, mocks.maxAdapter)
```

Update registered adapter list:

```ts
expect(registeredAdapters.map(({ sourceId, scheduleGroup }) => ({ sourceId, scheduleGroup }))).toEqual([
  { sourceId: "tvmaze", scheduleGroup: "hourly" },
  { sourceId: "tmdb", scheduleGroup: "hourly" },
  { sourceId: "trakt", scheduleGroup: "hourly" },
  { sourceId: "trakt", scheduleGroup: "daily" },
  { sourceId: "thetvdb", scheduleGroup: "daily" },
  { sourceId: "netflix", scheduleGroup: "daily" },
  { sourceId: "hulu", scheduleGroup: "daily" },
  { sourceId: "disney_plus", scheduleGroup: "daily" },
  { sourceId: "max", scheduleGroup: "daily" },
  { sourceId: "youku", scheduleGroup: "hourly" },
  { sourceId: "iqiyi", scheduleGroup: "hourly" }
])
```

- [ ] **Step 3: Update API route test expectation**

In `backend/tests/api.test.ts`, change:

```ts
expect(sourcesResponse.body.items).toHaveLength(22)
```

Keep length 22, then add:

```ts
expect(sourcesResponse.body.items.find((source: any) => source.id === "hulu")).toMatchObject({
  implementationStatus: "active",
  supportsSync: true,
  enabled: false,
  runnable: false,
  semantics: expect.objectContaining({
    signalKinds: ["platform_catalog", "release_calendar"],
    access: "public_page"
  })
})
expect(sourcesResponse.body.items.find((source: any) => source.id === "prime_video")).toMatchObject({
  implementationStatus: "planned",
  supportsSync: false,
  semantics: expect.objectContaining({
    signalKinds: ["platform_catalog"]
  })
})
```

- [ ] **Step 4: Run focused tests to verify failure**

Run:

```bash
npm test --workspace backend -- sourceCatalog scheduler api
```

Expected: FAIL because catalog and registry are not updated yet.

- [ ] **Step 5: Update source catalog**

In `backend/src/settings/sourceCatalog.ts`, update semantics:

```ts
hulu: {
  signalKinds: ["platform_catalog", "release_calendar"],
  coverage: "Hulu 美国官方上新与排期",
  cadence: "日级检查官方 Press Schedule",
  access: "public_page",
  freshnessNote: "只代表 Hulu 官方 schedule 页面，不代表全网热度",
  riskNote: "Hulu hub 页面可能地区跳转，首版只使用 Press Schedule"
},
disney_plus: {
  signalKinds: ["platform_catalog", "release_calendar"],
  coverage: "Disney+ 官方月度上新文章",
  cadence: "日级检查当前 New to Disney+ 页面",
  access: "public_page",
  freshnessNote: "只代表 Disney+ 官方文章中的上线信息",
  riskNote: "文章结构和地区语言可能变化，解析失败不得伪装成功"
},
max: {
  signalKinds: ["platform_catalog", "release_calendar"],
  coverage: "Max / HBO Max 官方 Pressroom 月度上新",
  cadence: "日级检查已验证 WBD Pressroom 页面",
  access: "public_page",
  freshnessNote: "只代表 WBD Pressroom 发布的 Max 上新信息",
  riskNote: "月度 press URL 可能变化，可通过 SOURCE_MAX_BASE_URL 覆盖"
},
prime_video: {
  signalKinds: ["platform_catalog"],
  coverage: "Prime Video 新内容集合候选",
  cadence: "待验证客户端集合页稳定性",
  access: "public_page",
  freshnessNote: "尚未实现，只保留规划入口",
  riskNote: "页面参数、分页 token、地区和客户端渲染会影响采集"
},
apple_tv_plus: {
  signalKinds: ["news_signal"],
  coverage: "Apple TV Press 资讯候选",
  cadence: "待验证 press-only 方案",
  access: "public_page",
  freshnessNote: "首版不采集 tv.apple.com collection",
  riskNote: "当前本地 HTTP 访问 tv.apple.com collection 返回 404，不硬接平台片库"
}
```

Change catalog rows:

```ts
source("hulu", "Hulu", "官方排期与上新", "international_platform", "active", "inherit", true, true, "https://press.hulu.com/schedule/", [], ["daily"], false),
source("disney_plus", "Disney+", "官方月度上新", "international_platform", "active", "inherit", true, true, "https://www.disneyplus.com/explore/articles/new-to-disney-plus", [], ["daily"], false),
source("max", "Max", "官方月度上新", "international_platform", "active", "inherit", true, true, "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july", [], ["daily"], false),
source("prime_video", "Prime Video", "新内容集合候选", "international_platform", "planned", "inherit", false, false, "https://www.primevideo.com/collection/newandupcoming"),
source("apple_tv_plus", "Apple TV+", "Apple TV Press 资讯候选", "international_platform", "planned", "inherit", false, false, "https://www.apple.com/tv-pr/news/"),
```

- [ ] **Step 6: Register adapters**

Modify `backend/src/adapters/adapterRegistry.ts` imports:

```ts
import { disneyPlusAdapter } from "./disneyPlusAdapter.js"
import { huluAdapter } from "./huluAdapter.js"
import { maxAdapter } from "./maxAdapter.js"
```

Add daily entries after Netflix:

```ts
{ sourceId: "hulu", scheduleGroup: "daily", adapter: huluAdapter },
{ sourceId: "disney_plus", scheduleGroup: "daily", adapter: disneyPlusAdapter },
{ sourceId: "max", scheduleGroup: "daily", adapter: maxAdapter },
```

- [ ] **Step 7: Add manual sync scripts**

Create `backend/src/scripts/syncHulu.ts`:

```ts
import { huluAdapter } from "../adapters/huluAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()

try {
  const run = await runSourceSync(db, huluAdapter)
  console.log(JSON.stringify({
    source: run.source,
    status: run.status,
    itemCount: run.itemCount,
    durationMs: run.durationMs
  }))

  if (run.status !== "success") process.exitCode = 1
} finally {
  await db.$disconnect()
}
```

Create `backend/src/scripts/syncDisneyPlus.ts`:

```ts
import { disneyPlusAdapter } from "../adapters/disneyPlusAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()

try {
  const run = await runSourceSync(db, disneyPlusAdapter)
  console.log(JSON.stringify({
    source: run.source,
    status: run.status,
    itemCount: run.itemCount,
    durationMs: run.durationMs
  }))

  if (run.status !== "success") process.exitCode = 1
} finally {
  await db.$disconnect()
}
```

Create `backend/src/scripts/syncMax.ts`:

```ts
import { maxAdapter } from "../adapters/maxAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()

try {
  const run = await runSourceSync(db, maxAdapter)
  console.log(JSON.stringify({
    source: run.source,
    status: run.status,
    itemCount: run.itemCount,
    durationMs: run.durationMs
  }))

  if (run.status !== "success") process.exitCode = 1
} finally {
  await db.$disconnect()
}
```

- [ ] **Step 8: Add npm scripts**

Modify `backend/package.json` scripts:

```json
"sync:hulu": "tsx src/scripts/syncHulu.ts",
"sync:disney-plus": "tsx src/scripts/syncDisneyPlus.ts",
"sync:max": "tsx src/scripts/syncMax.ts",
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
npm test --workspace backend -- sourceCatalog scheduler api
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src/settings/sourceCatalog.ts backend/src/adapters/adapterRegistry.ts backend/src/scripts/syncHulu.ts backend/src/scripts/syncDisneyPlus.ts backend/src/scripts/syncMax.ts backend/package.json backend/tests/sourceCatalog.test.ts backend/tests/scheduler.test.ts backend/tests/api.test.ts
git commit -m "feat: 启用国际平台上新源"
```

## Task 6: Documentation And Real Sync Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes:
  - npm scripts from Task 5
  - `/api/sources`
- Produces: Updated runtime documentation and verified source state.

- [ ] **Step 1: Update README data source list**

In `README.md`, update the source summary line from:

```md
已接入并可同步的数据源为 TVmaze、TMDb、Trakt、TheTVDB、Netflix、优酷和爱奇艺
```

to:

```md
已接入并可同步的数据源为 TVmaze、TMDb、Trakt、TheTVDB、Netflix、Hulu、Disney+、Max、优酷和爱奇艺；IMDb 使用本地 datasets 手动导入。
```

- [ ] **Step 2: Add international platform section**

Add after Netflix section:

```md
### Hulu / Disney+ / Max 官方上新

Hulu、Disney+ 和 Max 来源只同步官方页面中的平台上新和排期，不生成热度排名。

- Hulu 使用 `https://press.hulu.com/schedule/`
- Disney+ 使用 `https://www.disneyplus.com/explore/articles/new-to-disney-plus`
- Max 使用 WBD Pressroom 的 What's New 页面，默认 URL 可通过 `SOURCE_MAX_BASE_URL` 覆盖
- 三个来源均为 daily schedule，默认关闭，需在设置页显式启用
- 手动同步：
  - `npm run sync:hulu --workspace backend`
  - `npm run sync:disney-plus --workspace backend`
  - `npm run sync:max --workspace backend`
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full tests**

Run:

```bash
npm test
```

Expected: backend and frontend tests all pass.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Enable first-batch sources locally through settings API**

Run:

```bash
curl -sS -X PUT http://127.0.0.1:19993/api/settings \
  -H 'content-type: application/json' \
  --data '{"values":{"SOURCE_HULU_ENABLED":"true","SOURCE_DISNEY_PLUS_ENABLED":"true","SOURCE_MAX_ENABLED":"true"},"clearKeys":[]}'
```

Expected response:

```json
{"success":true,"effectiveImmediately":true}
```

- [ ] **Step 7: Run real Hulu sync**

Run:

```bash
npm run sync:hulu --workspace backend
```

Expected: JSON output with `"source":"hulu"`, `"status":"success"` and `itemCount` greater than `0`. If `itemCount` is `0` or status is failed, inspect the source run error before proceeding.

- [ ] **Step 8: Run real Disney+ sync**

Run:

```bash
npm run sync:disney-plus --workspace backend
```

Expected: JSON output with `"source":"disney_plus"`, `"status":"success"` and `itemCount` greater than `0`. If the current Disney+ page structure changed, update parser fixtures and parser before proceeding.

- [ ] **Step 9: Run real Max sync**

Run:

```bash
npm run sync:max --workspace backend
```

Expected: JSON output with `"source":"max"`, `"status":"success"` and `itemCount` greater than `0`. If WBD changes the monthly URL, set `SOURCE_MAX_BASE_URL` to a currently verified WBD Pressroom URL through `/api/settings` and re-run.

- [ ] **Step 10: Verify source state**

Run:

```bash
curl -sS http://127.0.0.1:19993/api/sources | node -e 'let input=""; process.stdin.on("data", c => input += c); process.stdin.on("end", () => { const data = JSON.parse(input); const ids = new Set(["hulu", "disney_plus", "max", "prime_video", "apple_tv_plus"]); console.log(JSON.stringify(data.items.filter((item) => ids.has(item.id)).map((item) => ({ id: item.id, implementationStatus: item.implementationStatus, enabled: item.enabled, runnable: item.runnable, supportsSync: item.supportsSync, latestRun: item.latestRun, signalKinds: item.semantics.signalKinds })), null, 2)) })'
```

Expected:

- `hulu`, `disney_plus`, `max`: `implementationStatus = "active"`, `supportsSync = true`, `latestRun.status = "success"`.
- `prime_video`, `apple_tv_plus`: `implementationStatus = "planned"`, `supportsSync = false`, `runnable = false`.
- No source reports `platform_rank` for Hulu, Disney+, Max, Prime Video or Apple TV+.

- [ ] **Step 11: Commit README update**

```bash
git add README.md
git commit -m "docs: 更新国际平台上新说明"
```

If Steps 3-10 required parser or catalog changes, commit those changed source/test files before committing `README.md`, using the task-specific `feat:` or `fix:` message that matches the changed behavior.

- [ ] **Step 12: Final status check**

Run:

```bash
git status --short --branch
```

Expected: clean worktree on `codex/whatsnew-mvp`, or only ignored local runtime files such as `backend/.env` / `backend/.cache/`.

## Final Verification Gate

Before merging or declaring the implementation complete, run:

```bash
npm run typecheck
npm test
npm run build
```

Then verify real source runs:

```bash
npm run sync:hulu --workspace backend
npm run sync:disney-plus --workspace backend
npm run sync:max --workspace backend
```

Expected final evidence:

- Typecheck exits `0`.
- Backend and frontend tests exit `0`.
- Build exits `0`.
- Hulu, Disney+ and Max real sync runs exit `0` with `status=success`.
- `/api/sources` shows Hulu, Disney+ and Max active, enabled only if local settings enabled them, and Prime Video / Apple TV+ still planned and non-syncable.
