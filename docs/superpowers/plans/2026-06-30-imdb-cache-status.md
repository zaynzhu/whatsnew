# IMDb Cache Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose IMDb local dataset cache readiness in settings/source APIs and show it in the existing admin UI.

**Architecture:** Add a focused backend service that inspects only the configured IMDb dataset cache files and sidecar metadata. Extend shared source settings types with an optional `localState`, attach IMDb state in both source-related API routes, then render compact status summaries in the existing source registry and source catalog screens.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Express routers, React, Vitest, React Testing Library.

## Global Constraints

- Do not expose the raw `IMDB_DATASET_CACHE_DIR` path in `localState`.
- Do not perform network checks from the status service.
- Do not add a front-end download button.
- Keep IMDb `implementationStatus="planned"` and do not register it in scheduler.
- Do not add a Prisma migration.
- JavaScript and TypeScript use 2-space indentation and no semicolons.

---

## File Structure

- Modify `shared/src/settings.ts`: add local-state types and `localState` on `SourceSettingsView`.
- Create `backend/src/services/imdbCacheStatusService.ts`: inspect required IMDb files and sidecar metadata.
- Create `backend/tests/imdbCacheStatusService.test.ts`: service status coverage.
- Modify `backend/src/settings/sourceCatalog.ts`: add `localSettingKeys` and attach `IMDB_DATASET_CACHE_DIR` to IMDb.
- Modify `backend/src/routes/settings.ts` and `backend/src/routes/sources.ts`: include local fields and local state.
- Modify `backend/tests/settingsApi.test.ts` and `backend/tests/sourceCatalog.test.ts`: API and catalog coverage.
- Modify `frontend/src/utils/sourceLocalState.ts`: labels and formatting helpers.
- Modify `frontend/src/pages/SettingsPage.tsx` and `frontend/src/pages/SourcesPage.tsx`: render status summaries.
- Modify `frontend/tests/settingsPage.test.tsx` and `frontend/tests/pages.test.tsx`: UI coverage.

## Task 1: IMDb Cache Status Service

**Files:**
- Create: `backend/src/services/imdbCacheStatusService.ts`
- Modify: `shared/src/settings.ts`
- Test: `backend/tests/imdbCacheStatusService.test.ts`

**Interfaces:**
- Consumes: `IMDB_DATASET_DOWNLOADS` from `backend/src/adapters/imdbDatasetDownloader.ts`
- Produces: `getImdbCacheStatus(cacheDir: string): Promise<SourceLocalStateView>`

- [ ] **Step 1: Add shared types and failing tests**

Add `SourceLocalFileState` and `SourceLocalStateView` in `shared/src/settings.ts`, and add `localState: SourceLocalStateView | null` to `SourceSettingsView`.

Create `backend/tests/imdbCacheStatusService.test.ts` covering:

```ts
expect(await getImdbCacheStatus("")).toMatchObject({
  kind: "imdb_datasets",
  status: "missing_config",
  configured: false,
  readyFiles: 0,
  totalFiles: 2
})
```

Also cover ready files, missing files, missing metadata, and size mismatch with temp files.

- [ ] **Step 2: Run service tests to verify failure**

Run:

```bash
npm test --workspace backend -- imdbCacheStatusService
```

Expected: fail because `imdbCacheStatusService.ts` does not exist.

- [ ] **Step 3: Implement service**

Create `backend/src/services/imdbCacheStatusService.ts`:

