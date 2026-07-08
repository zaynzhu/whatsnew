import { useEffect, useState } from "react"

type PosterMode = "direct" | "proxy" | "failed"

type MediaPosterProps = {
  mediaId: string
  posterUrl: string | null
  title: string
  fallbackLabel: string
}

export function MediaPoster({ mediaId, posterUrl, title, fallbackLabel }: MediaPosterProps) {
  const [mode, setMode] = useState<PosterMode>(posterUrl ? "direct" : "failed")

  useEffect(() => {
    setMode(posterUrl ? "direct" : "failed")
  }, [mediaId, posterUrl])

  if (!posterUrl || mode === "failed") return <span>{fallbackLabel}</span>

  const src = mode === "proxy" ? `/api/media/${mediaId}/poster` : posterUrl

  return (
    <img
      src={src}
      alt={title}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        setMode((current) => current === "direct" ? "proxy" : "failed")
      }}
    />
  )
}
