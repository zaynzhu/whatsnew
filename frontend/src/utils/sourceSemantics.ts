import type {
  SourceAccessType,
  SourceGroup,
  SourceSignalKind
} from "@whatsnew/shared/settings"

export const SOURCE_SIGNAL_LABELS: Record<SourceSignalKind, string> = {
  release_calendar: "排期",
  platform_catalog: "片库",
  platform_rank: "平台榜",
  community_trend: "社区热度",
  metadata: "元数据",
  availability: "可看性",
  box_office: "票房",
  rating: "口碑",
  news_signal: "资讯"
}

export const SOURCE_ACCESS_LABELS: Record<SourceAccessType, string> = {
  public_api: "公开 API",
  free_key: "免费 Key",
  application: "申请制",
  commercial: "商业授权",
  public_page: "公开页面",
  restricted_page: "页面受限"
}

export const SOURCE_GROUP_LABELS: Record<SourceGroup, string> = {
  global_metadata: "全球元数据",
  cross_platform: "跨平台热度",
  international_platform: "国际流媒体",
  china_platform: "中国平台"
}
