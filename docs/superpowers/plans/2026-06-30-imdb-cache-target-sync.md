# IMDb Cache Target Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first IMDb cache sync middle layer by filtering IMDb dataset rows against the current local media library before producing `AdapterItem` objects.

**Architecture:** Keep this phase pure and testable. Add `imdbDatasetTargets.ts` beside the parser; it builds an in-memory target index from existing media candidates, filters IMDb basics rows by precise IMDb ID or conservative title-year-mediaType keys, and only maps matched rows to non-creating adapter items.

**Tech Stack:** TypeScript, Vitest, existing `ExistingMediaCandidate`, existing `normalizeTitle()`, existing IMDb parser and `AdapterItem` interfaces.

## Global Constraints

- IMDb integration must use Non-Commercial Datasets only.
- Do not use IMDb Developer commercial API, Meters, TVMeter, Most Popular, or paid bulk products.
- Do not create unknown media from IMDb full datasets; mapped `AdapterItem` must keep `createIfMissing=false`.
- IMDb rating is a `metadata_rating` signal with `rank=null`; it must not contribute to heat ranking.
- Do not register IMDb scheduler, settings UI enablement, or automatic download in this phase.
- Do not add a Prisma schema change in this phase.
- Do not set `completePopularitySources` for IMDb rating partial imports.
- All new TypeScript uses 2-space indentation and no semicolons.

---

## File Structure

- Create `backend/src/adapters/imdbDatasetTargets.ts`: pure target-index and filtering helpers.
- Create `backend/tests/imdbDatasetTargets.test.ts`: target matching and filtering tests.
- Reuse `backend/src/adapters/imdbDatasetsParser.ts`: existing row types and mapping function.
- Reuse `backend/src/domain/types.ts`: existing `ExistingMediaCandidate` and `AdapterItem`.

## Task 1: Build IMDb Target Index

**Files:**
- Create: `backend/tests/imdbDatasetTargets.test.ts`
- Create: `backend/src/adapters/imdbDatasetTargets.ts`

**Interfaces:**
- Consumes:
  - `ExistingMediaCandidate[]` from `backend/src/domain/types.ts`
  - `ImdbTitleBasicsRow` from `backend/src/adapters/imdbDatasetsParser.ts`
- Produces:
  - `type ImdbTargetIndex = { imdbIds: Set<string>, titleYearMediaTypeKeys: Set<string> }`
  - `createImdbTargetIndex(candidates: ExistingMediaCandidate[]): ImdbTargetIndex`
  - `imdbRowMatchesTargets(row: ImdbTitleBasicsRow, targets: ImdbTargetIndex): boolean`

- [ ] **Step 1: Write the failing index tests**

Create `backend/tests/imdbDatasetTargets.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import {
  createImdbTargetIndex,
  imdbRowMatchesTargets
} from "../src/adapters/imdbDatasetTargets.js"
import type { ImdbTitleBasicsRow } from "../src/adapters/imdbDatasetsParser.js"
import type { ExistingMediaCandidate } from "../src/domain/types.js"

function candidate(overrides: Partial<ExistingMediaCandidate>): ExistingMediaCandidate {
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
    imdbId: null,
    traktId: null,
    tvdbId: null,
    ...overrides
  }
}

function imdbRow(overrides: Partial<ImdbTitleBasicsRow>): ImdbTitleBasicsRow {
  return {
    tconst: "tt1000001",
    titleType: "movie",
    primaryTitle: "Midnight File",
    originalTitle: "Midnight Archive",
    isAdult: false,
    startYear: 2026,
    endYear: null,
    runtimeMinutes: 112,
    genres: ["Drama"],
    ...overrides
  }
}

describe("IMDb dataset targets", () => {
  it("matches existing media by IMDb ID before title keys", () => {
    const targets = createImdbTargetIndex([
      candidate({ imdbId: "tt2000002", titleDisplay: "Different Title" })
    ])

    expect(imdbRowMatchesTargets(imdbRow({ tconst: "tt2000002", primaryTitle: "Noisy Title" }), targets)).toBe(true)
  })

  it("matches media without IMDb ID by normalized title, year, and media type", () => {
    const targets = createImdbTargetIndex([
      candidate({ imdbId: null, titleAliases: ["Midnight Archive"] })
    ])

    expect(imdbRowMatchesTargets(imdbRow({ primaryTitle: "Midnight Archive" }), targets)).toBe(true)
  })

  it("does not match title keys when year differs", () => {
    const targets = createImdbTargetIndex([candidate({ imdbId: null })])

    expect(imdbRowMatchesTargets(imdbRow({ startYear: 2025 }), targets)).toBe(false)
  })

  it("does not match title keys when media type differs", () => {
    const targets = createImdbTargetIndex([candidate({ mediaType: "series", imdbId: null })])

    expect(imdbRowMatchesTargets(imdbRow({ titleType: "movie" }), targets)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test --workspace backend -- imdbDatasetTargets
```

