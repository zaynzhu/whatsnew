import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { describe, expect, it } from "vitest"
import { StatusBadge } from "../src/components/StatusBadge"

describe("StatusBadge", () => {
  it("shows a clear Chinese label for unknown media status", () => {
    render(<StatusBadge>unknown</StatusBadge>)

    expect(screen.getByText("待确认")).toHaveClass("unknown")
    expect(screen.queryByText("unknown")).not.toBeInTheDocument()
  })
})
