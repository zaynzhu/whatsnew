type MediaWork = {
  mediaType: string
  releaseForm: string
}

export const MOVIE_RELEASE_FORMS = [
  "theatrical_movie",
  "streaming_movie",
  "animated_film",
  "documentary_film"
] as const

const MOVIE_RELEASE_FORM_SET = new Set<string>(MOVIE_RELEASE_FORMS)

export function mediaWorkKind(media: MediaWork): "movie" | "series" {
  if (MOVIE_RELEASE_FORM_SET.has(media.releaseForm)) return "movie"
  return media.mediaType === "movie" ? "movie" : "series"
}

export function hasSameWorkKind(left: MediaWork, right: MediaWork): boolean {
  return mediaWorkKind(left) === mediaWorkKind(right)
}
