import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTvmazeAdapter } from "../src/adapters/tvmazeAdapter.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

const scheduleEpisode = {
  id: 101,
  url: "https://www.tvmaze.com/episodes/101/sample-episode",
  name: "Pilot",
  season: 1,
  number: 1,
  airdate: "2026-06-17",
  airtime: "20:00",
  show: {
    id: 9001,
    url: "https://www.tvmaze.com/shows/9001/rain-city",
    name: "Rain City",
    type: "Scripted",
    language: "English",
    genres: ["Drama", "Mystery"],
    status: "Running",
    premiered: "2026-06-17",
    summary: "<p>A rainy mystery.</p>",
    image: {
      medium: "https://example.com/poster-medium.jpg",
      original: "https://example.com/poster-original.jpg"
    },
    network: {
      name: "HBO",
      country: { code: "US" }
    },
    webChannel: null,
    externals: {
      imdb: "tt9001001",
      thetvdb: 12345
    }
  }
}

const webEpisode = {
  id: 102,
  url: "https://www.tvmaze.com/episodes/102/sample-web-episode",
  name: "Launch",
  season: 2,
  number: 1,
  airdate: "2026-06-17",
  airtime: "",
  show: {
    id: 9002,
    url: "https://www.tvmaze.com/shows/9002/galaxy-diner",
    name: "Galaxy Diner",
    type: "Animation",
    language: "Japanese",
    genres: ["Animation"],
    status: "Running",
    premiered: "2025-07-01",
    summary: null,
    image: null,
    network: null,
    webChannel: {
      name: "Netflix",
      country: null
    },
    externals: {
      imdb: null,
      thetvdb: null
    }
  }
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("适配器不得使用全局 fetch")
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("tvmazeAdapter", () => {
  it("fetches TVmaze schedule and maps episodes into grouped media items", async () => {
    const fetchJson = vi.fn(async (sourceId: string, url: string) => {
      expect(sourceId).toBe("tvmaze")
      return url.includes("/schedule/web") ? [webEpisode] : [scheduleEpisode]
    })

    const adapter = createTvmazeAdapter({
      country: "US",
      days: 1,
      httpClient: { fetchJson } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      startDate: () => "2026-06-17"
    })

    const items = await adapter.fetchItems()

    expect(fetchJson).toHaveBeenCalledTimes(2)
    expect(fetchJson.mock.calls[0][1]).toContain("/schedule?country=US&date=2026-06-17")
    expect(fetchJson.mock.calls[1][1]).toContain("/schedule/web?date=2026-06-17&country=")
    expect(items).toHaveLength(2)
    expect(items[0].media).toMatchObject({
      source: "tvmaze",
      sourceId: "tvmaze-9001",
      titleDisplay: "Rain City",
      mediaType: "series",
      releaseForm: "tv_series",
      sourceContentType: "Scripted:tv",
      posterUrl: "https://example.com/poster-original.jpg",
      tvmazeId: 9001,
      imdbId: "tt9001001",
      tvdbId: 12345
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "HBO",
      region: "US",
      releaseDate: "2026-06-17",
      releaseTime: "20:00",
      seasonNumber: 1,
      episodeNumber: 1,
      source: "tvmaze"
    })
    expect(items[1].media).toMatchObject({
      titleDisplay: "Galaxy Diner",
      mediaType: "anime",
      releaseForm: "animated_series"
    })
    expect(items[1].releases[0]).toMatchObject({
      platform: "Netflix",
      region: "global",
      releasePattern: "streaming_drop"
    })
  })

  it("deduplicates episodes returned by both schedule endpoints", async () => {
    const fetchJson = vi.fn(async () => [scheduleEpisode])
    const adapter = createTvmazeAdapter({
      country: "US",
      days: 1,
      httpClient: { fetchJson } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      startDate: () => "2026-06-17"
    })

    const items = await adapter.fetchItems()

    expect(fetchJson).toHaveBeenCalledTimes(2)
    expect(items).toHaveLength(1)
    expect(items[0].releases).toHaveLength(1)
    expect(items[0].releases[0].sourceUrl).toBe(scheduleEpisode.url)
  })
})
