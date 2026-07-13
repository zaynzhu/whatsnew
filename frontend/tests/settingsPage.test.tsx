import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../src/App"
import type { PosterHealthResponse, SettingsFieldView, SettingsResponse, SourceSettingsView } from "../src/api/types"

type SourceFixtureOptions = {
  group: "global_metadata" | "cross_platform" | "international_platform" | "china_platform"
  implementationStatus?: "active" | "blocked" | "planned" | "commercial"
  enabled?: boolean
  runnable?: boolean
  supportsSync?: boolean
  supportsEnable?: boolean
  credentialsComplete?: boolean
  missingCredentials?: string[]
  fields?: SettingsFieldView[]
  semantics?: SourceSettingsView["semantics"]
  localState?: SourceSettingsView["localState"]
  manualCommands?: SourceSettingsView["manualCommands"]
}

function sourceFixture(id: string, name: string, options: SourceFixtureOptions): SourceSettingsView {
  return {
    id,
    name,
    description: `${name} 数据源`,
    group: options.group,
    implementationStatus: options.implementationStatus ?? "planned",
    enabled: options.enabled ?? false,
    runnable: options.runnable ?? options.enabled ?? false,
    proxyMode: "inherit" as const,
    credentialsComplete: options.credentialsComplete ?? true,
    missingCredentials: options.missingCredentials ?? [],
    supportsSync: options.supportsSync ?? false,
    supportsEnable: options.supportsEnable ?? false,
    fields: options.fields ?? [],
    semantics: options.semantics ?? {
      signalKinds: ["metadata"],
      coverage: `${name} 覆盖范围`,
      cadence: "日级刷新",
      access: "public_page",
      freshnessNote: `${name} 时效说明`,
      riskNote: `${name} 风险说明`
    },
    localState: options.localState ?? null,
    manualCommands: options.manualCommands ?? [],
    latestRun: null
  } as SourceSettingsView
}

const proxyFields: SettingsFieldView[] = [
  {
    key: "HTTP_PROXY",
    label: "HTTP 代理",
    type: "password" as const,
    sensitive: true,
    configured: false,
    maskedValue: null,
    value: null
  },
  {
    key: "HTTPS_PROXY",
    label: "HTTPS 代理",
    type: "password" as const,
    sensitive: true,
    configured: true,
    maskedValue: "********7890",
    value: null
  }
]

const contentWeights = [
  { category: "scripted" as const, key: "ATTENTION_WEIGHT_SCRIPTED", label: "电影与剧情剧", description: "电影、剧情连续剧、网络剧和短剧", value: 100, defaultValue: 100 },
  { category: "animation" as const, key: "ATTENTION_WEIGHT_ANIMATION", label: "动画", description: "动画电影、动画连续剧和番剧", value: 90, defaultValue: 90 },
  { category: "documentary" as const, key: "ATTENTION_WEIGHT_DOCUMENTARY", label: "纪录片", description: "纪录电影与纪录剧集", value: 45, defaultValue: 45 },
  { category: "reality_variety" as const, key: "ATTENTION_WEIGHT_REALITY_VARIETY", label: "真人秀与综艺", description: "真人秀、综艺和竞演节目", value: 45, defaultValue: 45 },
  { category: "talk_game" as const, key: "ATTENTION_WEIGHT_TALK_GAME", label: "谈话与游戏节目", description: "脱口秀、访谈、游戏和问答节目", value: 20, defaultValue: 20 },
  { category: "news" as const, key: "ATTENTION_WEIGHT_NEWS", label: "新闻节目", description: "晨间新闻、新闻简报和时事节目", value: 5, defaultValue: 5 },
  { category: "sports" as const, key: "ATTENTION_WEIGHT_SPORTS", label: "体育节目", description: "体育直播、赛事集锦和体育谈话节目", value: 5, defaultValue: 5 }
]

