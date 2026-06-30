import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  streamImdbTitleBasics,
  streamImdbTitleRatings
} from "../src/adapters/imdbDatasetStream.js"

let tempDir: string

async function collect<T>(rows: AsyncGenerator<T>): Promise<T[]> {
  const collected: T[] = []
  for await (const row of rows) collected.push(row)
  return collected
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "whatsnew-imdb-stream-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe("IMDb dataset stream", () => {
  it("streams title basics from a gzipped TSV file", async () => {
    const filePath = join(tempDir, "title.basics.tsv.gz")
    await writeFile(filePath, gzipSync([
      "tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres",
      "tt1000001\tmovie\tMidnight File\t\\N\t0\t2026\t\\N\t112\tDrama,Mystery"
    ].join("\n")))

    await expect(collect(streamImdbTitleBasics(filePath))).resolves.toEqual([{
      tconst: "tt1000001",
      titleType: "movie",
      primaryTitle: "Midnight File",
      originalTitle: null,
      isAdult: false,
      startYear: 2026,
      endYear: null,
      runtimeMinutes: 112,
      genres: ["Drama", "Mystery"]
    }])
  })

  it("streams title ratings from a gzipped TSV file", async () => {
    const filePath = join(tempDir, "title.ratings.tsv.gz")
    await writeFile(filePath, gzipSync([
      "tconst\taverageRating\tnumVotes",
      "tt1000001\t7.8\t120345"
    ].join("\n")))

    await expect(collect(streamImdbTitleRatings(filePath))).resolves.toEqual([{
      tconst: "tt1000001",
      averageRating: 7.8,
      numVotes: 120345
    }])
  })

  it("reports missing required stream columns with the field name", async () => {
    const filePath = join(tempDir, "title.basics.tsv.gz")
    await writeFile(filePath, gzipSync([
      "tconst\ttitleType\tprimaryTitle",
      "tt1000001\tmovie\tMidnight File"
    ].join("\n")))

    await expect(collect(streamImdbTitleBasics(filePath))).rejects.toThrow("IMDb TSV 缺少必需字段: originalTitle")
  })
})
