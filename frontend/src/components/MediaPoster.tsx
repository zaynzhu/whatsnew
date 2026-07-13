import type { MediaStatus } from "@whatsnew/shared/media"
import { useEffect, useState } from "react"

type PosterMode = "direct" | "proxy" | "failed"

type MediaPosterProps = {
  mediaId: string
  posterUrl: string | null
  title: string
  fallbackLabel: string
  status?: MediaStatus
  priority?: boolean
  proxyFirst?: boolean
  sizes?: string
}

export function MediaPoster({
  mediaId,
  posterUrl,
  title,
  fallbackLabel,
  status,
  priority = false,
  proxyFirst = true,
  sizes = "(max-width: 760px) 50vw, 20vw"
}: MediaPosterProps) {
  const primaryMode: PosterMode = proxyFirst ? "proxy" : "direct"
  const secondaryMode: PosterMode = proxyFirst ? "direct" : "proxy"
  const [mode, setMode] = useState<PosterMode>(posterUrl ? primaryMode : "failed")

  useEffect(() => {
    setMode(posterUrl ? primaryMode : "failed")
  }, [mediaId, posterUrl, primaryMode])

  if (!posterUrl || mode === "failed") {
    const fallbackHint = mode === "failed" && posterUrl
      ? "图片暂不可用"
      : status === "upcoming"
        ? "海报待发布"
        : "暂无海报"
    return (
      <span
        aria-label={`${fallbackHint}：${title}`}
        className="mediaPosterFallback"
        role="img"
      >
        <small>{fallbackHint}</small>
        <strong>{fallbackLabel}</strong>
      </span>
    )
  }

  const proxyBaseUrl = `/api/media/${mediaId}/poster`
  const src = mode === "proxy" ? `${proxyBaseUrl}?width=640` : posterUrl
  const responsiveSources = mode === "proxy"
    ? [320, 640, 960].map((width) => `${proxyBaseUrl}?width=${width} ${width}w`).join(", ")
    : undefined

  return (
    <img
      src={src}
      srcSet={responsiveSources}
      sizes={responsiveSources ? sizes : undefined}
      alt={title}
      loading={priority ? "eager" : "lazy"}
      {...(priority ? { fetchpriority: "high" } : {})}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        setMode((current) => current === primaryMode ? secondaryMode : "failed")
      }}
    />
  )
}
