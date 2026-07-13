const SOURCE_LABELS: Record<string, string> = {
  iqiyi: "iQIYI",
  thetvdb: "TheTVDB",
  tmdb: "TMDb",
  tmdb_trending: "TMDb 电影趋势",
  tmdb_tv_trending: "TMDb 剧集趋势",
  tvmaze: "TVmaze",
  youku: "Youku",
  youku_hot: "优酷热度",
  youku_reserve: "优酷预约",
  iqiyi_reserve: "爱奇艺预约",
  tencent: "腾讯视频",
  tencent_reserve: "腾讯视频预约",
  netflix_top10: "Netflix Top 10",
  prime_video: "Prime Video",
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
