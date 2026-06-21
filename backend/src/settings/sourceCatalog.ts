import type {
  ProxyMode,
  SourceGroup,
  SourceId,
  SourceImplementationStatus
} from "@whatsnew/shared/settings"

export type ScheduleGroup = "hourly" | "daily"

export type SourceDefinition = {
  id: SourceId
  name: string
  description: string
  group: SourceGroup
  implementationStatus: SourceImplementationStatus
  defaultProxyMode: ProxyMode
  supportsSync: boolean
  supportsEnable: boolean
  testUrl: string
  baseUrlKey: string
  credentialKeys: readonly string[]
  defaultEnabled: boolean
  scheduleGroups: readonly ScheduleGroup[]
}

const BASE_URL_KEY_OVERRIDES: Partial<Record<SourceId, string>> = {
  tvmaze: "TVMAZE_BASE_URL",
  tmdb: "TMDB_BASE_URL",
  trakt: "TRAKT_BASE_URL",
  thetvdb: "THETVDB_BASE_URL",
  douban: "DOUBAN_BASE_URL"
}

function sourceBaseUrlKey(sourceId: SourceId): string {
  return BASE_URL_KEY_OVERRIDES[sourceId] ?? `SOURCE_${sourceId.toUpperCase()}_BASE_URL`
}

function source(
  id: SourceId,
  name: string,
  description: string,
  group: SourceGroup,
  implementationStatus: SourceImplementationStatus,
  defaultProxyMode: ProxyMode,
  supportsSync: boolean,
  supportsEnable: boolean,
  testUrl: string,
  credentialKeys: string[] = [],
  scheduleGroups: readonly ScheduleGroup[] = ["daily"],
  defaultEnabled = false
): SourceDefinition {
  return {
    id,
    name,
    description,
    group,
    implementationStatus,
    defaultProxyMode,
    supportsSync,
    supportsEnable,
    testUrl,
    baseUrlKey: sourceBaseUrlKey(id),
    credentialKeys,
    defaultEnabled,
    scheduleGroups
  }
}

export const SOURCE_CATALOG = [
  source("tvmaze", "TVmaze", "剧集与集数排期", "global_metadata", "active", "inherit", true, true, "https://api.tvmaze.com/shows/1", [], ["hourly"], true),
  source("tmdb", "TMDb", "电影、剧集、趋势和基础元数据", "global_metadata", "active", "inherit", true, true, "https://api.themoviedb.org/3/configuration", ["TMDB_API_KEY"], ["hourly"], true),
  source("trakt", "Trakt", "电影与剧集趋势", "global_metadata", "blocked", "inherit", false, false, "https://api.trakt.tv/shows/trending?limit=1", ["TRAKT_CLIENT_ID"]),
  source("imdb", "IMDb", "日更数据集与榜单", "global_metadata", "planned", "inherit", false, false, "https://datasets.imdbws.com/title.basics.tsv.gz"),
  source("thetvdb", "TheTVDB", "影视元数据与外部 ID", "global_metadata", "planned", "inherit", false, false, "https://api4.thetvdb.com/v4/login", ["THETVDB_API_KEY"]),
  source("justwatch", "JustWatch", "可看性与 Streaming Charts", "cross_platform", "commercial", "inherit", false, false, "https://www.justwatch.com/us/streaming-charts"),
  source("flixpatrol", "FlixPatrol", "多平台地区 Top 10", "cross_platform", "commercial", "inherit", false, false, "https://flixpatrol.com/calendar/upcoming/"),
  source("netflix", "Netflix", "官方全球周榜与观看次数", "international_platform", "active", "inherit", true, true, "https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx", [], ["daily"], true),
  source("prime_video", "Prime Video", "Top 10、趋势与新内容", "international_platform", "planned", "inherit", false, false, "https://www.primevideo.com/collection/IncludedwithPrime"),
  source("hulu", "Hulu", "Top 15 与上新", "international_platform", "planned", "inherit", false, false, "https://www.hulu.com/hub/tv/collections/9979"),
  source("disney_plus", "Disney+", "官方上新日历", "international_platform", "planned", "inherit", false, false, "https://www.disneyplus.com/explore/articles/new-to-disney-plus"),
  source("max", "Max", "Top 10、即将上线与下架", "international_platform", "planned", "inherit", false, false, "https://help.max.com/us/Answer/Detail/000002558"),
  source("apple_tv_plus", "Apple TV+", "新片与热门榜", "international_platform", "planned", "inherit", false, false, "https://tv.apple.com/us/collection/new-releases/uts.col.tv-plus-newest-releases"),
  source("youku", "优酷", "电影、长剧、独播与热度", "china_platform", "active", "direct", true, true, "https://tv.youku.com/", [], ["hourly"], true),
  source("iqiyi", "爱奇艺", "新片速递、预约与平台内容", "china_platform", "active", "direct", true, true, "https://www.iqiyi.com/newOnlinePCW", [], ["hourly"], true),
  source("tencent", "腾讯视频", "影视频道与热榜", "china_platform", "planned", "direct", false, false, "https://v.qq.com/p/tv/"),
  source("mango_tv", "芒果TV", "热播、预约与追更日历", "china_platform", "planned", "direct", false, false, "https://www.mgtv.com/tv/"),
  source("bilibili", "哔哩哔哩", "番剧、国创与榜单", "china_platform", "planned", "direct", false, false, "https://www.bilibili.com/anime/"),
  source("douban", "豆瓣", "中国口碑与评分", "china_platform", "planned", "direct", false, false, "https://movie.douban.com/"),
  source("mtime", "时光网", "中文影视资讯补充", "china_platform", "planned", "direct", false, false, "https://www.mtime.com/")
] as const

export function getSourceDefinition(sourceId: string): SourceDefinition {
  const definition = SOURCE_CATALOG.find((sourceDefinition) => sourceDefinition.id === sourceId)
  if (!definition) throw new Error(`未知数据源: ${sourceId}`)
  return definition
}
