const SOURCE_LABELS: Record<string, string> = {
  iqiyi: "iQIYI",
  tmdb: "TMDb",
  tvmaze: "TVmaze",
  youku: "Youku",
  trakt: "Trakt"
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source
}
