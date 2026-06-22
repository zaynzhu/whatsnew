const SOURCE_LABELS: Record<string, string> = {
  iqiyi: "iQIYI",
  thetvdb: "TheTVDB",
  tmdb: "TMDb",
  tvmaze: "TVmaze",
  youku: "Youku",
  trakt: "Trakt",
  trakt_trending: "Trakt 趋势榜",
  trakt_anticipated: "Trakt 期待榜"
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source
}
