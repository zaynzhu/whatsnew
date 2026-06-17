import { render, screen } from "@testing-library/react"
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
})
