import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { App } from "../src/App"

describe("App", () => {
  it("renders dashboard navigation", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText("WhatsNew")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "新片新剧雷达" })).toBeInTheDocument()
    expect(screen.getByText("热度")).toBeInTheDocument()
  })
})
