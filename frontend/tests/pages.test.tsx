import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../src/App"
import { rankingScopeLabel, trendingPosterUrl } from "../src/pages/TrendingPage"

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
  releasePattern: "episode_release",
  seasonNumber: 2,
  episodeNumber: 3,
  episodeTitle: "新的开始",
  source: "trakt"
}

const movieRelease = {
  ...traktRelease,
  id: "release-trakt-movie",
  mediaItemId: "media-movie-1",
  seasonNumber: null,
  episodeNumber: null,
  episodeTitle: null,
  mediaItem: {
    ...mediaItem,
    id: "media-movie-1",
    mediaType: "movie",
    releaseForm: "movie",
    titleDisplay: "午夜档案"
  }
}

const signal = {
  id: "signal-1",
  mediaItemId: "media-1",
  source: "trakt_trending",
  sourceCategory: "trending",
  platform: "Trakt",
  region: "US",
  window: "week",
  rankingScope: "movie",
  rank: 4,
  previousRank: 1,
  rankDelta: -3,
  value: 1200,
  valueLabel: "1.2k watches",
  capturedAt: "2026-06-17T02:00:00.000Z",
  isCurrent: true,
  sourceUrl: "https://example.com/trending",
  mediaItem: {
    ...mediaItem,
    posterUrl: "https://image.tmdb.org/t/p/w500/example.jpg"
  }
}

