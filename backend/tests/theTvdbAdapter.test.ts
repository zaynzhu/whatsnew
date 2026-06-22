import { describe, expect, it, vi } from "vitest"
import { createTheTvdbAdapter } from "../src/adapters/theTvdbAdapter.js"
import type {
  TheTvdbClient,
  TheTvdbMovie,
  TheTvdbSeries,
  TheTvdbUpdate,
  TheTvdbUpdatesResponse
} from "../src/clients/theTvdbClient.js"

function update(recordId: number, timeStamp: number, methodInt: 1 | 2 | 3 = 2): TheTvdbUpdate {
  return { recordId, timeStamp, methodInt }
}

function movieFixture(id: number, overrides: Partial<TheTvdbMovie> = {}): TheTvdbMovie {
  return {
    id,
    name: `Movie ${id}`,
    slug: `movie-${id}`,
    aliases: [],
    genres: [],
    image: null,
    originalCountry: "US",
    originalLanguage: "en",
    first_release: { date: "2026-06-21", country: "US" },
    releases: [],
    remoteIds: [],
    status: { name: "Released" },
    ...overrides
  }
}

function seriesFixture(id: number, overrides: Partial<TheTvdbSeries> = {}): TheTvdbSeries {
  return {
    id,
    name: `Series ${id}`,
    slug: `series-${id}`,
    aliases: [],
    genres: [],
    image: null,
    country: "US",
    originalCountry: "US",
    originalLanguage: "en",
    firstAired: "2026-06-21",
    nextAired: null,
    remoteIds: [],
    status: { name: "Continuing" },
    ...overrides
  }
}

function withUnreadableScore<T extends object>(fixture: T): T {
  Object.defineProperty(fixture, "score", {
    get() {
      throw new Error("TheTVDB score 不应被读取")
    },
    enumerable: true,
    configurable: true
  })

  return fixture
}

type FakeClientOptions = {
  pages?: {
    movies?: TheTvdbUpdatesResponse[]
    series?: TheTvdbUpdatesResponse[]
  }
  movies?: Record<number, TheTvdbMovie>
  series?: Record<number, TheTvdbSeries>
}

function fakeClient(options: FakeClientOptions = {}) {
  const moviePages = options.pages?.movies ?? [{ status: "success", data: [], links: { next: null } }]
  const seriesPages = options.pages?.series ?? [{ status: "success", data: [], links: { next: null } }]
  const movies = options.movies ?? {}
  const series = options.series ?? {}

  const client = {
    getUpdates: vi.fn(async (type: "movies" | "series", _since: number, page: number) => {
      const pages = type === "movies" ? moviePages : seriesPages
      return pages[page] ?? { status: "success", data: [], links: { next: null } }
    }),
    getMovie: vi.fn(async (id: number) => {
      const movie = movies[id]
      if (!movie) throw new Error(`缺少电影 fixture: ${id}`)
      return movie
    }),
    getSeries: vi.fn(async (id: number) => {
      const show = series[id]
      if (!show) throw new Error(`缺少剧集 fixture: ${id}`)
      return show
    })
  } satisfies TheTvdbClient

  return client
}

