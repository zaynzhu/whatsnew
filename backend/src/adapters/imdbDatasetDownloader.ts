import { createWriteStream } from "node:fs"
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
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

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
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
  cacheDir: string,
  httpClient: Pick<SourceHttpClient, "request">,
  settingsOverride: Record<string, string>,
  now: () => Date
): Promise<ImdbDatasetDownloadResult> {
  const targetPath = join(cacheDir, dataset.fileName)
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
    const response = await httpClient.request("imdb", dataset.url, {
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
      downloadedAt: now().toISOString()
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

export async function downloadImdbDatasets(
  options: ImdbDatasetDownloadOptions
): Promise<ImdbDatasetDownloadResult[]> {
  const settings = options.settings ?? runtimeSettings
  const currentSettings = settings.view(options.settingsOverride ?? {})
  const settingsOverride = captureSourceProxySettings(currentSettings, "imdb")
  const cacheDir = options.cacheDir
  const datasets = options.datasets ?? IMDB_DATASET_DOWNLOADS
  const httpClient = options.httpClient ?? sourceHttpClient
  const now = options.now ?? (() => new Date())
  await mkdir(cacheDir, { recursive: true })

  const results: ImdbDatasetDownloadResult[] = []
  for (const dataset of datasets) {
    const remote = await headDataset(dataset, httpClient, settingsOverride)
    results.push(await downloadOne(dataset, remote, cacheDir, httpClient, settingsOverride, now))
  }

  return results
}