Expected: fail because `backend/src/adapters/imdbDatasetTargets.ts` does not exist.

- [ ] **Step 3: Implement the target index**

Create `backend/src/adapters/imdbDatasetTargets.ts` with:

```ts
import type { MediaType } from "@whatsnew/shared/media"
import { normalizeTitle } from "../domain/normalizer.js"
import type { ExistingMediaCandidate } from "../domain/types.js"
import type { ImdbTitleBasicsRow } from "./imdbDatasetsParser.js"

export type ImdbTargetIndex = {
  imdbIds: Set<string>
  titleYearMediaTypeKeys: Set<string>
}

const TITLE_TYPE_MEDIA_TYPE: Record<string, MediaType> = {
  movie: "movie",
  tvMovie: "movie",
  tvSeries: "series",
  tvMiniSeries: "series"
}

function yearFromDate(date: string | null): number | null {
  if (!date) return null
  const parsed = Number(date.slice(0, 4))
  return Number.isFinite(parsed) ? parsed : null
}

function targetKey(title: string, year: number, mediaType: MediaType): string | null {
  const normalizedTitle = normalizeTitle(title)
  return normalizedTitle ? `${mediaType}:${year}:${normalizedTitle}` : null
}

function rowMediaType(row: ImdbTitleBasicsRow): MediaType | null {
  return TITLE_TYPE_MEDIA_TYPE[row.titleType] ?? null
}

export function createImdbTargetIndex(candidates: ExistingMediaCandidate[]): ImdbTargetIndex {
  const imdbIds = new Set<string>()
  const titleYearMediaTypeKeys = new Set<string>()

  for (const candidate of candidates) {
    if (candidate.imdbId) imdbIds.add(candidate.imdbId)

    const year = yearFromDate(candidate.firstReleaseDate)
    if (year == null || candidate.imdbId) continue

    for (const title of [candidate.titleDisplay, ...candidate.titleAliases]) {
      const key = targetKey(title, year, candidate.mediaType)
      if (key) titleYearMediaTypeKeys.add(key)
    }
  }

  return { imdbIds, titleYearMediaTypeKeys }
}

export function imdbRowMatchesTargets(row: ImdbTitleBasicsRow, targets: ImdbTargetIndex): boolean {
  if (targets.imdbIds.has(row.tconst)) return true

  const mediaType = rowMediaType(row)
  if (mediaType == null || row.startYear == null) return false

  const titles = [row.primaryTitle, row.originalTitle ?? ""]
  return titles.some((title) => {
    const key = targetKey(title, row.startYear ?? 0, mediaType)
    return key != null && targets.titleYearMediaTypeKeys.has(key)
  })
}
```

- [ ] **Step 4: Verify target index tests pass**

Run:

```bash
npm test --workspace backend -- imdbDatasetTargets
```

