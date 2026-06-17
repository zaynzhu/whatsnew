import { cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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
  source: "demo",
  sourceUrl: "https://example.com",
  fetchedAt: "2026-06-17T00:00:00.000Z",
  mediaItem
}

const signal = {
  id: "signal-1",
  mediaItemId: "media-1",
  source: "trakt",
  sourceCategory: "trending",
  platform: "Trakt",
  region: "US",
  window: "week",
  rank: 4,
  rankDelta: -2,
  value: 1200,
  valueLabel: "1.2k watches",
  capturedAt: "2026-06-17T02:00:00.000Z",
  sourceUrl: "https://example.com/trending",
  mediaItem
}

const sourceRun = {
  id: "source-1",
  source: "demo",
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
  source: "demo",
  sourceUrl: "https://example.com",
  eventAt: "2026-06-17T03:00:00.000Z",
  payload: "{}"
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
    items: [signal]
  },
  "/api/calendar?from=2026-06-17&to=2026-06-30": {
    items: [release]
  },
  "/api/sources": {
    items: [sourceRun]
  },
  "/api/media/media-1": {
    ...mediaItem,
    releases: [release],
    popularitySignals: [signal],
    changeEvents: [event]
  }
}

function mockFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = input instanceof Request ? input.url : String(input)
    const pathname = path.startsWith("http") ? new URL(path).pathname + new URL(path).search : path
    const body = responses[pathname]

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
  })

  it("renders trending, calendar, and sources rows from API data", async () => {
    mockFetch()
    renderRoute("/trending")

    expect(await screen.findByText("trakt #4")).toBeInTheDocument()
    expect(screen.getByText("1.2k watches")).toBeInTheDocument()

    renderRoute("/calendar")
    expect(await screen.findByText("2026-06-18")).toBeInTheDocument()
    expect(screen.getByText("Netflix · US")).toBeInTheDocument()

    renderRoute("/sources")
    expect(await screen.findByText("demo")).toBeInTheDocument()
    expect(screen.getByText("8 条")).toBeInTheDocument()
  })

  it("renders media detail from API data", async () => {
    mockFetch()
    renderRoute("/media/media-1")

    expect(await screen.findByRole("heading", { name: "星际回声" })).toBeInTheDocument()
    expect(screen.getByText("一支深空信号追踪小组发现新剧上线异动。")).toBeInTheDocument()
    expect(screen.getByText("Netflix")).toBeInTheDocument()
    expect(screen.getByText("release_added")).toBeInTheDocument()
  })
})
