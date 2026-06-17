import type { SourceAdapter } from "../domain/types.js"

export const iqiyiAdapter: SourceAdapter = {
  source: "iqiyi",
  async fetchItems() {
    return []
  }
}
