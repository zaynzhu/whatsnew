import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@testing-library/jest-dom/vitest"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../src/App"

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/sources/runs"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("SourceRunsPage", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("shows persistent failure details and retries only that source", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = input instanceof Request ? input.url : String(input)
      if (path === "/api/health") {
        return { ok: true, json: async () => ({ environment: "main" }) } as Response
      }
      if (path.startsWith("/api/source-runs")) {
        return {
          ok: true,
          json: async () => ({
            generatedAt: "2026-07-16T08:40:00.000Z",
            sources: [{ id: "tmdb", name: "TMDb" }],
            items: [{
              id: "run-1",
              sourceId: "tmdb",
              sourceName: "TMDb",
              scope: "all",
              status: "failed",
              startedAt: "2026-07-16T08:34:52.816Z",
              finishedAt: "2026-07-16T08:35:59.791Z",
              durationMs: 66975,
              itemCount: 0,
              errorMessage: "请求超时（30000ms）",
              retryable: true
            }]
          })
        } as Response
      }
      if (path === "/api/sources/tmdb/sync" && init?.method === "POST") {
        return { ok: true, json: async () => ({ items: [] }) } as Response
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response
    })

    renderPage()

    expect(await screen.findByRole("heading", { name: "来源同步日志" })).toBeInTheDocument()
    expect(await screen.findByText("请求超时（30000ms）")).toBeInTheDocument()
    expect(screen.getByText("1 分 7 秒")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "重试来源" }))

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sources/tmdb/sync",
      expect.objectContaining({ method: "POST" })
    )
  })
})
