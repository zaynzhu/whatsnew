# IMDb Local Cache Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build IMDb local cache synchronization from gzipped dataset files, keeping IMDb as a manual CLI-only enrichment source for existing media.

**Architecture:** Extract media candidate loading into a shared service, reuse IMDb row conversion rules from the parser, add a streaming gzip TSV reader, then build a cache adapter that filters `title.basics` before reading matching ratings. Add a CLI entrypoint and config whitelist without registering IMDb in scheduler or front-end sync controls.

**Tech Stack:** TypeScript, Node.js `fs`/`zlib`/`readline`, Vitest, Prisma client, existing `SourceAdapter`, existing IMDb parser and target modules.

## Global Constraints

- Read `title.basics.tsv.gz` and `title.ratings.tsv.gz` only from `IMDB_DATASET_CACHE_DIR`.
- Use gzip streaming; do not read full IMDb datasets into memory.
- Keep `AdapterItem.createIfMissing=false`.
- Keep IMDb source `planned`; do not register it in hourly/daily adapter registry.
- Do not add front-end setting toggles or API manual sync for IMDb in this phase.
- Do not add a Prisma schema change.
- Do not use IMDb Developer commercial API, Meters, TVMeter, Most Popular, or paid Bulk Data.
- Do not set `completePopularitySources` for IMDb partial cache sync.
- All new TypeScript uses 2-space indentation and no semicolons.

---

## File Structure

- Create `backend/src/services/mediaCandidateService.ts`: shared `loadExistingMediaCandidates(prisma)` helper.
- Modify `backend/src/services/sourceSyncService.ts`: reuse `loadExistingMediaCandidates()`.
- Modify `backend/src/adapters/imdbDatasetsParser.ts`: export parsed row helpers for text and stream parsers.
- Create `backend/src/adapters/imdbDatasetStream.ts`: streaming gzip TSV reader and IMDb-specific stream helpers.
- Modify `backend/src/adapters/imdbDatasetTargets.ts`: preserve candidate `originalLanguage` as a matcher hint for title-key matches.
- Create `backend/src/adapters/imdbDatasetCacheAdapter.ts`: cache-dir adapter factory.
- Create `backend/src/scripts/syncImdb.ts`: CLI manual sync command.
- Modify `backend/package.json`: add `sync:imdb`.
- Modify `backend/src/settings/settingsFields.ts`: whitelist `IMDB_DATASET_CACHE_DIR`.
- Add/modify focused tests under `backend/tests/`.

## Task 1: Extract Existing Media Candidate Loading

**Files:**
- Create: `backend/src/services/mediaCandidateService.ts`
- Modify: `backend/src/services/sourceSyncService.ts`
- Test: `backend/tests/mediaCandidateService.test.ts`

**Interfaces:**
- Produces: `loadExistingMediaCandidates(prisma: PrismaClient): Promise<ExistingMediaCandidate[]>`
- Consumes: Prisma `mediaItem.findMany()`

- [ ] **Step 1: Write the failing service test**

Create `backend/tests/mediaCandidateService.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { loadExistingMediaCandidates } from "../src/services/mediaCandidateService.js"

describe("loadExistingMediaCandidates", () => {
  it("normalizes stored JSON arrays and media type rows", async () => {
    const prisma = {
      mediaItem: {
        findMany: vi.fn(async () => [{
          id: "media-1",
          mediaType: "movie",
          titleDisplay: "Midnight File",
          titleAliases: "[\"Midnight Archive\"]",
          overview: null,
          posterUrl: null,
          productionCountries: "[\"US\"]",
          genres: "[\"Drama\"]",
          firstReleaseDate: "2026-02-14",
          originalLanguage: "en",
          status: "released",
          tmdbId: 123,
          tvmazeId: null,
          imdbId: "tt1000001",
          traktId: null,
          tvdbId: null
        }]
      }
    }

    await expect(loadExistingMediaCandidates(prisma as never)).resolves.toEqual([{
      id: "media-1",
      mediaType: "movie",
      titleDisplay: "Midnight File",
      titleAliases: ["Midnight Archive"],
      overview: null,
      posterUrl: null,
      productionCountries: "[\"US\"]",
      genres: "[\"Drama\"]",
      firstReleaseDate: "2026-02-14",
      originalLanguage: "en",
      status: "released",
      tmdbId: 123,
      tvmazeId: null,
      imdbId: "tt1000001",
      traktId: null,
      tvdbId: null
    }])
  })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test --workspace backend -- mediaCandidateService
```

