import type { SourceAdapter } from "../domain/types.js"

export const tvmazeAdapter: SourceAdapter = {
  source: "tvmaze",
  async fetchItems() {
    return []
  }
}
