import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { IMDB_DATASET_DOWNLOADS } from "../src/adapters/imdbDatasetDownloader.js"
import { getImdbCacheStatus } from "../src/services/imdbCacheStatusService.js"

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "whatsnew-imdb-cache-status-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function writeDataset(fileName: string, bytes: Uint8Array, metadataBytes = bytes.byteLength) {
  await writeFile(join(tempDir, fileName), bytes)
  await writeFile(join(tempDir, `${fileName}.meta.json`), `${JSON.stringify({
    etag: `"${fileName}-etag"`,
    lastModified: "Mon, 29 Jun 2026 12:34:11 GMT",
    contentLength: metadataBytes,
    bytesWritten: metadataBytes,
    downloadedAt: "2026-06-30T00:00:00.000Z"
  })}\n`)
}

describe("IMDb cache status service", () => {
  it("reports a missing cache directory configuration", async () => {
    const status = await getImdbCacheStatus("")

    expect(status).toMatchObject({
      kind: "imdb_datasets",
      status: "missing_config",
      configured: false,
      readyFiles: 0,
      totalFiles: 2
    })
    expect(status.files).toHaveLength(2)
    expect(status.files.every((file) => file.issue === "missing_file")).toBe(true)
  })

  it("reports ready when every required file and metadata match", async () => {
    for (const dataset of IMDB_DATASET_DOWNLOADS) {
      await writeDataset(dataset.fileName, Uint8Array.from([1, 2, 3, 4]))
    }

    const status = await getImdbCacheStatus(tempDir)

    expect(status).toMatchObject({
      status: "ready",
      configured: true,
      readyFiles: 2,
      totalFiles: 2
    })
    expect(status.files[0]).toMatchObject({
      exists: true,
      sizeBytes: 4,
      expectedBytes: 4,
      downloadedAt: "2026-06-30T00:00:00.000Z",
      issue: null
    })
  })

  it("reports missing files when at least one required gzip file is absent", async () => {
    await writeDataset(IMDB_DATASET_DOWNLOADS[0].fileName, Uint8Array.from([1, 2, 3, 4]))

    const status = await getImdbCacheStatus(tempDir)

    expect(status.status).toBe("missing_files")
    expect(status.readyFiles).toBe(1)
    expect(status.files.find((file) => file.fileName === IMDB_DATASET_DOWNLOADS[1].fileName)).toMatchObject({
      exists: false,
      issue: "missing_file"
    })
  })

  it("reports partial when metadata is missing", async () => {
    for (const dataset of IMDB_DATASET_DOWNLOADS) {
      await writeDataset(dataset.fileName, Uint8Array.from([1, 2, 3, 4]))
    }
    await rm(join(tempDir, `${IMDB_DATASET_DOWNLOADS[1].fileName}.meta.json`), { force: true })

    const status = await getImdbCacheStatus(tempDir)

    expect(status.status).toBe("partial")
    expect(status.readyFiles).toBe(1)
    expect(status.files.find((file) => file.fileName === IMDB_DATASET_DOWNLOADS[1].fileName)).toMatchObject({
      exists: true,
      issue: "missing_metadata"
    })
  })

  it("reports partial when metadata byte counts do not match the file size", async () => {
    await writeDataset(IMDB_DATASET_DOWNLOADS[0].fileName, Uint8Array.from([1, 2, 3, 4]), 5)
    await writeDataset(IMDB_DATASET_DOWNLOADS[1].fileName, Uint8Array.from([1, 2, 3, 4]))

    const status = await getImdbCacheStatus(tempDir)

    expect(status.status).toBe("partial")
    expect(status.readyFiles).toBe(1)
    expect(status.files.find((file) => file.fileName === IMDB_DATASET_DOWNLOADS[0].fileName)).toMatchObject({
      sizeBytes: 4,
      expectedBytes: 5,
      issue: "size_mismatch"
    })
  })
})