Expected: fail because `mediaCandidateService.ts` does not exist.

- [ ] **Step 3: Implement the service and update source sync**

Create `backend/src/services/mediaCandidateService.ts`:

```ts
import type { PrismaClient } from "@prisma/client"
import { MEDIA_TYPES, type MediaType } from "@whatsnew/shared/media"
import { parseJsonArray } from "../domain/normalizer.js"
import type { ExistingMediaCandidate } from "../domain/types.js"

function mediaTypeFromRow(value: string): MediaType {
  if (MEDIA_TYPES.includes(value as MediaType)) return value as MediaType

  return "series"
}

export async function loadExistingMediaCandidates(prisma: PrismaClient): Promise<ExistingMediaCandidate[]> {
  const rows = await prisma.mediaItem.findMany()

  return rows.map((row) => ({
    id: row.id,
    mediaType: mediaTypeFromRow(row.mediaType),
    titleDisplay: row.titleDisplay,
    titleAliases: parseJsonArray(row.titleAliases),
    overview: row.overview,
    posterUrl: row.posterUrl,
    productionCountries: row.productionCountries,
    genres: row.genres,
    firstReleaseDate: row.firstReleaseDate,
    originalLanguage: row.originalLanguage,
    status: row.status,
    tmdbId: row.tmdbId,
    tvmazeId: row.tvmazeId,
    imdbId: row.imdbId,
    traktId: row.traktId,
    tvdbId: row.tvdbId
  }))
}
```

In `backend/src/services/sourceSyncService.ts`, remove local `MEDIA_TYPES`, `mediaTypeFromRow()`, and `getCandidates()`. Import and use:

```ts
import { loadExistingMediaCandidates } from "./mediaCandidateService.js"
```

Replace:

```ts
const candidates = await getCandidates(prisma)
```

with:

```ts
const candidates = await loadExistingMediaCandidates(prisma)
```

- [ ] **Step 4: Verify tests pass**

Run:

```bash
npm test --workspace backend -- mediaCandidateService sync
```

Expected: media candidate service tests and source sync tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/services/mediaCandidateService.ts backend/src/services/sourceSyncService.ts backend/tests/mediaCandidateService.test.ts
git commit -m "refactor: 抽取媒体候选读取服务"
```

## Task 2: Reuse IMDb Row Mapping and Add Stream Reader

**Files:**
- Modify: `backend/src/adapters/imdbDatasetsParser.ts`
- Create: `backend/src/adapters/imdbDatasetStream.ts`
- Test: `backend/tests/imdbDatasetStream.test.ts`
- Modify: `backend/tests/imdbDatasetsParser.test.ts`

**Interfaces:**
- Produces:
  - `type ParsedImdbTsvRow = Record<string, string | null>`
  - `imdbTitleBasicsFromParsedRow(row: ParsedImdbTsvRow): ImdbTitleBasicsRow`
  - `imdbTitleRatingFromParsedRow(row: ParsedImdbTsvRow): ImdbTitleRatingRow`
  - `streamImdbTitleBasics(filePath: string): AsyncGenerator<ImdbTitleBasicsRow>`
  - `streamImdbTitleRatings(filePath: string): AsyncGenerator<ImdbTitleRatingRow>`

- [ ] **Step 1: Write failing stream tests**

Create `backend/tests/imdbDatasetStream.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  streamImdbTitleBasics,
  streamImdbTitleRatings
} from "../src/adapters/imdbDatasetStream.js"

