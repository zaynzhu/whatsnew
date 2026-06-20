import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTmdbAdapter } from "../src/adapters/tmdbAdapter.js"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"

const nowPlayingMovie = {
  id: 1001,
  title: "雨城来客",
  original_title: "Rain City Visitor",
  overview: "A mystery arrives with the first storm.",
  poster_path: "/rain.jpg",
  release_date: "2026-06-17",
  original_language: "en",
  genre_ids: [18, 9648],
  popularity: 82.5,
  vote_average: 7.4,
  vote_count: 128
}

const upcomingMovie = {
  id: 1002,
  title: "星海首映",
  original_title: "Star Sea Premiere",
  overview: "",
  poster_path: null,
  release_date: "2026-07-02",
  original_language: "ja",
  genre_ids: [16],
  popularity: 64.2,
  vote_average: 0,
  vote_count: 0
}

const airingTodayShow = {
  id: 2001,
  name: "边境回声",
  original_name: "Border Echo",
  overview: "A team follows a signal across a quiet border.",
  poster_path: "/border.jpg",
  first_air_date: "2026-06-17",
  original_language: "en",
  genre_ids: [18, 10759],
  popularity: 72.3,
  origin_country: ["US"]
}

const onTheAirShow = {
  id: 2002,
  name: "星环旅社",
  original_name: "Star Ring Inn",
  overview: "",
  poster_path: null,
  first_air_date: "2026-06-24",
  original_language: "ko",
  genre_ids: [16],
  popularity: 51.9,
  origin_country: ["KR"]
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("适配器不得使用全局 fetch")
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("tmdbAdapter", () => {
  it("returns no items and skips network requests when no API key is configured", async () => {
    const fetchJson = vi.fn()

    const adapter = createTmdbAdapter({
      apiKey: "",
      httpClient: { fetchJson } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    await expect(adapter.fetchItems()).resolves.toEqual([])
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it("fetches TMDb movie releases and trending signals", async () => {
    const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => {
      if (url.includes("/genre/movie/list")) {
        return new Response(JSON.stringify({
          genres: [
            { id: 18, name: "Drama" },
            { id: 9648, name: "Mystery" },
            { id: 16, name: "Animation" }
          ]
        }))
      }

      if (url.includes("/genre/tv/list")) {
        return new Response(JSON.stringify({
          genres: [
            { id: 18, name: "Drama" },
            { id: 10759, name: "Action & Adventure" },
            { id: 16, name: "Animation" }
          ]
        }))
      }

      if (url.includes("/movie/now_playing")) {
        return new Response(JSON.stringify({ results: [nowPlayingMovie] }))
      }

      if (url.includes("/movie/upcoming")) {
        return new Response(JSON.stringify({ results: [upcomingMovie] }))
      }

      if (url.includes("/trending/movie/week")) {
        return new Response(JSON.stringify({
          results: [
            { ...upcomingMovie, popularity: 92.1 },
            { ...nowPlayingMovie, popularity: 88.4 }
          ]
        }))
      }

      if (url.includes("/tv/airing_today")) {
        return new Response(JSON.stringify({ results: [airingTodayShow] }))
      }

      if (url.includes("/tv/on_the_air")) {
        return new Response(JSON.stringify({ results: [onTheAirShow] }))
      }

      if (url.includes("/trending/tv/week")) {
        return new Response(JSON.stringify({
          results: [
            { ...onTheAirShow, popularity: 81.7 },
            { ...airingTodayShow, popularity: 78.2 }
          ]
        }))
      }

      return new Response("{}", { status: 404, statusText: "Not Found" })
    })
    const fetchJson = vi.fn(async (sourceId: string, url: string, _options?: unknown) => {
      expect(sourceId).toBe("tmdb")
      return fetchMock(url).then((response) => response.json())
    })

    const adapter = createTmdbAdapter({
      apiKey: "test-key",
      httpClient: { fetchJson } as unknown as SourceHttpClient,
      minIntervalMs: 0,
      today: () => "2026-06-17"
    })

    const items = await adapter.fetchItems()

    expect(fetchMock).toHaveBeenCalledTimes(8)
    expect(fetchMock.mock.calls[0][0]).toContain("/genre/movie/list")
    expect(fetchMock.mock.calls[1][0]).toContain("/genre/tv/list")
    expect(fetchMock.mock.calls[2][0]).toContain("/movie/now_playing")
    expect(fetchMock.mock.calls[3][0]).toContain("/movie/upcoming")
    expect(fetchMock.mock.calls[4][0]).toContain("/trending/movie/week")
    expect(fetchMock.mock.calls[5][0]).toContain("/tv/airing_today")
    expect(fetchMock.mock.calls[6][0]).toContain("/tv/on_the_air")
    expect(fetchMock.mock.calls[7][0]).toContain("/trending/tv/week")
    expect(fetchMock.mock.calls[2][0]).toContain("api_key=test-key")
    expect(fetchJson).toHaveBeenCalledTimes(8)
    expect(items).toHaveLength(4)
    expect(items[0].media).toMatchObject({
      source: "tmdb",
      sourceId: "tmdb-movie-1001",
      mediaType: "movie",
      releaseForm: "theatrical_movie",
      titleDisplay: "雨城来客",
      titleOriginal: "Rain City Visitor",
      posterUrl: "https://image.tmdb.org/t/p/w500/rain.jpg",
      originalLanguage: "en",
      genres: ["Drama", "Mystery"],
      firstReleaseDate: "2026-06-17",
      status: "released",
      tmdbId: 1001
    })
    expect(items[0].releases[0]).toMatchObject({
      platform: "Theatrical",
      region: "US",
      releaseDate: "2026-06-17",
      releasePattern: "theatrical_release",
      releaseStatus: "airing_today",
      source: "tmdb",
      sourceUrl: "https://www.themoviedb.org/movie/1001"
    })
    expect(items[0].popularitySignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "tmdb_trending",
          window: "week",
          rank: 2,
          value: 88.4
        })
      ])
    )
    expect(items[1].media).toMatchObject({
      sourceId: "tmdb-movie-1002",
      mediaType: "movie",
      releaseForm: "theatrical_movie",
      genres: ["Animation"],
      status: "upcoming"
    })
    expect(items[1].releases[0]).toMatchObject({
      releaseDate: "2026-07-02",
      releaseStatus: "upcoming"
    })
    expect(items[1].popularitySignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "tmdb_trending",
          rank: 1,
          value: 92.1
        })
      ])
    )
    expect(items[2].media).toMatchObject({
      source: "tmdb",
      sourceId: "tmdb-tv-2001",
      mediaType: "series",
      releaseForm: "tv_series",
      titleDisplay: "边境回声",
      titleOriginal: "Border Echo",
      posterUrl: "https://image.tmdb.org/t/p/w500/border.jpg",
      originalLanguage: "en",
      genres: ["Drama", "Action & Adventure"],
      firstReleaseDate: "2026-06-17",
      status: "released",
      tmdbId: 2001
    })
    expect(items[2].releases[0]).toMatchObject({
      platform: "TMDb TV",
      region: "US",
      releaseDate: "2026-06-17",
      releasePattern: "episode_release",
      releaseStatus: "airing_today",
      source: "tmdb",
      sourceUrl: "https://www.themoviedb.org/tv/2001"
    })
    expect(items[2].popularitySignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "tmdb_tv_trending",
          rank: 2,
          value: 78.2
        })
      ])
    )
    expect(items[3].media).toMatchObject({
      sourceId: "tmdb-tv-2002",
      mediaType: "anime",
      releaseForm: "animated_series",
      genres: ["Animation"],
      status: "upcoming"
    })
  })

  it("uses Bearer authentication when configured with a TMDb read access token", async () => {
    const fetchJson = vi.fn(async (sourceId: string, url: string, _options?: unknown) => {
      expect(sourceId).toBe("tmdb")
      return url.includes("/genre/movie/list") || url.includes("/genre/tv/list")
        ? { genres: [] }
        : { results: [] }
    })

    const adapter = createTmdbAdapter({
      apiKey: "eyJ.test.token",
      httpClient: { fetchJson } as unknown as SourceHttpClient,
      minIntervalMs: 0
    })

    await adapter.fetchItems()

    expect(fetchJson).toHaveBeenCalledTimes(8)
    expect(fetchJson.mock.calls[0][1]).not.toContain("api_key=")
    expect(fetchJson.mock.calls[0][2]).toMatchObject({
      headers: {
        Authorization: "Bearer eyJ.test.token"
      }
    })
  })
})
