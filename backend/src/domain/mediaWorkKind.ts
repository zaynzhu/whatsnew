type MediaWork = {
  mediaType: string
  releaseForm: string
}

const MOVIE_RELEASE_FORMS = new Set([
  "theatrical_movie",
  "streaming_movie",
  "animated_film",
  "documentary_film"
])

export function mediaWorkKind(media: MediaWork): "movie" | "series" {
  if (MOVIE_RELEASE_FORMS.has(media.releaseForm)) return "movie"
  return media.mediaType === "movie" ? "movie" : "series"
}

export function hasSameWorkKind(left: MediaWork, right: MediaWork): boolean {
  return mediaWorkKind(left) === mediaWorkKind(right)
}
