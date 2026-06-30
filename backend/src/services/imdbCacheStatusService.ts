import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import type {
  SourceLocalFileState,
  SourceLocalStateView
} from "@whatsnew/shared/settings"
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

function expectedBytes(metadata: ImdbDatasetMetadata | null): number | null {
  return metadata?.bytesWritten ?? metadata?.contentLength ?? null
}

function fileIssue(
  sizeBytes: number | null,
  metadata: ImdbDatasetMetadata | null
): SourceLocalFileState["issue"] {
  if (sizeBytes == null) return "missing_file"
  if (!metadata) return "missing_metadata"

  const expected = expectedBytes(metadata)
  if (expected != null && expected !== sizeBytes) return "size_mismatch"

  return null
}

function emptyFileState(fileName: string): SourceLocalFileState {
  return {
    fileName,
    exists: false,
    sizeBytes: null,
    expectedBytes: null,
    downloadedAt: null,
    lastModified: null,
    etag: null,
    issue: "missing_file"
  }
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
      files: IMDB_DATASET_DOWNLOADS.map((dataset) => emptyFileState(dataset.fileName))
    }
  }

  const files = await Promise.all(IMDB_DATASET_DOWNLOADS.map(async (dataset) => {
    const filePath = join(cacheDir, dataset.fileName)
    const fileStat = await safeStat(filePath)
    const metadata = await readMetadata(`${filePath}.meta.json`)
    const sizeBytes = fileStat?.size ?? null

    return {
      fileName: dataset.fileName,
      exists: sizeBytes != null,
      sizeBytes,
      expectedBytes: expectedBytes(metadata),
      downloadedAt: metadata?.downloadedAt ?? null,
      lastModified: metadata?.lastModified ?? null,
      etag: metadata?.etag ?? null,
      issue: fileIssue(sizeBytes, metadata)
    }
  }))

  const readyFiles = files.filter((file) => file.issue === null).length
  const missingFiles = files.some((file) => file.issue === "missing_file")

  return {
    kind: "imdb_datasets",
    status: readyFiles === files.length ? "ready" : missingFiles ? "missing_files" : "partial",
    configured: true,
    readyFiles,
    totalFiles: files.length,
    files
  }
}
