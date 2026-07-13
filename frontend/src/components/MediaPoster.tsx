import { useEffect, useState } from "react"

type PosterMode = "direct" | "proxy" | "failed"

type MediaPosterProps = {
  mediaId: string
  posterUrl: string | null
  title: string
  fallbackLabel: string
  priority?: boolean
  proxyFirst?: boolean
  sizes?: string
}

export function MediaPoster({
  mediaId,
  posterUrl,
  title,
  fallbackLabel,
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

  if (!posterUrl || mode === "failed") return <span>{fallbackLabel}</span>

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
