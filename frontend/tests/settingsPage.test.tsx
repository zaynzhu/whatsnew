import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../src/App"

const settingsResponse = {
  proxyFields: [
    {
      key: "HTTP_PROXY",
      label: "HTTP 代理",
      type: "password",
      sensitive: true,
      configured: false,
      maskedValue: null,
      value: null
    },
    {
      key: "HTTPS_PROXY",
      label: "HTTPS 代理",
      type: "password",
      sensitive: true,
      configured: true,
      maskedValue: "********7890",
      value: null
    }
  ],
  sources: []
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
})