```ts
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import type { SourceLocalFileState, SourceLocalStateView } from "@whatsnew/shared/settings"
import { IMDB_DATASET_DOWNLOADS } from "../adapters/imdbDatasetDownloader.js"

type ImdbDatasetMetadata = {
  etag?: string | null
  lastModified?: string | null
  contentLength?: number | null
  bytesWritten?: number | null
  downloadedAt?: string | null
}

async function safeStat(filePath: string) {
  try {
    return await stat(filePath)
  } catch {
    return null
  }
}

async function readMetadata(filePath: string): Promise<ImdbDatasetMetadata | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as ImdbDatasetMetadata
  } catch {
    return null
  }
}

function fileIssue(sizeBytes: number | null, metadata: ImdbDatasetMetadata | null): SourceLocalFileState["issue"] {
  if (sizeBytes == null) return "missing_file"
  if (!metadata) return "missing_metadata"
  const expected = metadata.bytesWritten ?? metadata.contentLength ?? null
  if (expected != null && expected !== sizeBytes) return "size_mismatch"
  return null
}

export async function getImdbCacheStatus(cacheDir: string): Promise<SourceLocalStateView> {
  const configured = cacheDir.trim().length > 0
  if (!configured) {
    return {
      kind: "imdb_datasets",
      status: "missing_config",
      configured: false,
      readyFiles: 0,
      totalFiles: IMDB_DATASET_DOWNLOADS.length,
      files: IMDB_DATASET_DOWNLOADS.map((dataset) => ({
        fileName: dataset.fileName,
        exists: false,
        sizeBytes: null,
        expectedBytes: null,
        downloadedAt: null,
        lastModified: null,
        etag: null,
        issue: "missing_file"
      }))
    }
  }

  const files = await Promise.all(IMDB_DATASET_DOWNLOADS.map(async (dataset) => {
    const filePath = join(cacheDir, dataset.fileName)
    const metadataPath = `${filePath}.meta.json`
    const fileStat = await safeStat(filePath)
    const metadata = await readMetadata(metadataPath)
    const sizeBytes = fileStat?.size ?? null
    const issue = fileIssue(sizeBytes, metadata)
    return {
      fileName: dataset.fileName,
      exists: sizeBytes != null,
      sizeBytes,
      expectedBytes: metadata?.bytesWritten ?? metadata?.contentLength ?? null,
      downloadedAt: metadata?.downloadedAt ?? null,
      lastModified: metadata?.lastModified ?? null,
      etag: metadata?.etag ?? null,
      issue
    }
  }))

  const readyFiles = files.filter((file) => file.issue === null).length
  const missingFiles = files.some((file) => file.issue === "missing_file")
  const status = readyFiles === files.length ? "ready" : missingFiles ? "missing_files" : "partial"

  return {
    kind: "imdb_datasets",
    status,
    configured: true,
    readyFiles,
    totalFiles: files.length,
    files
  }
}
```

- [ ] **Step 4: Run service tests to verify pass**

Run:

```bash
npm test --workspace backend -- imdbCacheStatusService
npm run typecheck --workspace backend
```

- [ ] **Step 5: Commit**

```bash
git add shared/src/settings.ts backend/src/services/imdbCacheStatusService.ts backend/tests/imdbCacheStatusService.test.ts
git commit -m "feat: 添加 IMDb 缓存状态服务"
```

## Task 2: API and Settings Field Wiring

**Files:**
- Modify: `backend/src/settings/sourceCatalog.ts`
- Modify: `backend/src/routes/settings.ts`
- Modify: `backend/src/routes/sources.ts`
- Test: `backend/tests/settingsApi.test.ts`
- Test: `backend/tests/sourceCatalog.test.ts`

**Interfaces:**
- Consumes: `getImdbCacheStatus(cacheDir)`
- Produces: IMDb `fields` includes `IMDB_DATASET_CACHE_DIR`; IMDb source views include `localState`

- [ ] **Step 1: Write failing API tests**

Update `backend/tests/settingsApi.test.ts` setup to create a temp IMDb cache directory with two tiny files and sidecars. Add:

```ts
expect(imdb.localState).toMatchObject({
  kind: "imdb_datasets",
  status: "ready",
  readyFiles: 2,
  totalFiles: 2
})
expect(JSON.stringify(response.body)).not.toContain(tempDir)
```

