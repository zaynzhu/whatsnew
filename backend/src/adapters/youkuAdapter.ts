import type { SourceAdapter } from "../domain/types.js"

export const youkuAdapter: SourceAdapter = {
  source: "youku",
  async fetchItems() {
    return []
  }
}
