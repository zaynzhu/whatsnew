import { describe, expect, it, vi } from "vitest"
import { runDownloadImdbCli } from "../src/scripts/downloadImdb.js"

function createSettings(cacheDir: string) {
  return {
    load: vi.fn(async () => undefined),
    get: vi.fn((key: string) => key === "IMDB_DATASET_CACHE_DIR" ? cacheDir : "")
  }
}

describe("downloadImdb script", () => {
  it("returns a non-zero exit code when the cache directory is not configured", async () => {
    const log = vi.fn()
    const download = vi.fn()

    const exitCode = await runDownloadImdbCli({
      settings: createSettings(""),
      download,
      log
    })

    expect(exitCode).toBe(1)
    expect(download).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith("source=imdb status=missing_cache_dir files=0")
  })

  it("downloads datasets into the configured cache directory", async () => {
    const log = vi.fn()
    const download = vi.fn(async () => [
      { fileName: "title.basics.tsv.gz", status: "downloaded" as const, bytesWritten: 4 },
      { fileName: "title.ratings.tsv.gz", status: "skipped" as const, bytesWritten: 2 }
    ])

    const exitCode = await runDownloadImdbCli({
      settings: createSettings("/tmp/imdb-cache"),
      download,
      log
    })

    expect(exitCode).toBe(0)
    expect(download).toHaveBeenCalledWith("/tmp/imdb-cache")
    expect(log).toHaveBeenCalledWith("source=imdb file=title.basics.tsv.gz status=downloaded bytes=4")
    expect(log).toHaveBeenCalledWith("source=imdb file=title.ratings.tsv.gz status=skipped bytes=2")
    expect(log).toHaveBeenCalledWith("source=imdb status=success files=2")
  })

  it("returns a non-zero exit code when the downloader fails", async () => {
    const log = vi.fn()
    const download = vi.fn(async () => {
      throw new Error("network failed")
    })

    const exitCode = await runDownloadImdbCli({
      settings: createSettings("/tmp/imdb-cache"),
      download,
      log
    })

    expect(exitCode).toBe(1)
    expect(log).toHaveBeenCalledWith("source=imdb status=failed files=0")
  })
})
