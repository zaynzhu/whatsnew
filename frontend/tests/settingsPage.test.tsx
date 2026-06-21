import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../src/App"
import type { SettingsFieldView, SettingsResponse, SourceSettingsView } from "../src/api/types"

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
    latestRun: null
  }
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
  sourceFixture("trakt", "Trakt", { group: "global_metadata", implementationStatus: "blocked" }),
  sourceFixture("imdb", "IMDb", { group: "global_metadata" }),
  sourceFixture("thetvdb", "TheTVDB", { group: "global_metadata" }),
  sourceFixture("justwatch", "JustWatch", { group: "cross_platform", implementationStatus: "commercial" }),
  sourceFixture("flixpatrol", "FlixPatrol", { group: "cross_platform", implementationStatus: "commercial" }),
  sourceFixture("netflix", "Netflix", { group: "international_platform" }),
  sourceFixture("prime_video", "Prime Video", { group: "international_platform" }),
  sourceFixture("hulu", "Hulu", { group: "international_platform" }),
  sourceFixture("disney_plus", "Disney+", { group: "international_platform" }),
  sourceFixture("max", "Max", { group: "international_platform" }),
  sourceFixture("apple_tv_plus", "Apple TV+", { group: "international_platform" }),
  sourceFixture("youku", "优酷", { group: "china_platform", implementationStatus: "active", enabled: true, supportsSync: true, supportsEnable: true }),
  sourceFixture("iqiyi", "爱奇艺", { group: "china_platform", implementationStatus: "active", enabled: true, supportsSync: true, supportsEnable: true }),
  sourceFixture("tencent", "腾讯视频", { group: "china_platform" }),
  sourceFixture("mango_tv", "芒果TV", { group: "china_platform" }),
  sourceFixture("bilibili", "哔哩哔哩", { group: "china_platform" }),
  sourceFixture("douban", "豆瓣", { group: "china_platform" }),
  sourceFixture("mtime", "时光网", { group: "china_platform" })
]

const settingsResponse: SettingsResponse = {
  proxyFields,
  sources: sourceFixtures
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
