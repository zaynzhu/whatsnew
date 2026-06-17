import { env } from "../config/env.js"
import type { SourceAdapter } from "../domain/types.js"

export const tmdbAdapter: SourceAdapter = {
  source: "tmdb",
  async fetchItems() {
    if (!env.TMDB_API_KEY) return []
    return []
  }
}
