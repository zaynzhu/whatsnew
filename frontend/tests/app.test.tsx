import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../src/App"

function renderApp(route = "/") {
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

describe("App", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders dashboard navigation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ today: [], week: [], trending: [], events: [], sources: [] })
    } as Response)

    renderApp()

    expect(screen.getByText("WhatsNew")).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "新片新剧雷达" })).toBeInTheDocument()
    expect(screen.getByText("热度")).toBeInTheDocument()
  })

  it("focuses and submits the global search", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], nextCursor: null })
    } as Response)

    renderApp()

    const search = screen.getByRole("searchbox", { name: "全局搜索" })
    fireEvent.keyDown(window, { key: "k", metaKey: true })
    expect(search).toHaveFocus()
    fireEvent.change(search, { target: { value: "House of the Dragon" } })
    fireEvent.submit(search.closest("form") as HTMLFormElement)

    expect(await screen.findByText("“House of the Dragon”的匹配结果")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/media?q=House%20of%20the%20Dragon")
  })

  it("shows a persistent badge in the China source sandbox", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = input instanceof Request ? input.url : String(input)
      const body = path === "/api/health"
        ? { environment: "china_sandbox" }
        : { today: [], week: [], trending: [], events: [], sources: [] }
      return { ok: true, json: async () => body } as Response
    })

    renderApp()

    expect(await screen.findByText("国内源沙盒")).toBeInTheDocument()
  })
})
