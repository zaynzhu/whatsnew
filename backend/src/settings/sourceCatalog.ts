import type {
  ProxyMode,
  SourceGroup,
  SourceId,
  SourceImplementationStatus,
  SourceManualCommandView,
  SourceSemanticsView
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
  optionalCredentialKeys: readonly string[]
  localSettingKeys: readonly string[]
  manualCommands: readonly SourceManualCommandView[]
  defaultEnabled: boolean
  scheduleGroups: readonly ScheduleGroup[]
  semantics: SourceSemanticsView
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
  defaultEnabled = false,
  optionalCredentialKeys: string[] = [],
  localSettingKeys: string[] = [],
  manualCommands: SourceManualCommandView[] = []
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
    optionalCredentialKeys,
    localSettingKeys,
    manualCommands,
    defaultEnabled,
    scheduleGroups,
    semantics: SOURCE_SEMANTICS[id]
  }
}

const SOURCE_SEMANTICS: Record<SourceId, SourceSemanticsView> = {
  tvmaze: {
    signalKinds: ["release_calendar", "metadata"],
    coverage: "全球剧集与单集播出排期",
    cadence: "小时级剧集排期",
    access: "public_api",
    freshnessNote: "适合补充剧集播出日历，不提供电影",
    riskNote: "公开 API 可用性变动会影响排期采集"
  },
  tmdb: {
    signalKinds: ["metadata", "community_trend", "release_calendar"],
    coverage: "全球电影与剧集",
    cadence: "小时级趋势与日级发现",
    access: "free_key",
    freshnessNote: "趋势和排期不代表流媒体已上架",
    riskNote: "需要 TMDb API Key；地区上映口径需要单独解释"
  },
  trakt: {
    signalKinds: ["community_trend", "release_calendar", "metadata"],
    coverage: "全球电影与剧集，社区观看和期待信号",
    cadence: "小时级热度，日级 14 天日历",
    access: "free_key",
    freshnessNote: "热度来自 Trakt 当前榜单，日历不代表流媒体可看",
    riskNote: "需要 Trakt Client ID；网络路径可能需要代理"
  },
  imdb: {
    signalKinds: ["metadata", "rating"],
    coverage: "全球电影、剧集、单集和 IMDb ID",
    cadence: "日级或手动数据集导入",
    access: "public_api",
    freshnessNote: "优先使用 IMDb 非商业 datasets，不接商业 API 作为默认方案",
    riskNote: "数据集体积较大，导入前需要设计下载、解压和增量策略"
  },
  thetvdb: {
    signalKinds: ["metadata", "release_calendar"],
    coverage: "全球电影与剧集元数据、外部 ID 和播出日期",
    cadence: "日级 48 小时更新窗口",
    access: "free_key",
    freshnessNote: "只补元数据和日期，不生成热度",
    riskNote: "只允许免费 project API Key，不回退到付费能力"
  },
  justwatch: {
    signalKinds: ["availability", "platform_rank"],
    coverage: "多地区流媒体可看性与 Streaming Charts",
    cadence: "官方口径包含日级、周级、月级榜单",
    access: "application",
    freshnessNote: "需要申请或合作后才能确认可同步字段",
    riskNote: "当前不能作为免费直接同步来源启用"
  },
  flixpatrol: {
    signalKinds: ["platform_rank", "availability"],
    coverage: "全球多平台和地区 VOD 榜单",
    cadence: "商业数据产品",
    access: "commercial",
    freshnessNote: "需要商业授权后才能同步",
    riskNote: "当前不能作为免费来源启用"
  },
  netflix: {
    signalKinds: ["platform_rank"],
    coverage: "Netflix 全球周榜，按英语和非英语电影剧集拆分",
    cadence: "周榜每日检查，最新一周幂等更新",
    access: "public_page",
    freshnessNote: "只代表 Netflix 官方 Top 10 周榜",
    riskNote: "XLSX 文件结构变化会影响解析"
  },
  prime_video: {
    signalKinds: ["platform_catalog", "release_calendar"],
    coverage: "Prime Video 美国区官方月度电影与剧集上新",
    cadence: "日级检查 About Amazon 月度上新文章",
    access: "public_page",
    freshnessNote: "只代表官方文章列出的美国区 Prime Video 上新，不代表全球可看性或热度",
    riskNote: "文章标题、内容区块或完整片单结构变化时必须停止入库并保留上次成功快照"
  },
  hulu: {
    signalKinds: ["platform_catalog", "release_calendar"],
    coverage: "Hulu 美国官方上新与排期",
    cadence: "日级检查官方 Press Schedule",
    access: "public_page",
    freshnessNote: "只代表 Hulu 官方 schedule 页面，不代表全网热度",
    riskNote: "Hulu hub 页面可能地区跳转，首版只使用 Press Schedule"
  },
  disney_plus: {
    signalKinds: ["platform_catalog", "release_calendar"],
    coverage: "Disney+ 官方月度上新文章",
    cadence: "日级检查当前 New to Disney+ 页面",
    access: "public_page",
    freshnessNote: "只代表 Disney+ 官方文章中的上线信息",
    riskNote: "文章结构和地区语言可能变化，解析失败不得伪装成功"
  },
  max: {
    signalKinds: ["platform_catalog", "release_calendar"],
    coverage: "Max / HBO Max 官方 Pressroom 月度上新（当前受限）",
    cadence: "WBD Pressroom 恢复公开访问后再启用日级检查",
    access: "restricted_page",
    freshnessNote: "WBD Pressroom 当前要求登录或返回 403，暂不产生新的 Max 数据",
    riskNote: "保留解析器和 SOURCE_MAX_BASE_URL 覆盖能力，确认公开访问恢复后再重新启用"
  },
  apple_tv_plus: {
    signalKinds: ["news_signal"],
    coverage: "Apple TV+ Press 官方 RSS 上新资讯",
    cadence: "日级检查官方 news-feed.xml",
    access: "public_page",
    freshnessNote: "只代表 Apple TV Press 发布的上新资讯，<updated> 是发布日期非精确上线日",
    riskNote: "tv.apple.com collection 本地 404，不硬接平台片库；RSS 仅近 10 条无分页"
  },
  youku: {
    signalKinds: ["release_calendar", "platform_rank"],
    coverage: "优酷电影与剧集独立待播片单及预约人数",
    cadence: "小时级分页检查待播节点",
    access: "public_page",
    freshnessNote: "只代表优酷待播片单；敬请期待表示日期未公布，不代表已经上线",
    riskNote: "使用优酷 MTop 内部结构化接口而非开放 API；令牌、签名或节点结构变化时必须停止入库"
  },
  iqiyi: {
    signalKinds: ["release_calendar", "platform_rank"],
    coverage: "爱奇艺新片速递页中的电影、剧集、综艺、动漫、纪录片和短剧待播预约",
    cadence: "小时级检查独立待播页",
    access: "public_page",
    freshnessNote: "只代表爱奇艺新片速递页；未公布日期的预约条目仍为待播，不代表已经上线",
    riskNote: "依赖页面内嵌 Nuxt 数据而非开放 API；结构变化时必须停止入库并保留上次成功快照"
  },
  tencent: {
    signalKinds: ["release_calendar", "platform_rank"],
    coverage: "腾讯视频电影与剧集频道中的即将上线片单及预约下限",
    cadence: "小时级分页检查即将上线筛选",
    access: "public_page",
    freshnessNote: "只代表腾讯视频频道的即将上线筛选；publish_date 是作品首发日期，不作为腾讯上线日期",
    riskNote: "使用腾讯视频网页内部结构化接口；频道 ID、筛选值或分页结构变化时必须停止入库"
  },
  mango_tv: {
    signalKinds: ["release_calendar", "platform_rank"],
    coverage: "芒果TV App 电影预约与待播节点（待接入）",
    cadence: "找到可验证的 App 结构化接口后恢复",
    access: "public_page",
    freshnessNote: "电视剧网页的新剧速递混有杀青、花絮和历史作品，不作为排期来源",
    riskNote: "公开网页没有可靠上线日期；生产调度和设置启用暂时关闭"
  },
  bilibili: {
    signalKinds: ["platform_rank"],
    coverage: "哔哩哔哩番剧、国创与纪录片 pgc 排行榜（近 3 日综合得分）",
    cadence: "日级榜单检查",
    access: "public_api",
    freshnessNote: "只代表 B站站内播放与追番口径，不代表全网",
    riskNote: "pgc 排行端点可能随时加签名或下线，失败需可见不伪装"
  },
  douban: {
    signalKinds: ["rating", "release_calendar"],
    coverage: "豆瓣 TOP250 口碑评分、移动端电影即将上映与剧集即将播出",
    cadence: "日级低频同步 TOP250 前 20 条、电影与剧集移动端待映待播分页",
    access: "public_page",
    freshnessNote: "只代表豆瓣站内口碑和期待排期，不代表平台实际可看性",
    riskNote: "不得高频爬取、不得绕过登录或验证码；移动端 coming_soon 接口变化时需降级保留旧数据"
  },
  maoyan_pro: {
    signalKinds: ["box_office", "platform_rank"],
    coverage: "中国电影票房、排片、网播热度和市场指标",
    cadence: "公开页面实时变化，完整能力受专业版限制",
    access: "restricted_page",
    freshnessNote: "只作为市场信号候选，不代表已接入同步",
    riskNote: "不得绕过 App、登录、验证码或专业版限制"
  },
  dengta_pro: {
    signalKinds: ["box_office", "platform_rank"],
    coverage: "中国电影票房、剧综网播、动漫热度和收视指标",
    cadence: "公开说明显示专业数据实时更新，完整能力受专业版限制",
    access: "restricted_page",
    freshnessNote: "只作为市场信号候选，不代表已接入同步",
    riskNote: "不得绕过 App、登录、验证码或专业版限制"
  },
  mtime: {
    signalKinds: ["news_signal", "metadata"],
    coverage: "中文影视资讯和资料补充",
    cadence: "待核对公开页面",
    access: "public_page",
    freshnessNote: "不作为核心热度源",
    riskNote: "已核对：资讯列表页文章链接结构需二次解析，官方 RSS feed 无响应，结构化程度有限，首版未接入"
  }
}