const risingSignal = {
  ...signal,
  id: "signal-2",
  source: "tmdb_trending",
  platform: "TMDb",
  region: "GLOBAL",
  rankingScope: "overall",
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

const tencentSignal = {
  ...signal,
  id: "signal-4",
  source: "tencent_reserve",
  sourceCategory: "official_platform",
  platform: "腾讯视频",
  region: "CN",
  window: "upcoming",
  rankingScope: "overall",
  rank: 2,
  previousRank: 3,
  rankDelta: 1,
  value: 500000,
  valueLabel: "预约破50万"
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

const sourceCatalogItems = [
  {
    id: "tmdb",
    name: "TMDb",
    description: "电影、剧集、趋势和基础元数据",
    group: "global_metadata",
    implementationStatus: "active",
    enabled: true,
    runnable: true,
    proxyMode: "inherit",
    credentialsComplete: true,
    missingCredentials: [],
    supportsSync: true,
    supportsEnable: true,
    fields: [],
    semantics: {
      signalKinds: ["metadata", "community_trend", "release_calendar"],
      coverage: "全球电影与剧集",
      cadence: "小时级趋势与日级发现",
      access: "free_key",
      freshnessNote: "趋势不代表流媒体已上架",
      riskNote: "需要 TMDb API Key"
    },
    localState: null,
    manualCommands: [],
    latestRun: {
      status: "success",
      startedAt: "2026-06-17T00:00:00.000Z",
      finishedAt: "2026-06-17T00:00:02.000Z",
      durationMs: 2000,
      itemCount: 8,
      errorMessage: null
    }
  },
  {
    id: "imdb",
    name: "IMDb",
    description: "日更数据集与榜单",
    group: "global_metadata",
    implementationStatus: "planned",
    enabled: false,
    runnable: false,
    proxyMode: "inherit",
    credentialsComplete: true,
    missingCredentials: [],
    supportsSync: false,
    supportsEnable: false,
    fields: [],
    semantics: {
      signalKinds: ["metadata", "rating"],
      coverage: "全球电影、剧集、单集和 IMDb ID",
      cadence: "日级或手动数据集导入",
      access: "public_api",
      freshnessNote: "优先使用 IMDb 非商业 datasets",
      riskNote: "数据集体积较大，需要本地缓存"
    },
    localState: {
      kind: "imdb_datasets",
      status: "ready",
      configured: true,
      readyFiles: 2,
      totalFiles: 2,
      files: []
    },
    manualCommands: [
      {
        label: "下载或刷新 IMDb 缓存",
        command: "npm run download:imdb --workspace backend",
        description: "从 IMDb 官方 datasets 下载 gzip 到已配置缓存目录"
      },
      {
        label: "同步 IMDb 本地缓存",
        command: "npm run sync:imdb --workspace backend",
        description: "只补充当前库已有作品的 IMDb ID 和评分，不创建陌生作品"
      }
    ],
    latestRun: null
  },
  {
    id: "flixpatrol",
    name: "FlixPatrol",
    description: "多平台地区 Top 10",
    group: "cross_platform",
    implementationStatus: "commercial",
    enabled: false,
    runnable: false,
    proxyMode: "inherit",
    credentialsComplete: true,
    missingCredentials: [],
    supportsSync: false,
    supportsEnable: false,
    fields: [],
    semantics: {
      signalKinds: ["platform_rank", "availability"],
      coverage: "全球多平台和地区榜单",
      cadence: "商业数据产品",
      access: "commercial",
      freshnessNote: "需要商业授权后才能同步",
      riskNote: "当前不能作为免费来源启用"
    },
    localState: null,
    manualCommands: [],
    latestRun: null
  }
]

const event = {
  id: "event-1",
  mediaItemId: "media-1",
  eventType: "release_announced",
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
    featured: [mediaItem],
    trending: [mediaItem],
    events: [event],
    sources: [sourceRun]
  },
  "/api/media": {
    items: [mediaItem],
    nextCursor: null
  },
  "/api/trending": {
    items: [signal, risingSignal, newSignal, tencentSignal]
  },
  "/api/calendar": {
    items: [traktRelease, movieRelease],
    days: [{
      date: "2026-06-18",
      count: 2,
      items: [traktRelease, movieRelease]
    }]
  },
  "/api/preview": {
    generatedAt: "2026-07-11T02:00:00.000Z",
    today: "2026-07-11",
    source: {
      enabled: true,
      runnable: true,
      syncing: false,
      latestRun: null,
      lastSuccessAt: "2026-07-11T01:00:00.000Z"
    },
    summary: { total: 2, movies: 1, series: 1, undated: 1, hot: 1 },
    days: [{
      date: "2026-07-18",
      items: [{
        ...movieRelease,
        releasePattern: "theatrical_coming_soon",
        source: "douban",
        sourceUrl: "https://movie.douban.com/subject/1/",
        doubanHotRank: 3,
        doubanHotKind: "movie",
        doubanWishCount: 220099
      }]
    }],
    undated: [{
      ...traktRelease,
      id: "release-undated",
      releaseDate: null,
      releasePattern: "tv_coming_soon",
      source: "douban",
      sourceUrl: "https://movie.douban.com/subject/2/",
      doubanHotRank: null,
      doubanHotKind: null,
      doubanWishCount: null
    }]
  },
  "/api/sources": {
    items: sourceCatalogItems
  },
  "/api/source-health": {
    generatedAt: "2026-06-17T02:05:00.000Z",
    summary: {
      total: 1,
      passed: 0,
      degraded: 1,
      failed: 0,
      blocked: 0,
      runnable: 1,
      stale: 0
    },
    items: [
      {
        sourceId: "tmdb",
        sourceName: "TMDb",
        scope: "default",
        scheduleGroup: "hourly",
        group: "global_metadata",
        implementationStatus: "active",
        enabled: true,
        runnable: true,
        credentialsComplete: true,
        missingCredentials: [],
        signalKinds: ["metadata", "community_trend", "release_calendar"],
        runStatus: "failed",
        acceptanceStatus: "degraded",
        freshnessStatus: "fresh",
        reasonCode: "latest_failed_with_fresh_success",
        reason: "最近同步失败，但仍有新鲜成功数据可用",
        latestRun: {
          status: "failed",
          startedAt: "2026-06-17T02:00:00.000Z",
          finishedAt: "2026-06-17T02:00:02.000Z",
          itemCount: 0,
          durationMs: 2000,
          errorMessage: "fetch failed"
        },
        lastSuccessAt: "2026-06-17T01:00:00.000Z",
        staleAfterHours: 3,
        itemCount: 8,
        samples: []
      }
    ]
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
    let body = responses[pathname]
    if (pathname.startsWith("/api/media?")) body = responses["/api/media"]
    if (pathname.startsWith("/api/trending?")) body = responses["/api/trending"]
    if (pathname.startsWith("/api/calendar?")) {
      const params = new URL(`http://local${pathname}`).searchParams
      const calendar = responses["/api/calendar"] as {
        items: unknown[]
        days: unknown[]
      }
      body = params.get("summary") === "true"
        ? { items: [], days: calendar.days }
        : params.get("from") === "2026-06-18"
          ? calendar
          : { items: [], days: [] }
    }

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
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
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

  it("loads discover results from the global search query", async () => {
    const fetchMock = mockFetch()
    renderRoute("/discover?q=TMDb")

    expect(await screen.findByText("“TMDb”的匹配结果")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/media?q=TMDb")
  })

  it("renders trending, calendar, and sources rows from API data", async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    })
    mockFetch()
    renderRoute("/trending")

    expect(await screen.findByText("Trakt 趋势榜", { selector: ".rankSource span" })).toBeInTheDocument()
    expect(screen.getByText("TMDb 电影趋势", { selector: ".rankSource span" })).toBeInTheDocument()
    expect(screen.getAllByRole("img", { name: "星际回声" })).toHaveLength(1)
    expect(screen.getByText("4 个榜单")).toBeInTheDocument()
    expect(screen.getByLabelText("热度 91")).toHaveTextContent("Heat91")
    expect(screen.getByText("第 4 名")).toBeInTheDocument()
    expect(screen.getByText("1.2k watches")).toBeInTheDocument()
    expect(screen.getByText("Trakt 期待榜", { selector: ".rankSource span" })).toBeInTheDocument()
    expect(screen.getByText("电影榜 · 88 list_count")).toBeInTheDocument()
    expect(screen.getByText("预约破50万")).toBeInTheDocument()
    expect(screen.getByText("腾讯视频预约", { selector: ".rankSource span" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "打开 Trakt 趋势榜 来源" })).toHaveAttribute(
      "href",
      "https://example.com/trending"
    )
    expect(screen.getByRole("option", { name: "Trakt 趋势榜" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Trakt 期待榜" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Trakt" })).toBeInTheDocument()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date("2026-06-17T12:00:00.000Z"))
    renderRoute("/calendar")
    expect(await screen.findByRole("heading", { name: "海报日历" })).toBeInTheDocument()
    expect(screen.getByText("2026年6月")).toBeInTheDocument()
    fireEvent.click(await screen.findByRole("button", { name: "6月18日，2部影视" }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" })
    const movieRow = (await screen.findByText("午夜档案", { selector: "h3" })).closest("article")
    const seriesRow = screen.getByText("星际回声", { selector: "h3" }).closest("article")
    expect(seriesRow).toHaveTextContent("平台待确认")
    expect(seriesRow).toHaveTextContent("剧集更新")
    expect(seriesRow).toHaveTextContent("S2 E3 · 新的开始")
    expect(seriesRow).toHaveTextContent("来源 Trakt")
    expect(screen.getAllByRole("link", { name: "打开 Trakt 来源" })[0]).toHaveAttribute(
      "href",
      "https://example.com"
    )
    const movieEpisode = movieRow?.querySelector(".calendarPremiereEpisode")
    expect(movieEpisode).toBeNull()
    expect(movieRow).not.toHaveTextContent(/S\d+ E\d+/)

    renderRoute("/sources")
    expect(await screen.findByText("TMDb")).toBeInTheDocument()
    expect(screen.getByText("已启用").closest("div")).toHaveTextContent("1")
    expect(screen.getByText("健康来源").closest("div")).toHaveTextContent("0")
    expect(screen.getByText("需处理").closest("div")).toHaveTextContent("1")
    expect(screen.getByText("社区热度")).toBeInTheDocument()
    expect(screen.getByText("全球电影与剧集 · 小时级趋势与日级发现")).toBeInTheDocument()
    expect(screen.getByText("8 条")).toBeInTheDocument()
    expect(screen.getByText("降级可用")).toHaveClass("degraded")
    expect(screen.getByText("最近同步失败，但仍有新鲜成功数据可用")).toBeInTheDocument()
    expect(screen.getByText("IMDb")).toBeInTheDocument()
    expect(screen.getByText("缓存就绪")).toBeInTheDocument()
    expect(screen.getByText("2/2 文件")).toBeInTheDocument()
    expect(screen.getByText("缓存已就绪，等待同步")).toBeInTheDocument()
    expect(screen.getByText("npm run sync:imdb --workspace backend")).toBeInTheDocument()
    expect(screen.getByText("FlixPatrol")).toBeInTheDocument()
    expect(screen.getByText("商业授权")).toBeInTheDocument()
    expect(screen.getByText("当前不能作为免费来源启用")).toBeInTheDocument()
  })

  it("navigates calendar months and filters poster days by media type", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date("2026-06-17T12:00:00.000Z"))
    const fetchMock = mockFetch()
    renderRoute("/calendar")

    expect(await screen.findByText("2026年6月")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "后一个月" }))
    expect(screen.getByText("2026年7月")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/calendar?from=2026-07-01&to=2026-07-31&summary=true"
    )

    fireEvent.click(screen.getByRole("tab", { name: "电影" }))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/calendar?from=2026-07-01&to=2026-07-31&summary=true&mediaType=movie"
    )
  })

  it("renders the Douban preview timeline and opens its detail drawer", async () => {
    mockFetch()
    renderRoute("/preview")

    expect(await screen.findByRole("heading", { name: "待映 · 待播" })).toBeInTheDocument()
    expect(screen.getByText("2026年7月")).toBeInTheDocument()
    expect(screen.getByText("电影热榜 #3")).toBeInTheDocument()
    expect(screen.getByText("22万 人想看")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "待定档" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /午夜档案，电影热榜 #3/ }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("豆瓣电影热榜 #3")).toBeInTheDocument()
    expect(screen.getByText("220,099 人想看")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "查看完整详情" })).toHaveAttribute(
      "href",
      "/media/media-movie-1"
    )
  })

  it("polls source catalog status while the page is open", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval")
    mockFetch()

    renderRoute("/sources")

    expect(await screen.findByText("TMDb")).toBeInTheDocument()
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
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

  it("将独立榜单范围写入热度接口并显示中文名称", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderRoute("/trending")

    await user.selectOptions(await screen.findByLabelText("热度来源"), "netflix_top10")
    await user.selectOptions(screen.getByLabelText("榜单范围"), "films_non_english")

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trending?source=netflix_top10&rankingScope=films_non_english"
    )
    expect(rankingScopeLabel("films_non_english")).toBe("非英语电影榜")
    expect(rankingScopeLabel("overall")).toBeNull()
  })

  it("使用接口中的中文平台值筛选爱奇艺预约", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderRoute("/trending")

    await user.selectOptions(await screen.findByLabelText("热度来源"), "iqiyi_reserve")
    await user.selectOptions(screen.getByLabelText("平台"), "爱奇艺")

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trending?source=iqiyi_reserve&platform=%E7%88%B1%E5%A5%87%E8%89%BA"
    )
  })

  it("使用接口中的中文平台值筛选腾讯视频预约", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderRoute("/trending")

    await user.selectOptions(await screen.findByLabelText("热度来源"), "tencent_reserve")
    await user.selectOptions(screen.getByLabelText("平台"), "腾讯视频")

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trending?source=tencent_reserve&platform=%E8%85%BE%E8%AE%AF%E8%A7%86%E9%A2%91"
    )
  })

  it("仅为热度榜爱奇艺预约升级海报清晰度", () => {
    const posterUrl = "https://pic8.iqiyipic.com/image/example_141_188.jpg"

    expect(trendingPosterUrl({ ...signal, source: "iqiyi_reserve" }, posterUrl))
      .toBe("https://pic8.iqiyipic.com/image/example_579_772.jpg")
    expect(trendingPosterUrl(signal, posterUrl)).toBe(posterUrl)
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
    expect(screen.getByRole("link", { name: "打开 Trakt 来源" })).toHaveAttribute("href", "https://example.com")
    expect(screen.getByRole("link", { name: "打开 Trakt 趋势榜 来源" })).toHaveAttribute("href", "https://example.com/trending")
    expect(screen.getByRole("link", { name: "打开 TVmaze 来源" })).toHaveAttribute("href", "https://example.com")
    expect(screen.getAllByText("即将上线").length).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/media/media-1/popularity-history?days=30"
    )
    expect(screen.getByRole("heading", { name: "热度时间线" })).toBeInTheDocument()
  })
})
