import { cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../src/App"

const mediaItem = {
  id: "media-1",
  mediaType: "series",
  releaseForm: "web_series",
  titleDisplay: "星际回声",
  titleOriginal: "Echoes Beyond",
  posterUrl: null,
  firstReleaseDate: "2026-06-18",
  status: "upcoming",
  heatScore: 91.4,
  dataSources: ["TMDb", "TVmaze"],
  overview: "一支深空信号追踪小组发现新剧上线异动。",
  productionCountries: "[\"US\"]",
  originalLanguage: "en",
  genres: "[\"Sci-Fi\",\"Drama\"]",
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T01:00:00.000Z"
}

const release = {
  id: "release-1",
  mediaItemId: "media-1",
  platform: "Netflix",
  region: "US",
  releaseDate: "2026-06-18",
  releaseTime: "20:00",
  releasePattern: "weekly",
  releaseStatus: "upcoming",
  seasonNumber: 1,
  episodeNumber: 1,
  episodeTitle: null,
  source: "tvmaze",
  sourceUrl: "https://example.com",
  fetchedAt: "2026-06-17T00:00:00.000Z",
  mediaItem
}

const traktRelease = {
  ...release,
  id: "release-trakt-1",
  platform: "Unspecified",
  region: "GLOBAL",
  seasonNumber: 2,
  episodeNumber: 3,
  episodeTitle: "新的开始",
  source: "trakt"
}

const signal = {
  id: "signal-1",
  mediaItemId: "media-1",
  source: "trakt_trending",
  sourceCategory: "trending",
  platform: "Trakt",
  region: "US",
  window: "week",
  rank: 4,
  previousRank: 1,
  rankDelta: -3,
  value: 1200,
  valueLabel: "1.2k watches",
  capturedAt: "2026-06-17T02:00:00.000Z",
  isCurrent: true,
  sourceUrl: "https://example.com/trending",
  mediaItem
}

const risingSignal = {
  ...signal,
  id: "signal-2",
  source: "tmdb_trending",
  platform: "TMDb",
  region: "GLOBAL",
  rank: 7,
  previousRank: 12,
  rankDelta: 5,
  valueLabel: "本周趋势"
}

const newSignal = {
  ...signal,
  id: "signal-3",
  source: "trakt_anticipated",
  platform: "Trakt",
  region: "GLOBAL",
  rank: 8,
  previousRank: null,
  rankDelta: null,
  valueLabel: "88 list_count"
}

const sourceRun = {
  id: "source-1",
  source: "tvmaze",
  status: "success",
  startedAt: "2026-06-17T00:00:00.000Z",
  finishedAt: "2026-06-17T00:00:02.000Z",
  durationMs: 2000,
  itemCount: 8,
  errorMessage: null,
  nextRunAt: "2026-06-18T00:00:00.000Z"
}

const event = {
  id: "event-1",
  mediaItemId: "media-1",
  eventType: "release_added",
  title: "新增上线日期",
  description: "Netflix US 档期进入监控",
  source: "tvmaze",
  sourceUrl: "https://example.com",
  eventAt: "2026-06-17T03:00:00.000Z",
  payload: "{}"
}

const sourceRef = {
  id: "source-ref-1",
  source: "thetvdb",
  sourceId: "thetvdb:series:101",
  isActive: true,
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T01:00:00.000Z"
}

const inactiveSourceRef = {
  id: "source-ref-2",
  source: "tmdb",
  sourceId: "tmdb:tv:99",
  isActive: false,
  createdAt: "2026-06-16T00:00:00.000Z",
  updatedAt: "2026-06-17T01:00:00.000Z"
}

const responses: Record<string, unknown> = {
  "/api/dashboard": {
    today: [release],
    week: [release],
    trending: [mediaItem],
    events: [event],
    sources: [sourceRun]
  },
  "/api/media": {
    items: [mediaItem],
    nextCursor: null
  },
  "/api/trending": {
    items: [signal, risingSignal, newSignal]
  },
  "/api/calendar": {
    items: [traktRelease]
  },
  "/api/sources": {
    items: [sourceRun]
  },
  "/api/media/media-1": {
    ...mediaItem,
    releases: [traktRelease],
    popularitySignals: [signal],
    changeEvents: [event],
    sourceRefs: [sourceRef, inactiveSourceRef]
  },
  "/api/media/media-1/popularity-history?days=30": {
    items: [
      {
        ...risingSignal,
        id: "signal-history-1",
        rank: 12,
        previousRank: null,
        rankDelta: null,
        capturedAt: "2026-06-16T02:00:00.000Z",
        isCurrent: false,
        mediaItem: undefined
      },
      {
        ...risingSignal,
        mediaItem: undefined
      }
    ]
  }
}

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = input instanceof Request ? input.url : String(input)
    const pathname = path.startsWith("http") ? new URL(path).pathname + new URL(path).search : path
    const body = responses[pathname] ?? (pathname.startsWith("/api/trending?")
      ? responses["/api/trending"]
      : undefined)

    if (!body) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "not_found" })
      } as Response
    }

    return {
      ok: true,
      status: 200,
      json: async () => body
    } as Response
  })
}

