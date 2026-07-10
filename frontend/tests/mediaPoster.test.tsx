import { fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { describe, expect, it } from "vitest"
import { MediaPoster } from "../src/components/MediaPoster"

describe("MediaPoster", () => {
  it("prioritizes the dashboard hero image", () => {
    render(
      <MediaPoster
        mediaId="media-hero"
        posterUrl="https://img.example.test/hero.jpg"
        title="主视觉"
        fallbackLabel="hero"
        priority
        proxyFirst
      />
    )

    const proxyImage = screen.getByAltText("主视觉")
    expect(proxyImage).toHaveAttribute("src", "/api/media/media-hero/poster")
    expect(proxyImage).toHaveAttribute("loading", "eager")
    expect(proxyImage).toHaveAttribute("fetchpriority", "high")

    fireEvent.error(proxyImage)
    expect(screen.getByAltText("主视觉")).toHaveAttribute("src", "https://img.example.test/hero.jpg")
  })

  it("falls back from remote poster URL to backend poster proxy", () => {
    render(
      <div className="poster">
        <MediaPoster
          mediaId="media-1"
          posterUrl="https://img.example.test/poster.jpg"
          title="样片"
          fallbackLabel="movie"
        />
      </div>
    )

    const directImage = screen.getByAltText("样片")
    expect(directImage).toHaveAttribute("src", "https://img.example.test/poster.jpg")

    fireEvent.error(directImage)

    const proxyImage = screen.getByAltText("样片")
    expect(proxyImage).toHaveAttribute("src", "/api/media/media-1/poster")

    fireEvent.error(proxyImage)

    expect(screen.getByText("movie")).toBeInTheDocument()
  })
})
