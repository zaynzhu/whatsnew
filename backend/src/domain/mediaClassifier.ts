import type { MediaType, ReleaseForm } from "@whatsnew/shared/media"
import type { SourceClassificationInput } from "./types.js"

export function classifyMedia(input: SourceClassificationInput): { mediaType: MediaType; releaseForm: ReleaseForm } {
  const rawType = (input.sourceContentType ?? "").toLowerCase()
  const genreText = input.genres.join(" ").toLowerCase()
  const combined = `${rawType} ${genreText}`

  if (combined.includes("短剧") || combined.includes("micro")) {
    return { mediaType: "short_drama", releaseForm: "micro_drama" }
  }

  if (combined.includes("documentary") || combined.includes("纪录")) {
    if (rawType === "movie" || combined.includes("film")) {
      return { mediaType: "documentary", releaseForm: "documentary_film" }
    }

    return { mediaType: "documentary", releaseForm: "documentary_series" }
  }

  if (
    combined.includes("anime") ||
    combined.includes("animation") ||
    combined.includes("动画") ||
    combined.includes("番剧") ||
    combined.includes("国创")
  ) {
    return { mediaType: "anime", releaseForm: "animated_series" }
  }

  if (combined.includes("variety") || combined.includes("reality") || combined.includes("综艺")) {
    return { mediaType: "variety", releaseForm: "variety_season" }
  }

  if (rawType === "movie" || combined.includes("电影")) {
    return { mediaType: "movie", releaseForm: "streaming_movie" }
  }

  if (input.source === "tvmaze" && combined.includes("web")) {
    return { mediaType: "series", releaseForm: "web_series" }
  }

  return { mediaType: "series", releaseForm: "tv_series" }
}
