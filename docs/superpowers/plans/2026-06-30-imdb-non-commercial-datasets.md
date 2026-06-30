# IMDb Non-Commercial Datasets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first IMDb Non-Commercial Datasets foundation: parse small TSV samples and map accepted IMDb rows into safe `AdapterItem` objects without creating unmatched media.

**Architecture:** Keep this phase pure and testable. Add an IMDb parser module under `backend/src/adapters/`, keep the IMDb source catalog planned, and do not register a scheduled adapter until streaming download and cache handling exist.

**Tech Stack:** TypeScript, Vitest, existing `AdapterItem` domain interfaces, existing source sync semantics.

## Global Constraints

- IMDb integration must use Non-Commercial Datasets only.
- Do not use IMDb Developer commercial API, Meters, TVMeter, Most Popular, or paid bulk products.
- Do not create unknown media from IMDb full datasets; mapped `AdapterItem` must set `createIfMissing=false`.
- IMDb rating is a `metadata_rating` signal with `rank=null`; it must not contribute to heat ranking.
- No database schema change in this phase.
- No automatic hourly or daily IMDb download in this phase.
- All new TypeScript uses 2-space indentation and no semicolons.

---

## File Structure

- Create `backend/src/adapters/imdbDatasetsParser.ts`: parse TSV text, normalize `\N`, map title basics and ratings rows.
- Create `backend/tests/imdbDatasetsParser.test.ts`: verify parsing and mapping behavior.
- No changes to adapter registry in this phase.

## Task 1: Parse IMDb TSV Rows

**Files:**
- Create: `backend/tests/imdbDatasetsParser.test.ts`
- Create: `backend/src/adapters/imdbDatasetsParser.ts`

**Interfaces:**
- Produces:
  - `parseImdbTitleBasics(text: string): ImdbTitleBasicsRow[]`
  - `parseImdbTitleRatings(text: string): ImdbTitleRatingRow[]`
- Consumes: plain TSV strings with a header row.

- [ ] **Step 1: Write failing parser tests**

Add tests:

```ts
const basicsText = [
  "tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres",
  "tt1000001\tmovie\tMidnight File\tMidnight File\t0\t2026\t\\N\t112\tDrama,Mystery"
].join("\n")

expect(parseImdbTitleBasics(basicsText)).toEqual([{
  tconst: "tt1000001",
  titleType: "movie",
  primaryTitle: "Midnight File",
  originalTitle: "Midnight File",
  isAdult: false,
  startYear: 2026,
  endYear: null,
  runtimeMinutes: 112,
  genres: ["Drama", "Mystery"]
}])
```

Add a ratings test:

```ts
const ratingsText = [
  "tconst\taverageRating\tnumVotes",
  "tt1000001\t7.8\t120345"
].join("\n")

expect(parseImdbTitleRatings(ratingsText)).toEqual([{
  tconst: "tt1000001",
  averageRating: 7.8,
  numVotes: 120345
}])
```

- [ ] **Step 2: Run the parser tests**

Run: `npm test --workspace backend -- imdbDatasetsParser`

Expected: fail because `imdbDatasetsParser.ts` does not exist yet.

- [ ] **Step 3: Implement parser functions**

Create `backend/src/adapters/imdbDatasetsParser.ts` with:

```ts
export type ImdbTitleBasicsRow = {
  tconst: string
  titleType: string
  primaryTitle: string
  originalTitle: string | null
  isAdult: boolean
  startYear: number | null
  endYear: number | null
  runtimeMinutes: number | null
  genres: string[]
}

export type ImdbTitleRatingRow = {
  tconst: string
  averageRating: number
  numVotes: number
}
```

Use a shared TSV parser that:

- splits lines by `\n`
- trims trailing `\r`
- reads the first line as headers
- maps `\N` and empty strings to `null`
- throws `IMDb TSV 缺少必需字段: <field>` when a required column is missing

- [ ] **Step 4: Verify parser tests pass**

Run: `npm test --workspace backend -- imdbDatasetsParser`

Expected: tests pass.

## Task 2: Map IMDb Rows to Adapter Items

**Files:**
- Modify: `backend/tests/imdbDatasetsParser.test.ts`
- Modify: `backend/src/adapters/imdbDatasetsParser.ts`

**Interfaces:**
- Produces:
  - `imdbRowsToAdapterItem(basics: ImdbTitleBasicsRow, rating?: ImdbTitleRatingRow): AdapterItem | null`
- Consumes: parsed IMDb row objects.

- [ ] **Step 1: Write failing mapping tests**

Add tests that assert:

```ts
expect(imdbRowsToAdapterItem(movieBasics, rating)).toMatchObject({
  createIfMissing: false,
  media: {
    source: "imdb",
    sourceId: "imdb:tt1000001",
    mediaType: "movie",
    releaseForm: "theatrical_movie",
    imdbId: "tt1000001",
    firstReleaseDate: "2026-01-01"
  },
  releases: [],
  popularitySignals: [{
    source: "imdb_rating",
    sourceCategory: "metadata_rating",
    platform: "IMDb",
    region: "GLOBAL",
    window: "lifetime",
    rank: null,
    value: 7.8,
    valueLabel: "7.8/10 · 120,345 votes"
  }]
})
```

Also assert:

```ts
expect(imdbRowsToAdapterItem({ ...movieBasics, isAdult: true }, rating)).toBeNull()
expect(imdbRowsToAdapterItem({ ...movieBasics, titleType: "tvEpisode" }, rating)).toBeNull()
```

- [ ] **Step 2: Run the mapping tests**

Run: `npm test --workspace backend -- imdbDatasetsParser`

Expected: fail because `imdbRowsToAdapterItem` is not implemented.

- [ ] **Step 3: Implement mapping**

Mapping rules:

```ts
const TITLE_TYPE_MAP = {
  movie: { mediaType: "movie", releaseForm: "theatrical_movie" },
  tvMovie: { mediaType: "movie", releaseForm: "streaming_movie" },
  tvSeries: { mediaType: "series", releaseForm: "tv_series" },
  tvMiniSeries: { mediaType: "series", releaseForm: "tv_series" }
} as const
```

Return `null` for unsupported title types and adult rows. Use `new Intl.NumberFormat("en-US").format(numVotes)` for `valueLabel`.

- [ ] **Step 4: Verify mapping tests pass**

Run: `npm test --workspace backend -- imdbDatasetsParser`

Expected: all IMDb parser tests pass.

## Task 3: Final Verification and Commit

**Files:**
- `backend/src/adapters/imdbDatasetsParser.ts`
- `backend/tests/imdbDatasetsParser.test.ts`

- [ ] **Step 1: Run verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: typecheck, backend tests, frontend tests, and build all pass.

- [ ] **Step 2: Commit**

Run:

```bash
git add backend/src/adapters/imdbDatasetsParser.ts backend/tests/imdbDatasetsParser.test.ts
git commit -m "feat: 添加 IMDb 数据集解析基础"
```