describe("theTvdbAdapter", () => {
  it("deduplicates updates, follows pagination, and keeps the newest 40 detail candidates", async () => {
    const movieUpdatesPage0 = [
      update(1, 1998),
      update(2, 1996),
      update(3, 1994),
      update(4, 1992),
      update(5, 1990),
      update(6, 1988),
      update(7, 1986),
      update(8, 1984),
      update(9, 1982),
      update(10, 1980),
      update(11, 1978),
      update(12, 1976),
      update(13, 1974),
      update(25, 1500)
    ]
    const movieUpdatesPage1 = [
      update(14, 1972),
      update(15, 1970),
      update(16, 1968),
      update(17, 1966),
      update(18, 1964),
      update(19, 1962),
      update(20, 1960),
      update(21, 1958),
      update(22, 1956),
      update(23, 1954),
      update(24, 1952),
      update(25, 2000)
    ]
    const seriesUpdatesPage0 = [
      update(101, 1997),
      update(102, 1995),
      update(103, 1993),
      update(104, 1991),
      update(105, 1989),
      update(106, 1987),
      update(107, 1985),
      update(108, 1983),
      update(109, 1981),
      update(110, 1979),
      update(111, 1977),
      update(112, 1975),
      update(113, 1973),
      update(125, 1499)
    ]
    const seriesUpdatesPage1 = [
      update(114, 1971),
      update(115, 1969),
      update(116, 1967),
      update(117, 1965),
      update(118, 1963),
      update(119, 1961),
      update(120, 1959),
      update(121, 1957),
      update(122, 1955),
      update(123, 1953),
      update(124, 1951),
      update(125, 1999)
    ]

    const client = fakeClient({
      pages: {
        movies: [
          { status: "success", data: movieUpdatesPage0, links: { next: "/updates?type=movies&page=1" } },
          { status: "success", data: movieUpdatesPage1, links: { next: null } }
        ],
        series: [
          { status: "success", data: seriesUpdatesPage0, links: { next: "/updates?type=series&page=1" } },
          { status: "success", data: seriesUpdatesPage1, links: { next: null } }
        ]
      },
      movies: Object.fromEntries(
        Array.from({ length: 25 }, (_, index) => {
          const id = index + 1
          return [id, movieFixture(id)]
        })
      ),
      series: Object.fromEntries(
        Array.from({ length: 25 }, (_, index) => {
          const id = index + 101
          return [id, seriesFixture(id)]
        })
      )
    })

    const adapter = createTheTvdbAdapter({
      client,
      now: () => new Date("2026-06-21T12:00:00Z")
    })

    const result = await adapter.fetchItems()
    const detailIds = result.items.map((item) => item.media.sourceId)

    expect(adapter.scope).toBe("updates")
    expect(client.getUpdates.mock.calls).toEqual([
      ["movies", 1781870400, 0],
      ["movies", 1781870400, 1],
      ["series", 1781870400, 0],
      ["series", 1781870400, 1]
    ])
    expect(client.getMovie).toHaveBeenCalledTimes(20)
    expect(client.getSeries).toHaveBeenCalledTimes(20)
    expect(new Set(detailIds).size).toBe(40)
    expect(client.getMovie).toHaveBeenCalledWith(25)
    expect(client.getSeries).toHaveBeenCalledWith(125)
    expect(client.getMovie).not.toHaveBeenCalledWith(20)
    expect(client.getSeries).not.toHaveBeenCalledWith(120)
  })

  it("throws when an updates page repeats the same next link", async () => {
    const client = fakeClient({
      pages: {
        movies: [
          { status: "success", data: [update(1, 10)], links: { next: "/updates?type=movies&page=1" } },
          { status: "success", data: [update(2, 9)], links: { next: "/updates?type=movies&page=1" } }
        ]
      },
      movies: {
        1: movieFixture(1),
        2: movieFixture(2)
      }
    })
    const adapter = createTheTvdbAdapter({
      client,
      now: () => new Date("2026-06-21T12:00:00Z")
    })

    await expect(adapter.fetchItems()).rejects.toThrow("TheTVDB 更新分页循环")
  })

  it("turns deleted records into inactive source refs without fetching their details", async () => {
    const client = fakeClient({
      pages: {
        movies: [{ status: "success", data: [update(10, 2000, 3), update(11, 1998)], links: { next: null } }],
        series: [{ status: "success", data: [update(20, 1999, 3), update(21, 1997)], links: { next: null } }]
      },
      movies: {
        11: movieFixture(11)
      },
      series: {
        21: seriesFixture(21)
      }
    })
    const adapter = createTheTvdbAdapter({
      client,
      now: () => new Date("2026-06-21T12:00:00Z")
    })

    const result = await adapter.fetchItems()

    expect(result).toMatchObject({
      retiredSourceRefs: [
        { source: "thetvdb", sourceId: "thetvdb:movie:10" },
        { source: "thetvdb", sourceId: "thetvdb:series:20" }
      ]
    })
    expect(client.getMovie).toHaveBeenCalledTimes(1)
    expect(client.getMovie).toHaveBeenCalledWith(11)
    expect(client.getSeries).toHaveBeenCalledTimes(1)
    expect(client.getSeries).toHaveBeenCalledWith(21)
  })

  it("maps date windows, metadata, remote IDs, and ignores score completely", async () => {
    const client = fakeClient({
      pages: {
        movies: [{
          status: "success",
          data: [
            update(1, 2000),
            update(2, 1999),
            update(3, 1998),
            update(4, 1997)
          ],
          links: { next: null }
        }],
        series: [{
          status: "success",
          data: [
            update(101, 1996),
            update(102, 1995),
            update(103, 1994),
            update(104, 1993)
          ],
          links: { next: null }
        }]
      },
      movies: {
        1: withUnreadableScore(movieFixture(1, {
          name: "雨城来客",
          slug: "rain-city-visitor",
          aliases: [
            { name: "Rain City Visitor" },
            { name: "雨城来客" },
            { name: "  " },
            { name: "Rain City Visitor" }
          ],
          genres: [{ id: 1, name: "Drama" }, { id: 2, name: "Mystery" }],
          image: "https://images.example/rain.jpg",
          originalCountry: "US",
          originalLanguage: "en",
          first_release: { date: "2026-05-22", country: "US" },
          remoteIds: [
            { sourceName: "IMDb", id: "tt7654321" },
            { sourceName: "TheMovieDB.com", id: "456" }
          ],
          status: { name: "Released" }
        })),
        2: withUnreadableScore(movieFixture(2, {
          name: "旧日补档",
          slug: "old-archive",
          first_release: { date: "2026-05-21", country: "CA" },
          originalCountry: "CA",
          originalLanguage: "fr",
          remoteIds: [{ sourceName: "TheMovieDB.com", id: "abc" }]
        })),
        3: withUnreadableScore(movieFixture(3, {
          name: "冬季首映",
          slug: "winter-premiere",
          first_release: { date: "2026-12-18", country: "JP" },
          originalCountry: "JP",
          originalLanguage: "ja"
        })),
        4: withUnreadableScore(movieFixture(4, {
          name: "太远的电影",
          slug: "too-far-movie",
          first_release: { date: "2026-12-19", country: "GB" },
          originalCountry: "GB",
          originalLanguage: "en"
        }))
      },
      series: {
        101: withUnreadableScore(seriesFixture(101, {
          name: "海港回声",
          slug: "harbor-echo",
          aliases: [{ name: "Harbor Echo" }],
          genres: [{ id: 3, name: "Drama" }],
          image: "https://images.example/harbor.jpg",
          country: "KR",
          originalCountry: "KR",
          originalLanguage: "ko",
          firstAired: "2026-05-22",
          nextAired: null,
          remoteIds: [
            { sourceName: "IMDb", id: "tt1111111" },
            { sourceName: "tmdb", id: "789" }
          ],
          status: { name: "Continuing" }
        })),
        102: withUnreadableScore(seriesFixture(102, {
          name: "星海旅程",
          slug: "star-sea-journey",
          country: "GB",
          originalCountry: "GB",
          originalLanguage: "en",
          firstAired: "2026-05-01",
          nextAired: "2026-07-21",
          status: { name: "Continuing" }
        })),
        103: withUnreadableScore(seriesFixture(103, {
          name: "旧季终章",
          slug: "old-finale",
          country: "DE",
          originalCountry: "DE",
          originalLanguage: "de",
          firstAired: "2026-05-21",
          nextAired: "2026-07-22",
          status: { name: "Ended" }
        })),
        104: withUnreadableScore(seriesFixture(104, {
          name: "远期新剧",
          slug: "far-future-show",
          country: "US",
          originalCountry: "US",
          originalLanguage: "en",
          firstAired: "2026-12-18",
          nextAired: null,
          status: { name: "Upcoming" }
        }))
      }
    })
    const adapter = createTheTvdbAdapter({
      client,
      now: () => new Date("2026-06-21T12:00:00Z")
    })

    const result = await adapter.fetchItems()
    const recentMovie = result.items.find((item) => item.media.sourceId === "thetvdb:movie:1")
    const oldMovie = result.items.find((item) => item.media.sourceId === "thetvdb:movie:2")
    const futureMovie = result.items.find((item) => item.media.sourceId === "thetvdb:movie:3")
    const futureSeries = result.items.find((item) => item.media.sourceId === "thetvdb:series:104")
    const recentSeries = result.items.find((item) => item.media.sourceId === "thetvdb:series:101")
    const upcomingSeries = result.items.find((item) => item.media.sourceId === "thetvdb:series:102")
    const staleSeries = result.items.find((item) => item.media.sourceId === "thetvdb:series:103")

    expect(recentMovie).toMatchObject({
      createIfMissing: true,
      media: {
        source: "thetvdb",
        sourceId: "thetvdb:movie:1",
        mediaType: "movie",
        releaseForm: "streaming_movie",
        sourceContentType: "movie",
        titleDisplay: "雨城来客",
        titleOriginal: "雨城来客",
        titleAliases: ["Rain City Visitor"],
        overview: null,
        posterUrl: "https://images.example/rain.jpg",
        productionCountries: ["US"],
        originalLanguage: "en",
        genres: ["Drama", "Mystery"],
        firstReleaseDate: "2026-05-22",
        status: "released",
        tmdbId: 456,
        imdbId: "tt7654321",
        tvdbId: 1
      },
      releases: [{
        platform: "Unspecified",
        region: "US",
        releaseDate: "2026-05-22",
        releaseTime: null,
        releasePattern: "movie_release",
        releaseStatus: "available",
        seasonNumber: null,
        episodeNumber: null,
        source: "thetvdb",
        sourceUrl: "https://www.thetvdb.com/movies/rain-city-visitor"
      }]
    })
    expect(oldMovie?.createIfMissing).toBe(false)
    expect(oldMovie?.releases).toEqual([])
    expect(oldMovie?.media).toMatchObject({
      tmdbId: null,
      firstReleaseDate: "2026-05-21",
      status: "released"
    })
    expect(futureMovie).toMatchObject({
      createIfMissing: true,
      media: {
        sourceId: "thetvdb:movie:3",
        firstReleaseDate: "2026-12-18",
        status: "upcoming"
      },
      releases: [
        expect.objectContaining({
          releaseDate: "2026-12-18",
          releaseStatus: "upcoming"
        })
      ]
    })
    expect(recentSeries).toMatchObject({
      createIfMissing: true,
      media: {
        source: "thetvdb",
        sourceId: "thetvdb:series:101",
        mediaType: "series",
        releaseForm: "tv_series",
        sourceContentType: "series",
        titleDisplay: "海港回声",
        titleAliases: ["Harbor Echo"],
        posterUrl: "https://images.example/harbor.jpg",
        productionCountries: ["KR"],
        originalLanguage: "ko",
        genres: ["Drama"],
        firstReleaseDate: "2026-05-22",
        status: "ongoing",
        tmdbId: 789,
        imdbId: "tt1111111",
        tvdbId: 101
      },
      releases: [
        expect.objectContaining({
          platform: "Unspecified",
          region: "KR",
          releaseDate: "2026-05-22",
          releasePattern: "series_air_date",
          releaseStatus: "available",
          sourceUrl: "https://www.thetvdb.com/series/harbor-echo"
        })
      ]
    })
    expect(upcomingSeries).toMatchObject({
      createIfMissing: true,
      media: {
        sourceId: "thetvdb:series:102",
        firstReleaseDate: "2026-05-01",
        status: "upcoming"
      },
      releases: [
        expect.objectContaining({
          region: "GB",
          releaseDate: "2026-07-21",
          releaseStatus: "upcoming"
        })
      ]
    })
    expect(staleSeries?.createIfMissing).toBe(false)
    expect(staleSeries?.releases).toEqual([])
    expect(staleSeries?.media).toMatchObject({
      status: "ended"
    })
    expect(futureSeries).toMatchObject({
      createIfMissing: true,
      releases: [
        expect.objectContaining({
          releaseDate: "2026-12-18",
          releaseStatus: "upcoming"
        })
      ]
    })
    expect(result.items.flatMap((item) => item.popularitySignals)).toEqual([])
    expect(JSON.stringify(result)).not.toContain("\"score\"")
  })
})