let tempDir: string

async function collect<T>(rows: AsyncGenerator<T>): Promise<T[]> {
  const collected: T[] = []
  for await (const row of rows) collected.push(row)
  return collected
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "whatsnew-imdb-stream-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe("IMDb dataset stream", () => {
  it("streams title basics from a gzipped TSV file", async () => {
    const filePath = join(tempDir, "title.basics.tsv.gz")
    await writeFile(filePath, gzipSync([
      "tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres",
      "tt1000001\tmovie\tMidnight File\t\\N\t0\t2026\t\\N\t112\tDrama,Mystery"
    ].join("\n")))

    await expect(collect(streamImdbTitleBasics(filePath))).resolves.toEqual([{
      tconst: "tt1000001",
      titleType: "movie",
      primaryTitle: "Midnight File",
      originalTitle: null,
      isAdult: false,
      startYear: 2026,
      endYear: null,
      runtimeMinutes: 112,
      genres: ["Drama", "Mystery"]
    }])
  })

  it("streams title ratings from a gzipped TSV file", async () => {
    const filePath = join(tempDir, "title.ratings.tsv.gz")
    await writeFile(filePath, gzipSync([
      "tconst\taverageRating\tnumVotes",
      "tt1000001\t7.8\t120345"
    ].join("\n")))

    await expect(collect(streamImdbTitleRatings(filePath))).resolves.toEqual([{
      tconst: "tt1000001",
      averageRating: 7.8,
      numVotes: 120345
    }])
  })

  it("reports missing required stream columns with the field name", async () => {
    const filePath = join(tempDir, "title.basics.tsv.gz")
    await writeFile(filePath, gzipSync([
      "tconst\ttitleType\tprimaryTitle",
      "tt1000001\tmovie\tMidnight File"
    ].join("\n")))

    await expect(collect(streamImdbTitleBasics(filePath))).rejects.toThrow("IMDb TSV 缺少必需字段: originalTitle")
  })
})
```

- [ ] **Step 2: Run stream tests to verify they fail**

Run:

```bash
npm test --workspace backend -- imdbDatasetStream
```

Expected: fail because `imdbDatasetStream.ts` does not exist.

- [ ] **Step 3: Refactor parser row helpers**

In `backend/src/adapters/imdbDatasetsParser.ts`, export:

```ts
export type ParsedImdbTsvRow = Record<string, string | null>
```

Rename the internal `ParsedTsvRow` usages to `ParsedImdbTsvRow`. Add:

```ts
export function imdbTitleBasicsFromParsedRow(row: ParsedImdbTsvRow): ImdbTitleBasicsRow {
  return {
    tconst: row.tconst ?? "",
    titleType: row.titleType ?? "",
    primaryTitle: row.primaryTitle ?? "",
    originalTitle: row.originalTitle,
    isAdult: row.isAdult === "1",
    startYear: numberOrNull(row.startYear),
    endYear: numberOrNull(row.endYear),
    runtimeMinutes: numberOrNull(row.runtimeMinutes),
    genres: genresFrom(row.genres)
  }
}

export function imdbTitleRatingFromParsedRow(row: ParsedImdbTsvRow): ImdbTitleRatingRow {
  return {
    tconst: row.tconst ?? "",
    averageRating: Number(row.averageRating ?? 0),
    numVotes: Number(row.numVotes ?? 0)
  }
}
```

Then make `parseImdbTitleBasics()` and `parseImdbTitleRatings()` map through those helpers.

- [ ] **Step 4: Implement stream reader**

Create `backend/src/adapters/imdbDatasetStream.ts`:

```ts
import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import { createGunzip } from "node:zlib"
import {
  imdbTitleBasicsFromParsedRow,
  imdbTitleRatingFromParsedRow,
  type ImdbTitleBasicsRow,
  type ImdbTitleRatingRow,
  type ParsedImdbTsvRow
} from "./imdbDatasetsParser.js"

