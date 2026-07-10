import { useEffect, useState } from "react"

type PosterMode = "direct" | "proxy" | "failed"

type MediaPosterProps = {
  mediaId: string
  posterUrl: string | null
  title: string
  fallbackLabel: string
  priority?: boolean
  proxyFirst?: boolean
}

export function MediaPoster({
  mediaId,
  posterUrl,
  title,
  fallbackLabel,
  priority = false,
  proxyFirst = false
}: MediaPosterProps) {
  const primaryMode: PosterMode = proxyFirst ? "proxy" : "direct"
  const secondaryMode: PosterMode = proxyFirst ? "direct" : "proxy"
  const [mode, setMode] = useState<PosterMode>(posterUrl ? primaryMode : "failed")

  useEffect(() => {
    setMode(posterUrl ? primaryMode : "failed")
  }, [mediaId, posterUrl, primaryMode])

  if (!posterUrl || mode === "failed") return <span>{fallbackLabel}</span>

  const src = mode === "proxy" ? `/api/media/${mediaId}/poster` : posterUrl

  return (
    <img
      src={src}
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