Expected: all target index tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/adapters/imdbDatasetTargets.ts backend/tests/imdbDatasetTargets.test.ts
git commit -m "feat: 添加 IMDb 目标索引"
```

## Task 2: Filter IMDb Rows Into Adapter Items

**Files:**
- Modify: `backend/tests/imdbDatasetTargets.test.ts`
- Modify: `backend/src/adapters/imdbDatasetTargets.ts`

**Interfaces:**
- Consumes:
  - `ImdbTitleBasicsRow[]`
  - `ImdbTitleRatingRow[]`
  - `ImdbTargetIndex`
- Produces:
  - `filterImdbRowsForTargets(basicsRows: ImdbTitleBasicsRow[], ratingRows: ImdbTitleRatingRow[], targets: ImdbTargetIndex): AdapterItem[]`

- [ ] **Step 1: Write the failing filter tests**

First change the top-level imports to include `filterImdbRowsForTargets` and `ImdbTitleRatingRow`:

```ts
import { describe, expect, it } from "vitest"
import {
  createImdbTargetIndex,
  filterImdbRowsForTargets,
  imdbRowMatchesTargets
} from "../src/adapters/imdbDatasetTargets.js"
import type {
  ImdbTitleBasicsRow,
  ImdbTitleRatingRow
} from "../src/adapters/imdbDatasetsParser.js"
import type { ExistingMediaCandidate } from "../src/domain/types.js"
```

Then append these tests inside the existing `describe` block:

```ts
it("maps only matched basics rows and attaches matching ratings", () => {
  const targets = createImdbTargetIndex([candidate({ imdbId: "tt1000001" })])
  const ratings: ImdbTitleRatingRow[] = [
    { tconst: "tt1000001", averageRating: 7.8, numVotes: 120345 },
    { tconst: "tt9999999", averageRating: 9.1, numVotes: 10 }
  ]

  const items = filterImdbRowsForTargets([
    imdbRow({ tconst: "tt1000001" }),
    imdbRow({ tconst: "tt9999999", primaryTitle: "Unknown Film" })
  ], ratings, targets)

  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({
    createIfMissing: false,
    media: { imdbId: "tt1000001" },
    popularitySignals: [{ source: "imdb_rating", value: 7.8 }]
  })
})

it("drops matched rows that the IMDb adapter mapping rejects", () => {
  const targets = createImdbTargetIndex([candidate({ imdbId: "tt1000001" })])

  expect(filterImdbRowsForTargets([
    imdbRow({ tconst: "tt1000001", isAdult: true })
  ], [], targets)).toEqual([])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test --workspace backend -- imdbDatasetTargets
```

Expected: fail because `filterImdbRowsForTargets` is not implemented.

- [ ] **Step 3: Implement row filtering**

Add to `backend/src/adapters/imdbDatasetTargets.ts`:

```ts
import type { AdapterItem } from "../domain/types.js"
import {
  imdbRowsToAdapterItem,
  type ImdbTitleRatingRow
} from "./imdbDatasetsParser.js"

export function filterImdbRowsForTargets(
  basicsRows: ImdbTitleBasicsRow[],
  ratingRows: ImdbTitleRatingRow[],
  targets: ImdbTargetIndex
): AdapterItem[] {
  const ratingsByTconst = new Map(ratingRows.map((rating) => [rating.tconst, rating]))
  const items: AdapterItem[] = []

  for (const row of basicsRows) {
    if (!imdbRowMatchesTargets(row, targets)) continue

    const item = imdbRowsToAdapterItem(row, ratingsByTconst.get(row.tconst))
    if (item) items.push(item)
  }

  return items
}
```

- [ ] **Step 4: Verify filter tests pass**

Run:

```bash
npm test --workspace backend -- imdbDatasetTargets
```

Expected: all target filter tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/adapters/imdbDatasetTargets.ts backend/tests/imdbDatasetTargets.test.ts
git commit -m "feat: 筛选 IMDb 目标作品"
```

## Task 3: Final Verification and Push

**Files:**
- `backend/src/adapters/imdbDatasetTargets.ts`
- `backend/tests/imdbDatasetTargets.test.ts`

- [ ] **Step 1: Run focused IMDb tests**

Run:

```bash
npm test --workspace backend -- imdbDataset
```

Expected: IMDb parser and target tests pass.

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
