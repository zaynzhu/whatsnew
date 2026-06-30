import { pathToFileURL } from "node:url"
import {
  downloadImdbDatasets,
  type ImdbDatasetDownloadResult
} from "../adapters/imdbDatasetDownloader.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

type DownloadImdbSettings = Pick<typeof runtimeSettings, "load" | "get">

type DownloadImdbResultLine = Pick<ImdbDatasetDownloadResult, "fileName" | "status" | "bytesWritten">

export type DownloadImdbCliOptions = {
  settings?: DownloadImdbSettings
  download?: (cacheDir: string) => Promise<DownloadImdbResultLine[]>
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
      log(`source=imdb file=${result.fileName} status=${result.status} bytes=${result.bytesWritten}`)
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