const BASICS_FIELDS = ["tconst", "titleType", "primaryTitle", "originalTitle", "isAdult", "startYear", "endYear", "runtimeMinutes", "genres"]
const RATINGS_FIELDS = ["tconst", "averageRating", "numVotes"]

function imdbNull(value: string | undefined): string | null {
  if (value == null || value === "" || value === "\\N") return null
  return value
}

async function* streamGzipTsvRows<T>(
  filePath: string,
  requiredFields: string[],
  mapRow: (row: ParsedImdbTsvRow) => T
): AsyncGenerator<T> {
  const lines = createInterface({
    input: createReadStream(filePath).pipe(createGunzip()),
    crlfDelay: Infinity
  })
  let headers: string[] | null = null

  for await (const line of lines) {
    if (line.length === 0) continue
    if (!headers) {
      headers = line.replace(/\r$/, "").split("\t")
      for (const field of requiredFields) {
        if (!headers.includes(field)) throw new Error(`IMDb TSV 缺少必需字段: ${field}`)
      }
      continue
    }

    const values = line.replace(/\r$/, "").split("\t")
    const row = Object.fromEntries(headers.map((header, index) => [
      header,
      imdbNull(values[index])
    ])) as ParsedImdbTsvRow
    yield mapRow(row)
  }

  if (!headers) throw new Error("IMDb TSV 缺少表头")
}

export function streamImdbTitleBasics(filePath: string): AsyncGenerator<ImdbTitleBasicsRow> {
  return streamGzipTsvRows(filePath, BASICS_FIELDS, imdbTitleBasicsFromParsedRow)
}

export function streamImdbTitleRatings(filePath: string): AsyncGenerator<ImdbTitleRatingRow> {
  return streamGzipTsvRows(filePath, RATINGS_FIELDS, imdbTitleRatingFromParsedRow)
}
```

- [ ] **Step 5: Verify parser and stream tests pass**

Run:

```bash
npm test --workspace backend -- imdbDatasetStream imdbDatasetsParser
```

Expected: parser and stream tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/adapters/imdbDatasetsParser.ts backend/src/adapters/imdbDatasetStream.ts backend/tests/imdbDatasetStream.test.ts backend/tests/imdbDatasetsParser.test.ts
git commit -m "feat: 添加 IMDb gzip 流式读取"
```

## Task 3: Preserve Target Match Hints

**Files:**
- Modify: `backend/src/adapters/imdbDatasetTargets.ts`
- Modify: `backend/tests/imdbDatasetTargets.test.ts`

**Interfaces:**
- Produces: `targetLanguageForImdbRow(row, targets): string | null | undefined`
- Updates: `filterImdbRowsForTargets()` can copy target language into matched `AdapterItem.media.originalLanguage`.

- [ ] **Step 1: Write failing target hint test**

Append to `backend/tests/imdbDatasetTargets.test.ts`:

```ts
it("copies candidate language as a matcher hint for title-key matches", () => {
  const targets = createImdbTargetIndex([
    candidate({ imdbId: null, originalLanguage: "en" })
  ])

  const [item] = filterImdbRowsForTargets([
    imdbRow({ tconst: "tt3000003", primaryTitle: "Midnight File" })
  ], [], targets)

  expect(item.media.originalLanguage).toBe("en")
})
```

- [ ] **Step 2: Run target tests to verify they fail**

Run:

```bash
npm test --workspace backend -- imdbDatasetTargets
```

Expected: fail because the target language hint is not applied.

- [ ] **Step 3: Implement target language hints**

Extend `ImdbTargetIndex`:

```ts
titleYearMediaTypeLanguages: Map<string, string | null>
```

When building title keys, store the first candidate `originalLanguage` for that key. Add:

