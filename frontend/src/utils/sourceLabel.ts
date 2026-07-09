const SOURCE_LABELS: Record<string, string> = {
  iqiyi: "iQIYI",
  thetvdb: "TheTVDB",
  tmdb: "TMDb",
  tvmaze: "TVmaze",
  youku: "Youku",
  douban: "豆瓣",
  douban_top: "豆瓣 TOP250",
  douban_upcoming: "豆瓣即将播出",
  trakt: "Trakt",
  trakt_trending: "Trakt 趋势榜",
  trakt_anticipated: "Trakt 期待榜"
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source
}
