import { env } from "../config/env.js"
import type { SourceAdapter } from "../domain/types.js"

export const traktAdapter: SourceAdapter = {
  source: "trakt",
  async fetchItems() {
    if (!env.TRAKT_CLIENT_ID) return []
    return []
  }
}