function renderRoute(route: string) {
  cleanup()

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("frontend pages", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders dashboard sections from API data", async () => {
    mockFetch()
    renderRoute("/")

    expect(await screen.findByRole("heading", { name: "新片新剧雷达" })).toBeInTheDocument()
    expect(screen.getAllByText("今日上线").length).toBeGreaterThan(0)
    expect(screen.getAllByText("星际回声").length).toBeGreaterThan(0)
    expect(screen.getByText("新增上线日期")).toBeInTheDocument()
  })

  it("renders discover cards from media API data", async () => {
    mockFetch()
    renderRoute("/discover")

    expect(await screen.findByRole("heading", { name: "发现列表" })).toBeInTheDocument()
    expect(screen.getAllByText("web_series").length).toBeGreaterThan(0)
    expect(screen.getByText("Heat 91")).toBeInTheDocument()
    expect(screen.getByText("来源 TMDb · TVmaze")).toBeInTheDocument()
  })

  it("renders trending, calendar, and sources rows from API data", async () => {
    mockFetch()
    renderRoute("/trending")

    expect(await screen.findByText("Trakt 趋势榜", { selector: ".rankSource span" })).toBeInTheDocument()
    expect(screen.getByText("#4")).toBeInTheDocument()
    expect(screen.getByText("1.2k watches")).toBeInTheDocument()
    expect(screen.getByText("Trakt 期待榜", { selector: ".rankSource span" })).toBeInTheDocument()
    expect(screen.getByText("88 list_count")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Trakt 趋势榜" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Trakt 期待榜" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Trakt" })).toBeInTheDocument()

    renderRoute("/calendar")
    expect(await screen.findByText("2026-06-18")).toBeInTheDocument()
    expect(screen.getByText("平台未提供 · GLOBAL")).toBeInTheDocument()
    expect(screen.getByText("S2 E3 · 新的开始")).toBeInTheDocument()
    expect(screen.getByText("来源 Trakt")).toBeInTheDocument()

    renderRoute("/sources")
    expect(await screen.findByText("tvmaze")).toBeInTheDocument()
    expect(screen.getByText("8 条")).toBeInTheDocument()
  })

  it("writes movement and source filters to the API request", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderRoute("/trending")

    await user.click(await screen.findByRole("tab", { name: "上升" }))
    await user.selectOptions(screen.getByLabelText("热度来源"), "tmdb_trending")

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trending?movement=rising&source=tmdb_trending"
    )
  })

  it("renders positive negative and new rank movement", async () => {
    mockFetch()
    renderRoute("/trending")

    expect(await screen.findByText("上升 5 位")).toHaveClass("movementUp")
    expect(screen.getByText("下降 3 位")).toHaveClass("movementDown")
    expect(screen.getByText("新进榜")).toHaveClass("movementNew")
  })

  it("renders media detail from API data", async () => {
    const fetchMock = mockFetch()
    renderRoute("/media/media-1")

    expect(await screen.findByRole("heading", { name: "星际回声" })).toBeInTheDocument()
    expect(screen.getByText("一支深空信号追踪小组发现新剧上线异动。")).toBeInTheDocument()
    expect(screen.getByText("数据来源 TheTVDB")).toBeInTheDocument()
    expect(screen.getByText("历史来源 TMDb")).toBeInTheDocument()
    expect(screen.getByText("平台未提供")).toBeInTheDocument()
    expect(screen.getByText("S2 E3 · 新的开始")).toBeInTheDocument()
    expect(screen.getByText("来源 Trakt")).toBeInTheDocument()
    expect(screen.getByText("release_added")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/media/media-1/popularity-history?days=30"
    )
    expect(screen.getByRole("heading", { name: "热度时间线" })).toBeInTheDocument()
  })
})