Also assert `imdb.fields` contains `IMDB_DATASET_CACHE_DIR`.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test --workspace backend -- settingsApi sourceCatalog
```

Expected: fail because `localState` and `localSettingKeys` are not wired.

- [ ] **Step 3: Implement catalog and route wiring**

In `SourceDefinition`, add:

```ts
localSettingKeys: readonly string[]
```

Extend `source()` with a final optional `localSettingKeys: string[] = []`, and pass `["IMDB_DATASET_CACHE_DIR"]` for IMDb.

In both routers, create a local helper:

```ts
async function sourceLocalState(sourceId: string, settings: RuntimeSettingsService) {
  if (sourceId !== "imdb") return null
  return getImdbCacheStatus(settings.get("IMDB_DATASET_CACHE_DIR"))
}
```

Because this helper is async, build source views with `await Promise.all(SOURCE_CATALOG.map(async (source) => ...))`.

When building settings fields, include:

```ts
...source.localSettingKeys.map((key) => settings.fieldView(key, fieldLabel(key, key)))
```

Add `IMDB_DATASET_CACHE_DIR: "IMDb 数据集缓存目录"` to `FIELD_LABELS`.

- [ ] **Step 4: Run API tests to verify pass**

Run:

```bash
npm test --workspace backend -- settingsApi sourceCatalog imdbCacheStatusService
npm run typecheck --workspace backend
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/settings/sourceCatalog.ts backend/src/routes/settings.ts backend/src/routes/sources.ts backend/tests/settingsApi.test.ts backend/tests/sourceCatalog.test.ts
git commit -m "feat: 暴露 IMDb 缓存状态"
```

## Task 3: Frontend Display

**Files:**
- Create: `frontend/src/utils/sourceLocalState.ts`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/pages/SourcesPage.tsx`
- Test: `frontend/tests/settingsPage.test.tsx`
- Test: `frontend/tests/pages.test.tsx`

**Interfaces:**
- Consumes: `source.localState`
- Produces: compact local cache summary in source rows

- [ ] **Step 1: Write failing frontend tests**

Add an IMDb fixture with:

```ts
localState: {
  kind: "imdb_datasets",
  status: "ready",
  configured: true,
  readyFiles: 2,
  totalFiles: 2,
  files: []
}
```

Assert settings page shows `缓存就绪` and `2/2 文件`, and IMDb config dialog shows `IMDb 数据集缓存目录`.

Add a sources page fixture and assert it shows the same local state.

- [ ] **Step 2: Run frontend tests to verify failure**

Run:

```bash
npm test --workspace frontend -- settingsPage pages
```

- [ ] **Step 3: Implement display helpers and UI**

Create `frontend/src/utils/sourceLocalState.ts`:

```ts
import type { SourceLocalStateView } from "@whatsnew/shared/settings"

export const SOURCE_LOCAL_STATE_LABELS: Record<SourceLocalStateView["status"], string> = {
  missing_config: "缺少缓存目录",
  missing_files: "缺少缓存文件",
  partial: "缓存需检查",
  ready: "缓存就绪"
}

export function sourceLocalStateDetail(localState: SourceLocalStateView): string {
  const latestDownloadedAt = localState.files
    .map((file) => file.downloadedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  const date = latestDownloadedAt ? ` · ${latestDownloadedAt.slice(0, 10)}` : ""
  return `${localState.readyFiles}/${localState.totalFiles} 文件${date}`
}
```

Use these helpers in settings/source rows before falling back to latest sync text.

- [ ] **Step 4: Run frontend tests to verify pass**

Run:

```bash
npm test --workspace frontend -- settingsPage pages
npm run typecheck --workspace frontend
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sourceLocalState.ts frontend/src/pages/SettingsPage.tsx frontend/src/pages/SourcesPage.tsx frontend/tests/settingsPage.test.tsx frontend/tests/pages.test.tsx
git commit -m "feat: 展示 IMDb 缓存状态"
```

## Final Verification

- [ ] Run:

```bash
npm run typecheck
npm test
npm run build
lsof -nP -iTCP:19992 -sTCP:LISTEN
lsof -nP -iTCP:19993 -sTCP:LISTEN
```

- [ ] Confirm git status is clean.
- [ ] Push:

```bash
git push
```
