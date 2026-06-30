# IMDb Cache Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual IMDb dataset download command that streams official gzip files into `IMDB_DATASET_CACHE_DIR` safely.

**Architecture:** Add a downloader module that uses `SourceHttpClient.request()` for HEAD and GET, writes GET bodies to temporary files through Node streams, atomically renames completed files, and writes sidecar metadata. Add a testable CLI wrapper and an npm script without registering IMDb in scheduler or front-end source controls.

**Tech Stack:** TypeScript, Node.js `fs`/`stream`, Undici `Response`, Vitest, existing `SourceHttpClient`, existing runtime settings and proxy capture helpers.

## Global Constraints

- Download only the official IMDb Non-Commercial Dataset gzip URLs.
- Read and write only under `IMDB_DATASET_CACHE_DIR`.
- Use stream pipeline; do not use `fetchBuffer()` or load full gzip files into memory.
- Write to `<fileName>.download` first and rename only after success.
- Preserve old cache files when a download fails.
- Skip download when local file and sidecar metadata match remote `etag` or `last-modified`.
- Keep IMDb source `planned`; do not register it in hourly/daily adapter registry.
- Do not make `sync:imdb` auto-download in this phase.
- Do not add front-end controls.
- All new TypeScript uses 2-space indentation and no semicolons.

---

## File Structure

- Create `backend/src/adapters/imdbDatasetDownloader.ts`: dataset definitions, HEAD metadata, stream download, sidecar metadata.
- Create `backend/tests/imdbDatasetDownloader.test.ts`: downloader stream, skip, failure cleanup, content-length mismatch tests.
- Create `backend/src/scripts/downloadImdb.ts`: testable CLI wrapper and executable entrypoint.
- Create `backend/tests/downloadImdbScript.test.ts`: missing cache dir behavior.
- Modify `backend/package.json`: add `download:imdb`.

## Task 1: IMDb Dataset Downloader

**Files:**
- Create: `backend/src/adapters/imdbDatasetDownloader.ts`
- Test: `backend/tests/imdbDatasetDownloader.test.ts`

**Interfaces:**
- Consumes: `SourceHttpClient.request(sourceId, url, options)`
- Produces:
  - `IMDB_DATASET_DOWNLOADS`
  - `type ImdbDatasetDownloadResult`
  - `downloadImdbDatasets(options): Promise<ImdbDatasetDownloadResult[]>`

- [ ] **Step 1: Write failing downloader tests**

Create `backend/tests/imdbDatasetDownloader.test.ts`:

```ts
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Response } from "undici"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  downloadImdbDatasets,
  type ImdbDatasetDownloadSpec
} from "../src/adapters/imdbDatasetDownloader.js"

let tempDir: string

const dataset: ImdbDatasetDownloadSpec = {
  fileName: "title.test.tsv.gz",
  url: "https://datasets.imdbws.com/title.test.tsv.gz"
}

function clientWithBodies(bodies: Array<Uint8Array | Error>, headers: Record<string, string> = {}) {
  let getIndex = 0
  return {
    request: vi.fn(async (_sourceId: string, _url: string, options: any) => {
      if (options.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: {
            etag: "\"etag-1\"",
            "last-modified": "Mon, 29 Jun 2026 12:34:11 GMT",
            "content-length": String(bodies[0] instanceof Error ? 4 : bodies[0].byteLength),
            ...headers
          }
        })
      }

      const body = bodies[getIndex++]
      if (body instanceof Error) throw body
      return new Response(body, { status: 200, headers })
    })
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "whatsnew-imdb-download-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe("IMDb dataset downloader", () => {
  it("streams a dataset to a temp file, renames it, and writes metadata", async () => {
    const body = Uint8Array.from([1, 2, 3, 4])
    const client = clientWithBodies([body])

    const [result] = await downloadImdbDatasets({
      cacheDir: tempDir,
      datasets: [dataset],
      httpClient: client as never,
      settingsOverride: {},
      now: () => new Date("2026-06-30T00:00:00.000Z")
    })

    expect(result).toMatchObject({
      fileName: "title.test.tsv.gz",
      status: "downloaded",
      bytesWritten: 4,
      contentLength: 4,
      etag: "\"etag-1\""
    })
    await expect(readFile(join(tempDir, "title.test.tsv.gz"))).resolves.toEqual(Buffer.from(body))
    await expect(stat(join(tempDir, "title.test.tsv.gz.download"))).rejects.toThrow()
    const metadata = JSON.parse(await readFile(join(tempDir, "title.test.tsv.gz.meta.json"), "utf8"))
    expect(metadata).toMatchObject({
      url: dataset.url,
      etag: "\"etag-1\"",
      bytesWritten: 4,
      downloadedAt: "2026-06-30T00:00:00.000Z"
    })
  })

  it("skips a dataset when local metadata matches the remote etag", async () => {
    await writeFile(join(tempDir, "title.test.tsv.gz"), Buffer.from([9]))
    await writeFile(join(tempDir, "title.test.tsv.gz.meta.json"), JSON.stringify({
      url: dataset.url,
      etag: "\"etag-1\"",
      lastModified: "old",
      contentLength: 1,
      bytesWritten: 1,
      downloadedAt: "2026-06-29T00:00:00.000Z"
    }))
    const client = clientWithBodies([Uint8Array.from([1])])

    const [result] = await downloadImdbDatasets({
      cacheDir: tempDir,
      datasets: [dataset],
      httpClient: client as never,
      settingsOverride: {}
    })

    expect(result.status).toBe("skipped")
    expect(client.request).toHaveBeenCalledTimes(1)
    await expect(readFile(join(tempDir, "title.test.tsv.gz"))).resolves.toEqual(Buffer.from([9]))
  })

  it("keeps the old cache file and removes the temp file when GET fails", async () => {
    await writeFile(join(tempDir, "title.test.tsv.gz"), Buffer.from([9]))
    const client = clientWithBodies([new Error("network failed")])

    await expect(downloadImdbDatasets({
      cacheDir: tempDir,
      datasets: [dataset],
      httpClient: client as never,
      settingsOverride: {}
    })).rejects.toThrow("network failed")

    await expect(readFile(join(tempDir, "title.test.tsv.gz"))).resolves.toEqual(Buffer.from([9]))
    await expect(stat(join(tempDir, "title.test.tsv.gz.download"))).rejects.toThrow()
  })

  it("rejects a content-length mismatch and does not publish the temp file", async () => {
    const client = clientWithBodies([Uint8Array.from([1, 2])], { "content-length": "4" })

    await expect(downloadImdbDatasets({
      cacheDir: tempDir,
      datasets: [dataset],
      httpClient: client as never,
      settingsOverride: {}
    })).rejects.toThrow("IMDb 数据集下载大小不一致: title.test.tsv.gz expected=4 actual=2")

    await expect(stat(join(tempDir, "title.test.tsv.gz"))).rejects.toThrow()
    await expect(stat(join(tempDir, "title.test.tsv.gz.download"))).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run downloader tests to verify they fail**

Run:

```bash
npm test --workspace backend -- imdbDatasetDownloader
```

Expected: fail because `imdbDatasetDownloader.ts` does not exist.

- [ ] **Step 3: Implement downloader**

Create `backend/src/adapters/imdbDatasetDownloader.ts`:

```ts
import { createWriteStream } from "node:fs"
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"
import { TITLE_BASICS_FILE, TITLE_RATINGS_FILE } from "./imdbDatasetCacheAdapter.js"

const IMDB_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000

export type ImdbDatasetDownloadSpec = {
  fileName: string
  url: string
}

export type ImdbDatasetDownloadResult = {
  fileName: string
  url: string
  status: "downloaded" | "skipped"
  bytesWritten: number
  contentLength: number | null
  etag: string | null
  lastModified: string | null
}

type ImdbDatasetMetadata = {
  url: string
  etag: string | null
  lastModified: string | null
  contentLength: number | null
  bytesWritten: number
  downloadedAt: string
}

type RemoteMetadata = {
  etag: string | null
  lastModified: string | null
  contentLength: number | null
}

export const IMDB_DATASET_DOWNLOADS: ImdbDatasetDownloadSpec[] = [
  { fileName: TITLE_BASICS_FILE, url: "https://datasets.imdbws.com/title.basics.tsv.gz" },
  { fileName: TITLE_RATINGS_FILE, url: "https://datasets.imdbws.com/title.ratings.tsv.gz" }
]

export type ImdbDatasetDownloadOptions = {
  cacheDir: string
  datasets?: ImdbDatasetDownloadSpec[]
  httpClient?: Pick<SourceHttpClient, "request">
  settings?: RuntimeSettingsService
  settingsOverride?: Record<string, string>
  now?: () => Date
}

class ByteCounter extends Transform {
  bytesWritten = 0

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
    this.bytesWritten += chunk.length
    callback(null, chunk)
  }
}

