import { describe, expect, it } from "vitest"
import type { AdapterItem, SourceFetchResult } from "../src/domain/types.js"
import { previewSourceData } from "../src/services/sourcePreviewService.js"

function item(overrides: Partial<AdapterItem["media"]> = {}): AdapterItem {
  return {
    media: {
      source: "preview_test",
      sourceId: overrides.sourceId ?? "1",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      sourceContentType: null,
      titleDisplay: "Preview Movie",
      titleOriginal: null,
      titleAliases: [],
      overview: null,
      posterUrl: "https://images.test/poster.jpg",
      productionCountries: ["US"],
      originalLanguage: "en",
      genres: [],
      firstReleaseDate: "2026-07-01",
      status: "upcoming",
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null,
      ...overrides
    },
    releases: [{
      platform: "Preview+",
      region: "US",
      releaseDate: "2026-07-13",
      releaseTime: null,
      releasePattern: "catalog_addition",
      releaseStatus: "upcoming",
      seasonNumber: null,
      episodeNumber: null,
      source: "preview_test",
      sourceUrl: "https://preview.test/title"
    }],
    popularitySignals: []
  }
}

describe("sourcePreviewService", () => {
  it("汇总多个 scope 且不执行持久化", async () => {
    const preview = await previewSourceData("preview_test", [
      {
        adapter: {
          source: "preview_test",
          scope: "catalog",
          fetchItems: async (): Promise<SourceFetchResult> => [item()]
        }
      },
      {
        adapter: {
          source: "preview_test",
          scope: "calendar",
          fetchItems: async (): Promise<SourceFetchResult> => ({
            items: [item({
              sourceId: "2",
              mediaType: "series",
              releaseForm: "tv_series",
              titleDisplay: "Preview Series",
              posterUrl: null
            })],
            completeReleaseSources: ["preview_test"]
          })
        }
      }
    ])

    expect(preview).toMatchObject({
      sourceId: "preview_test",
      itemCount: 2,
      withPoster: 1,
      persisted: false,
      mediaTypes: { movie: 1, series: 1 },
      releasePatterns: { catalog_addition: 2 },
      releaseDateStart: "2026-07-13",
      releaseDateEnd: "2026-07-13",
      scopes: [
        { scope: "catalog", itemCount: 1 },
        { scope: "calendar", itemCount: 1 }
      ]
    })
    expect(preview.samples).toEqual([
      expect.objectContaining({ title: "Preview Movie", scope: "catalog" }),
      expect.objectContaining({ title: "Preview Series", scope: "calendar" })
    ])
  })

  it("最多返回十二条样例", async () => {
    const preview = await previewSourceData("preview_test", [{
      adapter: {
        source: "preview_test",
        fetchItems: async () => Array.from({ length: 20 }, (_, index) => item({
          sourceId: String(index),
          titleDisplay: `Title ${index}`
        }))
      }
    }])

    expect(preview.itemCount).toBe(20)
    expect(preview.samples).toHaveLength(12)
  })
})