const TMDB_MANUAL_COMMANDS: SourceManualCommandView[] = [
  {
    label: "补全缺失海报",
    command: "npm run enrich:posters --workspace backend -- --limit=120",
    description: "按热度优先使用 TMDb ID 或严格标题匹配补全海报和基础元数据"
  }
]

const IMDB_MANUAL_COMMANDS: SourceManualCommandView[] = [
  {
    label: "下载或刷新 IMDb 缓存",
    command: "npm run download:imdb --workspace backend",
    description: "从 IMDb 官方 datasets 下载 gzip 到已配置缓存目录"
  },
  {
    label: "同步 IMDb 本地缓存",
    command: "npm run sync:imdb --workspace backend",
    description: "只补充当前库已有作品的 IMDb ID 和评分，不创建陌生作品"
  }
]

export const SOURCE_CATALOG = [
  source("tvmaze", "TVmaze", "剧集与集数排期", "global_metadata", "active", "inherit", true, true, "https://api.tvmaze.com/shows/1", [], ["hourly"], true),
  source("tmdb", "TMDb", "电影、剧集、趋势和基础元数据", "global_metadata", "active", "inherit", true, true, "https://api.themoviedb.org/3/configuration", ["TMDB_API_KEY"], ["hourly"], true, [], [], TMDB_MANUAL_COMMANDS),
  source("trakt", "Trakt", "电影与剧集趋势", "global_metadata", "active", "inherit", true, true, "https://api.trakt.tv/shows/trending?limit=1", ["TRAKT_CLIENT_ID"], ["hourly", "daily"], true),
  source("imdb", "IMDb", "日更数据集与榜单", "global_metadata", "planned", "inherit", false, false, "https://datasets.imdbws.com/title.basics.tsv.gz", [], ["daily"], false, [], ["IMDB_DATASET_CACHE_DIR"], IMDB_MANUAL_COMMANDS),
  source("thetvdb", "TheTVDB", "影视元数据与外部 ID", "global_metadata", "active", "inherit", true, true, "https://api4.thetvdb.com/v4/login", ["THETVDB_API_KEY"], ["daily"], false, ["THETVDB_PIN"]),
  source("justwatch", "JustWatch", "可看性与 Streaming Charts", "cross_platform", "commercial", "inherit", false, false, "https://www.justwatch.com/us/streaming-charts"),
  source("flixpatrol", "FlixPatrol", "多平台地区 Top 10", "cross_platform", "commercial", "inherit", false, false, "https://flixpatrol.com/calendar/upcoming/"),
  source("netflix", "Netflix", "官方全球周榜与观看次数", "international_platform", "active", "inherit", true, true, "https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx", [], ["daily"], true),
  source("prime_video", "Prime Video", "美国区官方月度上新", "international_platform", "active", "inherit", true, true, "https://www.aboutamazon.com/news/entertainment", [], ["daily"], false),
  source("hulu", "Hulu", "官方排期与上新", "international_platform", "active", "inherit", true, true, "https://press.hulu.com/schedule/", [], ["daily"], false),
  source("disney_plus", "Disney+", "官方月度上新", "international_platform", "active", "inherit", true, true, "https://www.disneyplus.com/explore/articles/new-to-disney-plus", [], ["daily"], false),
  source("max", "Max", "官方月度上新（当前受限）", "international_platform", "blocked", "inherit", false, false, "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july", [], ["daily"], false),
  source("apple_tv_plus", "Apple TV+", "Apple TV+ Press 上新资讯", "international_platform", "active", "inherit", true, true, "https://www.apple.com/tv-pr/news-feed.xml", [], ["daily"], false),
  source("youku", "优酷", "电影与剧集待播预约", "china_platform", "active", "direct", true, true, "https://acs.youku.com/", [], ["hourly"], false),
  source("iqiyi", "爱奇艺", "新片速递、预约与平台内容", "china_platform", "active", "direct", true, true, "https://www.iqiyi.com/newOnlinePCW", [], ["hourly"], true),
  source("tencent", "腾讯视频", "电影与剧集即将上线预约", "china_platform", "active", "direct", true, true, "https://v.qq.com/channel/tv/list", [], ["hourly"], false),
  source("mango_tv", "芒果TV", "App 预约节点研究中", "china_platform", "blocked", "direct", false, false, "https://www.mgtv.com/tv/", [], ["hourly"], false),
  source("bilibili", "哔哩哔哩", "番剧、国创与纪录片榜单", "china_platform", "active", "direct", true, true, "https://api.bilibili.com/pgc/season/rank/web/list?season_type=1&day=3", [], ["daily"], true),
  source("douban", "豆瓣", "TOP250 口碑与即将播出", "china_platform", "active", "direct", true, true, "https://m.douban.com/rexxar/api/v2/tv/coming_soon", [], ["daily"], false, ["DOUBAN_COOKIE"]),
  source("maoyan_pro", "猫眼专业版", "票房、排片与网播热度", "china_platform", "planned", "direct", false, false, "https://piaofang.maoyan.com/dashboard"),
  source("dengta_pro", "灯塔专业版", "票房、网播热度与收视指标", "china_platform", "planned", "direct", false, false, "https://www.taopiaopiao.com/"),
  source("mtime", "时光网", "中文影视资讯补充", "china_platform", "planned", "direct", false, false, "https://www.mtime.com/")
] as const

export function getSourceDefinition(sourceId: string): SourceDefinition {
  const definition = SOURCE_CATALOG.find((sourceDefinition) => sourceDefinition.id === sourceId)
  if (!definition) throw new Error(`未知数据源: ${sourceId}`)
  return definition
}