function numberHeader(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function readMetadata(filePath: string): Promise<ImdbDatasetMetadata | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as ImdbDatasetMetadata
  } catch {
    return null
  }
}

function metadataMatches(remote: RemoteMetadata, local: ImdbDatasetMetadata | null): boolean {
  if (!local) return false
  if (remote.etag && local.etag === remote.etag) return true
  if (remote.lastModified && local.lastModified === remote.lastModified) return true
  return false
}

async function headDataset(
  dataset: ImdbDatasetDownloadSpec,
  httpClient: Pick<SourceHttpClient, "request">,
  settingsOverride: Record<string, string>
): Promise<RemoteMetadata> {
  const response = await httpClient.request("imdb", dataset.url, {
    method: "HEAD",
    timeoutMs: IMDB_DOWNLOAD_TIMEOUT_MS,
    settingsOverride
  })

  return {
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    contentLength: numberHeader(response.headers.get("content-length"))
  }
}

async function downloadOne(
  dataset: ImdbDatasetDownloadSpec,
  remote: RemoteMetadata,
  options: Required<Omit<ImdbDatasetDownloadOptions, "datasets">> & { datasets: ImdbDatasetDownloadSpec[] },
  settingsOverride: Record<string, string>
): Promise<ImdbDatasetDownloadResult> {
  const targetPath = join(options.cacheDir, dataset.fileName)
  const tempPath = `${targetPath}.download`
  const metadataPath = `${targetPath}.meta.json`
  const localMetadata = await readMetadata(metadataPath)

  if (await fileExists(targetPath) && metadataMatches(remote, localMetadata)) {
    return {
      fileName: dataset.fileName,
      url: dataset.url,
      status: "skipped",
      bytesWritten: localMetadata?.bytesWritten ?? 0,
      contentLength: remote.contentLength,
      etag: remote.etag,
      lastModified: remote.lastModified
    }
  }

  await rm(tempPath, { force: true })
  try {
    const response = await options.httpClient.request("imdb", dataset.url, {
      method: "GET",
      timeoutMs: IMDB_DOWNLOAD_TIMEOUT_MS,
      settingsOverride
    })
    if (!response.body) throw new Error(`IMDb 数据集响应为空: ${dataset.fileName}`)

    const counter = new ByteCounter()
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      counter,
      createWriteStream(tempPath)
    )

    if (remote.contentLength != null && counter.bytesWritten !== remote.contentLength) {
      throw new Error(`IMDb 数据集下载大小不一致: ${dataset.fileName} expected=${remote.contentLength} actual=${counter.bytesWritten}`)
    }

    await rename(tempPath, targetPath)
    await writeFile(metadataPath, `${JSON.stringify({
      url: dataset.url,
      etag: remote.etag,
      lastModified: remote.lastModified,
      contentLength: remote.contentLength,
      bytesWritten: counter.bytesWritten,
      downloadedAt: options.now().toISOString()
    }, null, 2)}\n`)

    return {
      fileName: dataset.fileName,
      url: dataset.url,
      status: "downloaded",
      bytesWritten: counter.bytesWritten,
      contentLength: remote.contentLength,
      etag: remote.etag,
      lastModified: remote.lastModified
    }
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}

export async function downloadImdbDatasets(options: ImdbDatasetDownloadOptions): Promise<ImdbDatasetDownloadResult[]> {
  const settings = options.settings ?? runtimeSettings
  const currentSettings = settings.view(options.settingsOverride ?? {})
  const settingsOverride = captureSourceProxySettings(currentSettings, "imdb")
  const normalized = {
    cacheDir: options.cacheDir,
    datasets: options.datasets ?? IMDB_DATASET_DOWNLOADS,
    httpClient: options.httpClient ?? sourceHttpClient,
    settings,
    settingsOverride,
    now: options.now ?? (() => new Date())
  }
  await mkdir(normalized.cacheDir, { recursive: true })

  const results: ImdbDatasetDownloadResult[] = []
  for (const dataset of normalized.datasets) {
    const remote = await headDataset(dataset, normalized.httpClient, settingsOverride)
    results.push(await downloadOne(dataset, remote, normalized, settingsOverride))
  }

  return results
}
```

- [ ] **Step 4: Verify downloader tests pass**

Run:

```bash
npm test --workspace backend -- imdbDatasetDownloader
```

Expected: downloader tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/adapters/imdbDatasetDownloader.ts backend/tests/imdbDatasetDownloader.test.ts
git commit -m "feat: 添加 IMDb 数据集下载器"
```