const sourceFixtures = [
  sourceFixture("tvmaze", "TVmaze", { group: "global_metadata", implementationStatus: "active", enabled: true, supportsSync: true, supportsEnable: true }),
  sourceFixture("tmdb", "TMDb", {
    group: "global_metadata",
    implementationStatus: "active",
    enabled: true,
    supportsSync: true,
    supportsEnable: true,
    credentialsComplete: true,
    fields: [
      { key: "TMDB_BASE_URL", label: "TMDb Base URL", type: "text", sensitive: false, configured: true, maskedValue: null, value: "https://api.themoviedb.org/3" },
      { key: "TMDB_API_KEY", label: "TMDb API Key", type: "password", sensitive: true, configured: true, maskedValue: "********1234", value: null },
      { key: "SOURCE_TMDB_HTTP_PROXY", label: "TMDb HTTP 代理", type: "password", sensitive: true, configured: false, maskedValue: null, value: null },
      { key: "SOURCE_TMDB_HTTPS_PROXY", label: "TMDb HTTPS 代理", type: "password", sensitive: true, configured: false, maskedValue: null, value: null }
    ]
  }),
  sourceFixture("trakt", "Trakt", {
    group: "global_metadata",
    implementationStatus: "active",
    enabled: true,
    runnable: false,
    supportsSync: true,
    supportsEnable: true,
    credentialsComplete: false,
    missingCredentials: ["TRAKT_CLIENT_ID"]
  }),
  sourceFixture("imdb", "IMDb", {
    group: "global_metadata",
    fields: [
      { key: "IMDB_DATASET_CACHE_DIR", label: "IMDb 数据集缓存目录", type: "text", sensitive: false, configured: true, maskedValue: null, value: "/data/imdb" }
    ],
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
    ]
  }),
  sourceFixture("thetvdb", "TheTVDB", {
    group: "global_metadata",
    implementationStatus: "active",
    enabled: false,
    runnable: false,
    supportsSync: true,
    supportsEnable: true,
    credentialsComplete: false,
    missingCredentials: ["THETVDB_API_KEY"]
  }),
  sourceFixture("justwatch", "JustWatch", {
    group: "cross_platform",
    implementationStatus: "commercial",
    semantics: {
      signalKinds: ["availability", "platform_rank"],
      coverage: "多地区流媒体可看性",
      cadence: "日级榜单",
      access: "application",
      freshnessNote: "需要申请后才能确认同步频率",
      riskNote: "申请制数据源，当前不能直接同步"
    }
  }),
  sourceFixture("flixpatrol", "FlixPatrol", {
    group: "cross_platform",
    implementationStatus: "commercial",
    semantics: {
      signalKinds: ["platform_rank"],
      coverage: "全球多平台地区榜单",
      cadence: "商业数据产品",
      access: "commercial",
      freshnessNote: "需要商业授权后才能同步",
      riskNote: "当前不能作为免费来源启用"
    }
  }),
  sourceFixture("netflix", "Netflix", { group: "international_platform" }),
  sourceFixture("prime_video", "Prime Video", { group: "international_platform" }),
  sourceFixture("hulu", "Hulu", { group: "international_platform" }),
  sourceFixture("disney_plus", "Disney+", { group: "international_platform" }),
  sourceFixture("max", "Max", { group: "international_platform" }),
  sourceFixture("apple_tv_plus", "Apple TV+", { group: "international_platform" }),
  sourceFixture("youku", "优酷", {
    group: "china_platform",
    implementationStatus: "active",
    enabled: true,
    supportsSync: true,
    supportsEnable: true,
    semantics: {
      signalKinds: ["platform_catalog", "platform_rank"],
      coverage: "中国电影、剧集、综艺、动漫和短剧",
      cadence: "小时级平台热度",
      access: "public_page",
      freshnessNote: "只代表优酷站内口径",
      riskNote: "页面结构变化会影响采集"
    }
  }),
  sourceFixture("iqiyi", "爱奇艺", { group: "china_platform", implementationStatus: "active", enabled: true, supportsSync: true, supportsEnable: true }),
  sourceFixture("tencent", "腾讯视频", { group: "china_platform" }),
  sourceFixture("mango_tv", "芒果TV", { group: "china_platform" }),
  sourceFixture("bilibili", "哔哩哔哩", { group: "china_platform" }),
  sourceFixture("douban", "豆瓣", { group: "china_platform" }),
  sourceFixture("mtime", "时光网", { group: "china_platform" })
]

const settingsResponse: SettingsResponse = {
  proxyFields,
  contentWeights,
  scheduler: {
    enabled: true,
    forcedDisabled: false,
    hourlyIntervalHours: 1,
    dailyTime: "09:15",
    timezone: "Asia/Shanghai",
    nextHourlyRunAt: "2026-07-13T02:00:00.000Z",
    nextDailyRunAt: "2026-07-14T01:15:00.000Z"
  },
  sources: sourceFixtures
}

