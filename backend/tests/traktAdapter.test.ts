import { describe, expect, it, vi } from "vitest"
import {
  createTraktCalendarAdapter,
  createTraktPopularityAdapter
} from "../src/adapters/traktAdapter.js"
import type { TraktClient } from "../src/clients/traktClient.js"

const movie = {
  title: "示例电影",
  year: 2026,
  ids: { trakt: 101, slug: "sample-movie-2026", imdb: "tt0000101", tmdb: 201 }
}

const show = {
  title: "示例剧集",
  year: 2025,
  ids: { trakt: 102, slug: "sample-show", imdb: "tt0000102", tmdb: 202, tvdb: 302 }
}

describe("traktAdapter", () => {
  it("maps trending and anticipated movie and show fixtures into separate signals", async () => {
    const get = vi.fn(async (path: string) => {
      const fixtures: Record<string, unknown> = {
        "/movies/trending": [{ watchers: 321, movie }],
        "/shows/trending": [{ watchers: 654, show }],
        "/movies/anticipated": [{ list_count: 88, movie }],
        "/shows/anticipated": [{ list_count: 99, show }]
      }
      return fixtures[path]
    })
    const adapter = createTraktPopularityAdapter({ client: { get } as unknown as TraktClient })

    const batch = await adapter.fetchItems()
    const movieItem = batch.items.find((item) => item.media.mediaType === "movie")!
    const showItem = batch.items.find((item) => item.media.mediaType === "series")!

    expect(adapter.scope).toBe("popularity")
    expect(get).toHaveBeenCalledTimes(4)
    expect(movieItem.media).toMatchObject({
      source: "trakt",
      sourceId: "trakt:movie:101",
      mediaType: "movie",
      titleDisplay: "示例电影",
      imdbId: "tt0000101",
      tmdbId: 201,
      traktId: 101,
      tvdbId: null
    })
    expect(movieItem.popularitySignals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "trakt_trending",
        window: "current",
        rank: 1,
        value: 321,
        valueLabel: "321 watchers"
      }),
      expect.objectContaining({
        source: "trakt_anticipated",
        window: "upcoming",
        rank: 1,
        value: 88,
        valueLabel: "88 list_count"
      })
    ]))
    expect(showItem.media).toMatchObject({
      source: "trakt",
      sourceId: "trakt:show:102",
      mediaType: "series",
      titleDisplay: "示例剧集",
      imdbId: "tt0000102",
      tmdbId: 202,
      traktId: 102,
      tvdbId: 302
    })
    expect(showItem.popularitySignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "trakt_trending", value: 654, valueLabel: "654 watchers" }),
      expect.objectContaining({ source: "trakt_anticipated", value: 99, valueLabel: "99 list_count" })
    ]))
    expect(batch.completePopularitySources).toEqual(["trakt_trending", "trakt_anticipated"])
  })

  it("marks both popularity sources complete when all successful responses are empty", async () => {
    const get = vi.fn(async () => [])
    const adapter = createTraktPopularityAdapter({ client: { get } as unknown as TraktClient })

    await expect(adapter.fetchItems()).resolves.toEqual({
      items: [],
      completePopularitySources: ["trakt_trending", "trakt_anticipated"]
    })
  })

  it("uses one 14-day window and groups repeated show episodes", async () => {
    const today = vi.fn(() => "2026-06-21")
    const get = vi.fn(async (path: string) => {
      if (path.includes("/movies/")) {
        return [{ released: "2026-06-24", movie }]
      }

      return [
        {
          first_aired: "2026-06-25T12:00:00.000Z",
          episode: { season: 2, number: 3, title: "新的开始", ids: { trakt: 1003 } },
          show
        },
        {
          first_aired: "2026-06-26T12:00:00.000Z",
          episode: { season: 2, number: 4, title: "继续前行", ids: { trakt: 1004 } },
          show
        }
      ]
    })
    const adapter = createTraktCalendarAdapter({
      client: { get } as unknown as TraktClient,
      today
    })

    const items = await adapter.fetchItems()
    const movieItem = items.find((item) => item.media.mediaType === "movie")!
    const showItem = items.find((item) => item.media.mediaType === "series")!

    expect(adapter.scope).toBe("calendar")
    expect(today).toHaveBeenCalledTimes(1)
    expect(get.mock.calls.map((call) => call[0])).toEqual([
      "/calendars/all/movies/2026-06-21/14",
      "/calendars/all/shows/2026-06-21/14"
    ])
    expect(items).toHaveLength(2)
    expect(movieItem.media.firstReleaseDate).toBe("2026-06-24")
    expect(movieItem.releases[0]).toMatchObject({
      platform: "Unspecified",
      region: "GLOBAL",
      releaseDate: "2026-06-24",
      releasePattern: "calendar_release"
    })
    expect(showItem.media.firstReleaseDate).toBeNull()
    expect(showItem.releases).toHaveLength(2)
    expect(showItem.releases[0]).toMatchObject({
      platform: "Unspecified",
      source: "trakt",
      releaseDate: "2026-06-25",
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: "新的开始"
    })
  })
})
