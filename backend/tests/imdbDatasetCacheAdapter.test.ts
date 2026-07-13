import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createImdbDatasetCacheAdapter } from "../src/adapters/imdbDatasetCacheAdapter.js"
import type { ExistingMediaCandidate } from "../src/domain/types.js"

let tempDir: string

function candidate(overrides: Partial<ExistingMediaCandidate> = {}): ExistingMediaCandidate {
  return {
    id: "media-1",
    mediaType: "movie",
    releaseForm: "streaming_movie",
    titleDisplay: "Midnight File",
    titleAliases: [],
    overview: null,
    posterUrl: null,
    productionCountries: "[]",
    genres: "[]",
    firstReleaseDate: "2026-02-14",
    originalLanguage: "en",
    status: "unknown",
    tmdbId: null,
    tvmazeId: null,
    imdbId: "tt1000001",
    traktId: null,
    tvdbId: null,
    ...overrides
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "whatsnew-imdb-cache-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function writeDatasetFiles() {
  await writeFile(join(tempDir, "title.basics.tsv.gz"), gzipSync([
    "tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres",
    "tt1000001\tmovie\tMidnight File\tMidnight File\t0\t2026\t\\N\t112\tDrama",
    "tt9999999\tmovie\tUnknown Film\tUnknown Film\t0\t2026\t\\N\t90\tDrama"
  ].join("\n")))
  await writeFile(join(tempDir, "title.ratings.tsv.gz"), gzipSync([
    "tconst\taverageRating\tnumVotes",
    "tt1000001\t7.8\t120345",
    "tt9999999\t9.1\t10"
  ].join("\n")))
}

describe("IMDb dataset cache adapter", () => {
  it("streams local cache files and returns only matched adapter items", async () => {
    await writeDatasetFiles()
    const adapter = createImdbDatasetCacheAdapter({
      cacheDir: tempDir,
      candidates: [candidate()]
    })

    const batch = await adapter.fetchItems()

    expect(batch).toMatchObject({
      items: [{
        createIfMissing: false,
        media: {
          source: "imdb",
          imdbId: "tt1000001"
        },
        popularitySignals: [{ source: "imdb_rating", value: 7.8 }]
      }]
    })
    expect(batch.completePopularitySources).toBeUndefined()
  })

  it("reports a missing basics cache file with the expected file name", async () => {
    const adapter = createImdbDatasetCacheAdapter({
      cacheDir: tempDir,
      candidates: [candidate()]
    })

    await expect(adapter.fetchItems()).rejects.toThrow("IMDb 数据集缓存缺少文件: title.basics.tsv.gz")
  })
})
