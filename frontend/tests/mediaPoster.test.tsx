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
    expect(proxyImage).toHaveAttribute("src", "/api/media/media-hero/poster?width=640")
    expect(proxyImage).toHaveAttribute(
      "srcset",
      "/api/media/media-hero/poster?width=320 320w, /api/media/media-hero/poster?width=640 640w, /api/media/media-hero/poster?width=960 960w"
    )
    expect(proxyImage).toHaveAttribute("loading", "eager")
    expect(proxyImage).toHaveAttribute("fetchpriority", "high")

    fireEvent.error(proxyImage)
    expect(screen.getByAltText("主视觉")).toHaveAttribute("src", "https://img.example.test/hero.jpg")
    expect(screen.getByAltText("主视觉")).not.toHaveAttribute("srcset")
  })

  it("uses the backend poster proxy by default and falls back to the remote URL", () => {
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

    const proxyImage = screen.getByAltText("样片")
    expect(proxyImage).toHaveAttribute("src", "/api/media/media-1/poster?width=640")
    expect(proxyImage).toHaveAttribute("sizes", "(max-width: 760px) 50vw, 20vw")

    fireEvent.error(proxyImage)

    const directImage = screen.getByAltText("样片")
    expect(directImage).toHaveAttribute("src", "https://img.example.test/poster.jpg")

    fireEvent.error(directImage)

    expect(screen.getByText("movie")).toBeInTheDocument()
  })

  it("keeps direct-first posters free from proxy variants", () => {
    render(
      <MediaPoster
        mediaId="media-direct"
        posterUrl="https://img.example.test/direct.jpg"
        title="直连海报"
        fallbackLabel="movie"
        proxyFirst={false}
      />
    )

    const directImage = screen.getByAltText("直连海报")
    expect(directImage).toHaveAttribute("src", "https://img.example.test/direct.jpg")
    expect(directImage).not.toHaveAttribute("srcset")

    fireEvent.error(directImage)
    expect(screen.getByAltText("直连海报")).toHaveAttribute(
      "src",
      "/api/media/media-direct/poster?width=640"
    )
  })
})
