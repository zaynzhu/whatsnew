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
