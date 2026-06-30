import { access } from "node:fs/promises"
import { join } from "node:path"
import type {
  ExistingMediaCandidate,
  SourceAdapter,
  SourceFetchBatch
} from "../domain/types.js"
import { createImdbTargetIndex, filterImdbRowsForTargets } from "./imdbDatasetTargets.js"
import { streamImdbTitleBasics, streamImdbTitleRatings } from "./imdbDatasetStream.js"
import type {
  ImdbTitleBasicsRow,
  ImdbTitleRatingRow
} from "./imdbDatasetsParser.js"

export const TITLE_BASICS_FILE = "title.basics.tsv.gz"
export const TITLE_RATINGS_FILE = "title.ratings.tsv.gz"

export type ImdbDatasetCacheAdapterOptions = {
  cacheDir: string
  candidates: ExistingMediaCandidate[]
}

async function requireCacheFile(filePath: string, fileName: string): Promise<void> {
  try {
    await access(filePath)
  } catch {
    throw new Error(`IMDb 数据集缓存缺少文件: ${fileName}`)
  }
}

export function createImdbDatasetCacheAdapter(
  options: ImdbDatasetCacheAdapterOptions
): SourceAdapter<SourceFetchBatch> {
  return {
    source: "imdb",
    scope: "datasets_cache",
    async fetchItems() {
      const basicsPath = join(options.cacheDir, TITLE_BASICS_FILE)
      const ratingsPath = join(options.cacheDir, TITLE_RATINGS_FILE)
      await requireCacheFile(basicsPath, TITLE_BASICS_FILE)
      await requireCacheFile(ratingsPath, TITLE_RATINGS_FILE)

      const targets = createImdbTargetIndex(options.candidates)
      const matchedBasics: ImdbTitleBasicsRow[] = []
      const matchedTconsts = new Set<string>()

      for await (const row of streamImdbTitleBasics(basicsPath)) {
        const [item] = filterImdbRowsForTargets([row], [], targets)
        if (!item) continue

        matchedBasics.push(row)
        matchedTconsts.add(row.tconst)
      }

      const matchedRatings: ImdbTitleRatingRow[] = []
      for await (const rating of streamImdbTitleRatings(ratingsPath)) {
        if (matchedTconsts.has(rating.tconst)) matchedRatings.push(rating)
      }

      return {
        items: filterImdbRowsForTargets(matchedBasics, matchedRatings, targets)
      }
    }
  }
}