## Task 2: IMDb Download CLI

**Files:**
- Create: `backend/src/scripts/downloadImdb.ts`
- Create: `backend/tests/downloadImdbScript.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces:
  - `runDownloadImdbCli(options?): Promise<number>`
  - npm script `download:imdb`

- [ ] **Step 1: Write failing CLI test**

Create `backend/tests/downloadImdbScript.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { runDownloadImdbCli } from "../src/scripts/downloadImdb.js"

describe("downloadImdb CLI", () => {
  it("returns a non-zero code when IMDb cache dir is not configured", async () => {
    const log = vi.fn()
    const download = vi.fn()
    const settings = {
      load: vi.fn(async () => undefined),
      get: vi.fn(() => "")
    }

    await expect(runDownloadImdbCli({ settings: settings as never, download, log })).resolves.toBe(1)
    expect(log).toHaveBeenCalledWith("source=imdb status=missing_cache_dir files=0")
    expect(download).not.toHaveBeenCalled()
  })

  it("prints one line per downloaded or skipped file", async () => {
    const log = vi.fn()
    const settings = {
      load: vi.fn(async () => undefined),
      get: vi.fn(() => "/cache/imdb")
    }
    const download = vi.fn(async () => [
      { fileName: "title.basics.tsv.gz", status: "downloaded", bytesWritten: 4 },
      { fileName: "title.ratings.tsv.gz", status: "skipped", bytesWritten: 2 }
    ])

    await expect(runDownloadImdbCli({ settings: settings as never, download: download as never, log })).resolves.toBe(0)
    expect(download).toHaveBeenCalledWith("/cache/imdb")
    expect(log).toHaveBeenCalledWith("file=title.basics.tsv.gz status=downloaded bytes=4")
    expect(log).toHaveBeenCalledWith("file=title.ratings.tsv.gz status=skipped bytes=2")
    expect(log).toHaveBeenCalledWith("source=imdb status=success files=2")
  })
})
```

- [ ] **Step 2: Run CLI tests to verify they fail**

Run:

```bash
npm test --workspace backend -- downloadImdbScript
```

Expected: fail because `downloadImdb.ts` does not exist.

- [ ] **Step 3: Implement CLI script**

Create `backend/src/scripts/downloadImdb.ts`:

```ts
import { pathToFileURL } from "node:url"
import {
  downloadImdbDatasets,
  type ImdbDatasetDownloadResult
} from "../adapters/imdbDatasetDownloader.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

type DownloadImdbCliOptions = {
  settings?: Pick<typeof runtimeSettings, "load" | "get">
  download?: (cacheDir: string) => Promise<Pick<ImdbDatasetDownloadResult, "fileName" | "status" | "bytesWritten">[]>
  log?: (line: string) => void
}

export async function runDownloadImdbCli(options: DownloadImdbCliOptions = {}): Promise<number> {
  const settings = options.settings ?? runtimeSettings
  const download = options.download ?? ((cacheDir: string) => downloadImdbDatasets({ cacheDir }))
  const log = options.log ?? console.log

  try {
    await settings.load()
    const cacheDir = settings.get("IMDB_DATASET_CACHE_DIR").trim()
    if (!cacheDir) {
      log("source=imdb status=missing_cache_dir files=0")
      return 1
    }

    const results = await download(cacheDir)
    for (const result of results) {
      log(`file=${result.fileName} status=${result.status} bytes=${result.bytesWritten}`)
    }
    log(`source=imdb status=success files=${results.length}`)
    return 0
  } catch {
    log("source=imdb status=failed files=0")
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runDownloadImdbCli()
  if (exitCode !== 0) process.exit(exitCode)
}
```

Add to `backend/package.json` scripts:

```json
"download:imdb": "tsx src/scripts/downloadImdb.ts"
```

- [ ] **Step 4: Verify CLI tests and backend typecheck pass**

Run:

```bash
npm test --workspace backend -- downloadImdbScript
npm run typecheck --workspace backend
```

Expected: CLI tests and backend typecheck pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/scripts/downloadImdb.ts backend/tests/downloadImdbScript.test.ts backend/package.json
git commit -m "feat: 添加 IMDb 下载命令"
```

## Task 3: Final Verification and Push

**Files:**
- All files touched above.

- [ ] **Step 1: Run focused IMDb tests**

Run:

```bash
npm test --workspace backend -- imdbDataset downloadImdb
```

Expected: IMDb parser, target, stream, cache adapter, downloader, and download CLI tests pass.

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