```ts
function titleKeysForRow(row: ImdbTitleBasicsRow): string[] {
  const mediaType = rowMediaType(row)
  if (mediaType == null || row.startYear == null) return []
  return [row.primaryTitle, row.originalTitle ?? ""]
    .map((title) => targetKey(title, row.startYear as number, mediaType))
    .filter((key): key is string => key != null)
}

export function targetLanguageForImdbRow(row: ImdbTitleBasicsRow, targets: ImdbTargetIndex): string | null | undefined {
  for (const key of titleKeysForRow(row)) {
    if (targets.titleYearMediaTypeLanguages.has(key)) return targets.titleYearMediaTypeLanguages.get(key)
  }
  return undefined
}
```

In `filterImdbRowsForTargets()`, after mapping an item:

```ts
const targetLanguage = targetLanguageForImdbRow(row, targets)
if (targetLanguage !== undefined && item.media.originalLanguage == null) {
  item.media.originalLanguage = targetLanguage
}
```

- [ ] **Step 4: Verify target tests pass**

Run:

```bash
npm test --workspace backend -- imdbDatasetTargets
```

Expected: all target tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/adapters/imdbDatasetTargets.ts backend/tests/imdbDatasetTargets.test.ts
git commit -m "feat: 保留 IMDb 目标匹配提示"
```

## Task 4: Add IMDb Cache Adapter

**Files:**
- Create: `backend/src/adapters/imdbDatasetCacheAdapter.ts`
- Test: `backend/tests/imdbDatasetCacheAdapter.test.ts`

**Interfaces:**
- Produces:
  - `createImdbDatasetCacheAdapter(options: { cacheDir: string, candidates: ExistingMediaCandidate[] }): SourceAdapter<SourceFetchBatch>`
  - `TITLE_BASICS_FILE = "title.basics.tsv.gz"`
  - `TITLE_RATINGS_FILE = "title.ratings.tsv.gz"`

- [ ] **Step 1: Write failing cache adapter tests**

Create `backend/tests/imdbDatasetCacheAdapter.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createImdbDatasetCacheAdapter } from "../src/adapters/imdbDatasetCacheAdapter.js"
import type { ExistingMediaCandidate } from "../src/domain/types.js"

let tempDir: string