const posterHealthResponse: PosterHealthResponse = {
  total: 857,
  withPoster: 707,
  missing: 150,
  coveragePercent: 82.5,
  statuses: { unverified: 700, healthy: 150, degraded: 5, broken: 2 },
  quality: { unknown: 630, adequate: 70, undersized: 7 },
  lookup: { notAttempted: 12, cooldown: 130, retryEligible: 8, retryAfterDays: 7 },
  cache: {
    entries: 209,
    bytes: 73_886_357,
    orphanedFiles: 0,
    corruptEntries: 0,
    variants: {
      entries: 418,
      bytes: 31_457_280,
      orphanedFiles: 1,
      corruptEntries: 0,
      maxBytes: 536_870_912
    }
  },
  samples: {
    broken: [],
    degraded: [],
    missing: [{
      id: "media-missing",
      title: "Agent Kim Reactivated",
      heatScore: 98,
      sources: ["netflix"],
      width: null,
      height: null,
      lookupState: "cooldown",
      lastLookupAt: "2026-07-12T02:30:00.000Z"
    }],
    undersized: [{
      id: "media-low-resolution",
      title: "Low Resolution Poster",
      heatScore: 91,
      sources: ["iqiyi"],
      width: 141,
      height: 188,
      lookupState: "retry_eligible",
      lastLookupAt: "2026-07-01T02:30:00.000Z"
    }]
  }
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response
}

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/settings"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("只展示已保存代理的掩码", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settingsResponse))

    renderSettings()

    expect(await screen.findByRole("heading", { name: "系统设置" })).toBeInTheDocument()
    const httpsProxy = screen.getByLabelText("HTTPS 代理")
    expect(httpsProxy).toHaveAttribute("type", "password")
    expect(httpsProxy).toHaveValue("")
    expect(httpsProxy).toHaveAttribute("placeholder", "********7890")
    expect(screen.queryByDisplayValue(/7890/)).not.toBeInTheDocument()
  })

  it("展示图片覆盖率、缓存和高优先级缺图", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      return input === "/api/poster-health"
        ? jsonResponse(posterHealthResponse)
        : jsonResponse(settingsResponse)
    })

    renderSettings()

    expect(await screen.findByRole("heading", { name: "图片健康" })).toBeInTheDocument()
    expect(screen.getByText("82.5%")).toBeInTheDocument()
    expect(screen.getByText("707 / 857")).toBeInTheDocument()
    expect(screen.getByText("209 张")).toBeInTheDocument()
    expect(screen.getByText("418 张")).toBeInTheDocument()
    expect(screen.getByText("30 / 512 MB")).toBeInTheDocument()
    expect(screen.getByText("孤立文件 1")).toBeInTheDocument()
    expect(screen.getByText("低清 7")).toBeInTheDocument()
    expect(screen.getByText("130")).toBeInTheDocument()
    expect(screen.getByText("可以重试")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Low Resolution Poster/ })).toHaveAttribute(
      "href",
      "/media/media-low-resolution"
    )
    expect(screen.getByRole("link", { name: /Agent Kim Reactivated/ })).toHaveAttribute(
      "href",
      "/media/media-missing"
    )
  })

  it("保存修改后提示配置立即生效", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "/api/settings" && init?.method === "PUT") {
        return jsonResponse({ success: true, effectiveImmediately: true })
      }
      return jsonResponse(settingsResponse)
    })
    const user = userEvent.setup()

    renderSettings()
    const httpProxy = await screen.findByLabelText("HTTP 代理")
    await user.type(httpProxy, "http://127.0.0.1:7890")
    await user.click(screen.getByRole("button", { name: "保存设置" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          values: { HTTP_PROXY: "http://127.0.0.1:7890" },
          clearKeys: []
        })
      }))
    })
    expect(await screen.findByText("设置已立即生效")).toBeInTheDocument()
  })

  it("调整并保存内容关注权重", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "/api/settings" && init?.method === "PUT") {
        return jsonResponse({ success: true, effectiveImmediately: true })
      }
      return jsonResponse(settingsResponse)
    })

    renderSettings()
    const newsWeight = await screen.findByRole("slider", { name: "新闻节目权重" })
    fireEvent.change(newsWeight, { target: { value: "15" } })
    await userEvent.setup().click(screen.getByRole("button", { name: "保存权重" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          values: { ATTENTION_WEIGHT_NEWS: "15" },
          clearKeys: []
        })
      }))
    })
    expect(await screen.findByText("关注权重已立即生效")).toBeInTheDocument()
  })

  it("修改刷新频率并立即保存调度", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "/api/settings" && init?.method === "PUT") {
        return jsonResponse({ success: true, effectiveImmediately: true })
      }
      return jsonResponse(settingsResponse)
    })
    const user = userEvent.setup()

    renderSettings()
    await user.selectOptions(await screen.findByLabelText("小时级刷新频率"), "3")
    fireEvent.change(screen.getByLabelText("日级刷新时间"), { target: { value: "06:40" } })
    await user.click(screen.getByRole("button", { name: "保存调度" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          values: {
            SCHEDULER_HOURLY_INTERVAL_HOURS: "3",
            SCHEDULER_DAILY_TIME: "06:40"
          },
          clearKeys: []
        })
      }))
    })
    expect(await screen.findByText("刷新调度已立即生效")).toBeInTheDocument()
  })

  it("用尚未保存的代理值执行连通性测试", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "/api/settings/proxy/test" && init?.method === "POST") {
        return jsonResponse({
          items: [
            { mode: "direct", success: true, durationMs: 120, statusCode: 200, errorType: null, message: "连接成功" },
            { mode: "http_proxy", success: true, durationMs: 180, statusCode: 200, errorType: null, message: "连接成功" },
            { mode: "https_proxy", success: false, durationMs: 300, statusCode: null, errorType: "proxy_unreachable", message: "代理不可达" }
          ]
        })
      }
      return jsonResponse(settingsResponse)
    })
    const user = userEvent.setup()

    renderSettings()
    const httpsProxy = await screen.findByLabelText("HTTPS 代理")
    await user.type(httpsProxy, "http://127.0.0.1:7890")
    await user.click(screen.getByRole("button", { name: "测试代理连接" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings/proxy/test", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ HTTPS_PROXY: "http://127.0.0.1:7890" })
      }))
    })
    expect(await screen.findByText("代理不可达")).toBeInTheDocument()
    expect(screen.getByText("180 ms")).toBeInTheDocument()
  })

  it("测试代理时包含尚未保存的清除操作", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "/api/settings/proxy/test" && init?.method === "POST") {
        return jsonResponse({ items: [] })
      }
      return jsonResponse(settingsResponse)
    })
    const user = userEvent.setup()

    renderSettings()
    await user.click(await screen.findByLabelText("清除已保存的HTTPS 代理"))
    await user.click(screen.getByRole("button", { name: "测试代理连接" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings/proxy/test", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ HTTPS_PROXY: "" })
      }))
    })
  })

  it("展示规划与商业数据源但禁止启用和同步", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settingsResponse))

    renderSettings()

    expect(await screen.findByText("IMDb")).toBeInTheDocument()
    expect(screen.getByText("JustWatch")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "启用 IMDb" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "同步 JustWatch" })).toBeDisabled()
  })

  it("展示 IMDb 本地缓存状态并提供缓存目录配置", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settingsResponse))
    const user = userEvent.setup()

    renderSettings()

    expect(await screen.findByText("缓存就绪")).toBeInTheDocument()
    expect(screen.getByText("2/2 文件")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "配置 IMDb" }))

    expect(screen.getByRole("dialog", { name: "配置 IMDb" })).toBeInTheDocument()
    expect(screen.getByLabelText("IMDb 数据集缓存目录")).toHaveValue("/data/imdb")
    expect(screen.getByRole("heading", { name: "本地操作" })).toBeInTheDocument()
    expect(screen.getByText("缓存已就绪，等待同步")).toBeInTheDocument()
    expect(screen.getByText("运行本地同步后会写入 IMDb ID 和评分")).toBeInTheDocument()
    expect(screen.getByText("npm run download:imdb --workspace backend")).toBeInTheDocument()
    expect(screen.getAllByText("npm run sync:imdb --workspace backend")).toHaveLength(2)
  })

  it("无本地命令的数据源配置不显示本地操作", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settingsResponse))
    const user = userEvent.setup()

    renderSettings()
    await user.click(await screen.findByRole("button", { name: "配置 TMDb" }))

    expect(screen.getByRole("dialog", { name: "配置 TMDb" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "本地操作" })).not.toBeInTheDocument()
  })

  it("展示数据源口径、覆盖范围和访问方式", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settingsResponse))

    renderSettings()

    expect((await screen.findAllByText("平台榜")).length).toBeGreaterThan(0)
    expect(screen.getByText("中国电影、剧集、综艺、动漫和短剧 · 小时级平台热度")).toBeInTheDocument()
    expect(screen.getByText("申请制")).toBeInTheDocument()
    expect(screen.getByText("商业授权")).toBeInTheDocument()
  })

  it("缺少 Trakt 凭据时保留启用开关并禁止同步", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settingsResponse))

    renderSettings()

    expect(await screen.findByText("缺少 TRAKT_CLIENT_ID")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "启用 Trakt" })).toBeChecked()
    expect(screen.getByRole("button", { name: "同步 Trakt" })).toBeDisabled()
  })

  it("TheTVDB 显示已接入但默认关闭且缺少 Key 时不可同步", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settingsResponse))

    renderSettings()

    expect(await screen.findByText("TheTVDB")).toBeInTheDocument()
    expect(screen.getByText("缺少 THETVDB_API_KEY")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "启用 TheTVDB" })).not.toBeChecked()
    expect(screen.getByRole("button", { name: "同步 TheTVDB" })).toBeDisabled()
  })

  it("切换活跃数据源代理模式并测试连接", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "/api/settings" && init?.method === "PUT") {
        return jsonResponse({ success: true, effectiveImmediately: true })
      }
      if (input === "/api/sources/tmdb/test" && init?.method === "POST") {
        return jsonResponse({
          sourceId: "tmdb",
          implementationStatus: "active",
          result: { mode: "source", success: true, durationMs: 150, statusCode: 200, errorType: null, message: "连接成功" }
        })
      }
      return jsonResponse(settingsResponse)
    })
    const user = userEvent.setup()

    renderSettings()
    await user.click(await screen.findByRole("button", { name: "TMDb 直连" }))
    await user.click(screen.getByRole("button", { name: "测试 TMDb" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ values: { SOURCE_TMDB_PROXY_MODE: "direct" }, clearKeys: [] })
      }))
      expect(fetchMock).toHaveBeenCalledWith("/api/sources/tmdb/test", expect.objectContaining({ method: "POST" }))
    })
  })

  it("同一来源测试期间禁止同时同步", async () => {
    let resolveTest: ((response: Response) => void) | undefined
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input === "/api/sources/tmdb/test") {
        return new Promise<Response>((resolve) => {
          resolveTest = resolve
        })
      }
      return jsonResponse(settingsResponse)
    })
    const user = userEvent.setup()

    renderSettings()
    await user.click(await screen.findByRole("button", { name: "测试 TMDb" }))

    await waitFor(() => expect(screen.getByRole("button", { name: "同步 TMDb" })).toBeDisabled())
    resolveTest?.(jsonResponse({
      sourceId: "tmdb",
      implementationStatus: "active",
      result: { mode: "source", success: true, durationMs: 10, statusCode: 200, errorType: null, message: "连接成功" }
    }))
  })

  it("数据源配置对话框绝不回填已保存凭据", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settingsResponse))
    const user = userEvent.setup()

    renderSettings()
    await user.click(await screen.findByRole("button", { name: "配置 TMDb" }))

    expect(screen.getByRole("dialog", { name: "配置 TMDb" })).toBeInTheDocument()
    expect(screen.getByLabelText("TMDb API Key")).toHaveValue("")
    expect(screen.getByText("已配置 ********1234")).toBeInTheDocument()
  })

  it("数据源配置只提交本次新输入", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "/api/settings" && init?.method === "PUT") {
        return jsonResponse({ success: true, effectiveImmediately: true })
      }
      return jsonResponse(settingsResponse)
    })
    const user = userEvent.setup()

    renderSettings()
    await user.click(await screen.findByRole("button", { name: "配置 TMDb" }))
    await user.type(screen.getByLabelText("TMDb API Key"), "new-api-key")
    await user.click(screen.getByRole("button", { name: "保存配置" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ values: { TMDB_API_KEY: "new-api-key" }, clearKeys: [] })
      }))
    })
  })
})