function candidate(overrides: Partial<ExistingMediaCandidate> = {}): ExistingMediaCandidate {
  return {
    id: "media-1",
    mediaType: "movie",
    titleDisplay: "Midnight File",
    titleAliases: [],
    overview: null,
    posterUrl: null,
    productionCountries: "[]",
    genres: "[]",
    firstReleaseDate: "2026-02-14",
    originalLanguage: "en",
    status: "unknown",
    tmdbId: null,
    tvmazeId: null,
    imdbId: "tt1000001",
    traktId: null,
    tvdbId: null,
    ...overrides
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "whatsnew-imdb-cache-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function writeDatasetFiles() {
  await writeFile(join(tempDir, "title.basics.tsv.gz"), gzipSync([
    "tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres",
    "tt1000001\tmovie\tMidnight File\tMidnight File\t0\t2026\t\\N\t112\tDrama",
    "tt9999999\tmovie\tUnknown Film\tUnknown Film\t0\t2026\t\\N\t90\tDrama"
  ].join("\n")))
  await writeFile(join(tempDir, "title.ratings.tsv.gz"), gzipSync([
    "tconst\taverageRating\tnumVotes",
    "tt1000001\t7.8\t120345",
    "tt9999999\t9.1\t10"
  ].join("\n")))
}

describe("IMDb dataset cache adapter", () => {
  it("streams local cache files and returns only matched adapter items", async () => {
    await writeDatasetFiles()
    const adapter = createImdbDatasetCacheAdapter({
      cacheDir: tempDir,
      candidates: [candidate()]
    })

    const batch = await adapter.fetchItems()

    expect(batch).toMatchObject({
      items: [{
        createIfMissing: false,
        media: {
          source: "imdb",
          imdbId: "tt1000001"
        },
        popularitySignals: [{ source: "imdb_rating", value: 7.8 }]
      }]
    })
    expect(batch.completePopularitySources).toBeUndefined()
  })

  it("reports a missing basics cache file with the expected file name", async () => {
    const adapter = createImdbDatasetCacheAdapter({
      cacheDir: tempDir,
      candidates: [candidate()]
    })

    await expect(adapter.fetchItems()).rejects.toThrow("IMDb 数据集缓存缺少文件: title.basics.tsv.gz")
  })
})
```

- [ ] **Step 2: Run cache adapter tests to verify they fail**

Run:

```bash
npm test --workspace backend -- imdbDatasetCacheAdapter
```

Expected: fail because `imdbDatasetCacheAdapter.ts` does not exist.

- [ ] **Step 3: Implement cache adapter**

Create `backend/src/adapters/imdbDatasetCacheAdapter.ts`:

```ts
import { access } from "node:fs/promises"
import { join } from "node:path"
import type { ExistingMediaCandidate, SourceAdapter, SourceFetchBatch } from "../domain/types.js"
import { filterImdbRowsForTargets, createImdbTargetIndex } from "./imdbDatasetTargets.js"
import { streamImdbTitleBasics, streamImdbTitleRatings } from "./imdbDatasetStream.js"
import type { ImdbTitleBasicsRow, ImdbTitleRatingRow } from "./imdbDatasetsParser.js"

export const TITLE_BASICS_FILE = "title.basics.tsv.gz"
export const TITLE_RATINGS_FILE = "title.ratings.tsv.gz"

export type ImdbDatasetCacheAdapterOptions = {
  cacheDir: string
  candidates: ExistingMediaCandidate[]
}

async function requireCacheFile(filePath: string, fileName: string): Promise<void> {
  try {
    await access(filePath)
  } catch {
    throw new Error(`IMDb 数据集缓存缺少文件: ${fileName}`)
  }
}

export function createImdbDatasetCacheAdapter(options: ImdbDatasetCacheAdapterOptions): SourceAdapter<SourceFetchBatch> {
  return {
    source: "imdb",
    scope: "datasets_cache",
    async fetchItems() {
      const basicsPath = join(options.cacheDir, TITLE_BASICS_FILE)
      const ratingsPath = join(options.cacheDir, TITLE_RATINGS_FILE)
      await requireCacheFile(basicsPath, TITLE_BASICS_FILE)
      await requireCacheFile(ratingsPath, TITLE_RATINGS_FILE)

      const targets = createImdbTargetIndex(options.candidates)
      const matchedBasics: ImdbTitleBasicsRow[] = []
      const matchedTconsts = new Set<string>()

      for await (const row of streamImdbTitleBasics(basicsPath)) {
        const [item] = filterImdbRowsForTargets([row], [], targets)
        if (!item) continue
        matchedBasics.push(row)
        matchedTconsts.add(row.tconst)
      }

      const matchedRatings: ImdbTitleRatingRow[] = []
      for await (const rating of streamImdbTitleRatings(ratingsPath)) {
        if (matchedTconsts.has(rating.tconst)) matchedRatings.push(rating)
      }

      return {
        items: filterImdbRowsForTargets(matchedBasics, matchedRatings, targets)
      }
    }
  }
}
```

- [ ] **Step 4: Verify cache adapter tests pass**

Run:

```bash
npm test --workspace backend -- imdbDatasetCacheAdapter imdbDatasetStream imdbDatasetTargets
```

Expected: cache adapter, stream, and target tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/adapters/imdbDatasetCacheAdapter.ts backend/tests/imdbDatasetCacheAdapter.test.ts
git commit -m "feat: 添加 IMDb 本地缓存适配器"
```

## Task 5: Add CLI Entrypoint and Cache Directory Setting

**Files:**
- Create: `backend/src/scripts/syncImdb.ts`
- Modify: `backend/package.json`
- Modify: `backend/src/settings/settingsFields.ts`
- Modify: `backend/tests/runtimeSettings.test.ts`

**Interfaces:**
- Produces CLI command: `npm run sync:imdb --workspace backend`
- Produces known setting key: `IMDB_DATASET_CACHE_DIR`

- [ ] **Step 1: Write failing settings test**

Append to `backend/tests/runtimeSettings.test.ts`:

```ts
it("accepts IMDb cache directory as a non-sensitive local setting", async () => {
  const settings = await fixtureSettings("IMDB_DATASET_CACHE_DIR=/data/imdb\n")

  expect(settings.fieldView("IMDB_DATASET_CACHE_DIR")).toMatchObject({
    key: "IMDB_DATASET_CACHE_DIR",
    sensitive: false,
    value: "/data/imdb",
    configured: true
  })

  await settings.update({ IMDB_DATASET_CACHE_DIR: "/new/cache" }, [])
  expect(settings.get("IMDB_DATASET_CACHE_DIR")).toBe("/new/cache")
})
```

- [ ] **Step 2: Run settings test to verify it fails**

Run:

```bash
npm test --workspace backend -- runtimeSettings
```

Expected: fail because `IMDB_DATASET_CACHE_DIR` is not whitelisted.

- [ ] **Step 3: Whitelist cache dir setting**

Add `"IMDB_DATASET_CACHE_DIR"` to `GLOBAL_SETTING_KEYS` in `backend/src/settings/settingsFields.ts`.

- [ ] **Step 4: Add CLI script**

Create `backend/src/scripts/syncImdb.ts`:

```ts
import { createImdbDatasetCacheAdapter } from "../adapters/imdbDatasetCacheAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { loadExistingMediaCandidates } from "../services/mediaCandidateService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

let exitCode = 0

try {
  await runtimeSettings.load()
  const cacheDir = runtimeSettings.get("IMDB_DATASET_CACHE_DIR").trim()

  if (!cacheDir) {
    console.log("source=imdb status=missing_cache_dir items=0")
    exitCode = 1
  } else {
    const candidates = await loadExistingMediaCandidates(db)
    const adapter = createImdbDatasetCacheAdapter({ cacheDir, candidates })
    const run = await runSourceSync(db, adapter)
    console.log(`source=${run.source} scope=${run.scope ?? "datasets_cache"} status=${run.status} items=${run.itemCount}`)
    if (run.status !== "success") exitCode = 1
  }
} catch {
  console.log("source=imdb scope=datasets_cache status=failed items=0")
  exitCode = 1
} finally {
  await db.$disconnect()
}

if (exitCode !== 0) process.exit(exitCode)
```

Add to `backend/package.json` scripts:

```json
"sync:imdb": "tsx src/scripts/syncImdb.ts"
```

- [ ] **Step 5: Verify settings test and script typecheck**

Run:

```bash
npm test --workspace backend -- runtimeSettings
npm run typecheck --workspace backend
```

Expected: settings tests pass and backend typecheck passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/scripts/syncImdb.ts backend/package.json backend/src/settings/settingsFields.ts backend/tests/runtimeSettings.test.ts
git commit -m "feat: 添加 IMDb 手动同步入口"
```

## Task 6: Final Verification and Push

**Files:**
- All files touched above.

- [ ] **Step 1: Run focused IMDb tests**

Run:

```bash
npm test --workspace backend -- imdbDataset
```

Expected: IMDb parser, target, stream, and cache adapter tests pass.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: typecheck, backend tests, frontend tests, and build all pass.

- [ ] **Step 3: Confirm services were not started**

Run:

```bash
lsof -nP -iTCP:19992 -sTCP:LISTEN
lsof -nP -iTCP:19993 -sTCP:LISTEN
```

Expected: both commands have no listening process for WhatsNew.

- [ ] **Step 4: Push branch**

Run:

```bash
git push
```

Expected: `codex/whatsnew-mvp` is pushed to `origin`.
