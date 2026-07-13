export const SOURCE_IDS = [
  "tvmaze", "tmdb", "trakt", "imdb", "thetvdb", "justwatch", "flixpatrol",
  "netflix", "prime_video", "hulu", "disney_plus", "max", "apple_tv_plus",
  "youku", "iqiyi", "tencent", "mango_tv", "bilibili", "douban", "mtime",
  "maoyan_pro", "dengta_pro"
] as const
export type SourceId = (typeof SOURCE_IDS)[number]

export const PROXY_MODES = ["inherit", "direct", "custom"] as const
export type ProxyMode = (typeof PROXY_MODES)[number]

export const SOURCE_IMPLEMENTATION_STATUSES = ["active", "blocked", "planned", "commercial"] as const
export type SourceImplementationStatus = (typeof SOURCE_IMPLEMENTATION_STATUSES)[number]

export const SOURCE_GROUPS = ["global_metadata", "cross_platform", "international_platform", "china_platform"] as const
export type SourceGroup = (typeof SOURCE_GROUPS)[number]

export const SOURCE_SIGNAL_KINDS = [
  "release_calendar", "platform_catalog", "platform_rank", "community_trend",
  "metadata", "availability", "box_office", "rating", "news_signal"
] as const
export type SourceSignalKind = (typeof SOURCE_SIGNAL_KINDS)[number]

export const SOURCE_ACCESS_TYPES = [
  "public_api", "free_key", "application", "commercial", "public_page", "restricted_page"
] as const
export type SourceAccessType = (typeof SOURCE_ACCESS_TYPES)[number]

export type SourceSemanticsView = {
  signalKinds: SourceSignalKind[]
  coverage: string
  cadence: string
  access: SourceAccessType
  freshnessNote: string
  riskNote: string
}

export type SourceLocalFileIssue = "missing_file" | "missing_metadata" | "size_mismatch"

export type SourceLocalFileState = {
  fileName: string
  exists: boolean
  sizeBytes: number | null
  expectedBytes: number | null
  downloadedAt: string | null
  lastModified: string | null
  etag: string | null
  issue: SourceLocalFileIssue | null
}

export type SourceLocalStateView = {
  kind: "imdb_datasets"
  status: "missing_config" | "missing_files" | "partial" | "ready"
  configured: boolean
  readyFiles: number
  totalFiles: number
  files: SourceLocalFileState[]
}

export type SourceManualCommandView = {
  label: string
  command: string
  description: string
}

export type SettingsFieldView = {
  key: string
  label: string
  type: "text" | "password" | "boolean" | "select"
  sensitive: boolean
  configured: boolean
  maskedValue: string | null
  value: string | null
  options?: string[]
}

export const CONTENT_ATTENTION_CATEGORIES = [
  "scripted",
  "animation",
  "documentary",
  "reality_variety",
  "talk_game",
  "news",
  "sports"
] as const
export type ContentAttentionCategory = (typeof CONTENT_ATTENTION_CATEGORIES)[number]

export type ContentWeightView = {
  category: ContentAttentionCategory
  key: string
  label: string
  description: string
  value: number
  defaultValue: number
}

export type SchedulerSettingsView = {
  enabled: boolean
  forcedDisabled: boolean
  hourlyIntervalHours: number
  dailyTime: string
  timezone: "Asia/Shanghai"
  nextHourlyRunAt: string | null
  nextDailyRunAt: string | null
}

export type SourceSettingsView = {
  id: string
  name: string
  description: string
  group: SourceGroup
  implementationStatus: SourceImplementationStatus
  enabled: boolean
  runnable: boolean
  proxyMode: ProxyMode
  credentialsComplete: boolean
  missingCredentials: string[]
  supportsSync: boolean
  supportsEnable: boolean
  fields: SettingsFieldView[]
  semantics: SourceSemanticsView
  localState: SourceLocalStateView | null
  manualCommands: SourceManualCommandView[]
  latestRun: {
    status: string
    startedAt: string
    finishedAt: string | null
    itemCount: number
    durationMs: number | null
    errorMessage: string | null
  } | null
}

export type SettingsResponse = {
  proxyFields: SettingsFieldView[]
  contentWeights: ContentWeightView[]
  scheduler: SchedulerSettingsView
  sources: SourceSettingsView[]
}

export type SourceCatalogItem = SourceSettingsView

export type SourcesResponse = {
  items: SourceCatalogItem[]
}

export type SettingsUpdateRequest = {
  values: Record<string, string>
  clearKeys: string[]
}

export type SettingsUpdateResponse = {
  success: true
  effectiveImmediately: true
}

export type ConnectionTestResult = {
  mode: "direct" | "http_proxy" | "https_proxy" | "source"
  success: boolean
  durationMs: number
  statusCode: number | null
  errorType: string | null
  message: string
}

export const SOURCE_HEALTH_RUN_STATUSES = ["none", "running", "success", "warning", "failed"] as const
export type SourceHealthRunStatus = (typeof SOURCE_HEALTH_RUN_STATUSES)[number]

export const SOURCE_HEALTH_ACCEPTANCE_STATUSES = ["passed", "degraded", "failed", "blocked"] as const
export type SourceHealthAcceptanceStatus = (typeof SOURCE_HEALTH_ACCEPTANCE_STATUSES)[number]

export const SOURCE_HEALTH_FRESHNESS_STATUSES = ["fresh", "stale", "never_succeeded", "manual", "blocked"] as const
export type SourceHealthFreshnessStatus = (typeof SOURCE_HEALTH_FRESHNESS_STATUSES)[number]

export const SOURCE_HEALTH_REASON_CODES = [
  "passed",
  "disabled",
  "missing_credentials",
  "not_implemented",
  "commercial",
  "restricted",
  "never_succeeded",
  "stale_success",
  "latest_failed_no_fresh_success",
  "latest_failed_with_fresh_success",
  "latest_running_no_fresh_success",
  "latest_running_with_fresh_success",
  "latest_warning",
  "empty_result",
  "manual_cache_missing",
  "manual_cache_ready"
] as const
export type SourceHealthReasonCode = (typeof SOURCE_HEALTH_REASON_CODES)[number]

export type SourceHealthScheduleGroup = "hourly" | "daily" | "manual" | "none"

export type SourceHealthLatestRun = {
  status: SourceHealthRunStatus
  startedAt: string
  finishedAt: string | null
  itemCount: number
  durationMs: number | null
  errorMessage: string | null
}

export type SourceHealthSample = {
  title: string
  mediaType: string
  signalKind: SourceSignalKind
  source: string
  platform: string | null
  region: string | null
  sourceUrl: string | null
  capturedAtOrFetchedAt: string
}

export type SourceHealthRow = {
  sourceId: string
  sourceName: string
  scope: string
  scheduleGroup: SourceHealthScheduleGroup
  group: SourceGroup
  implementationStatus: SourceImplementationStatus
  enabled: boolean
  runnable: boolean
  credentialsComplete: boolean
  missingCredentials: string[]
  signalKinds: SourceSignalKind[]
  runStatus: SourceHealthRunStatus
  acceptanceStatus: SourceHealthAcceptanceStatus
  freshnessStatus: SourceHealthFreshnessStatus
  reasonCode: SourceHealthReasonCode
  reason: string
  latestRun: SourceHealthLatestRun | null
  lastSuccessAt: string | null
  staleAfterHours: number | null
  itemCount: number
  samples: SourceHealthSample[]
}

export type SourceHealthSummary = {
  total: number
  passed: number
  degraded: number
  failed: number
  blocked: number
  runnable: number
  stale: number
}

export type SourceHealthResponse = {
  generatedAt: string
  summary: SourceHealthSummary
  items: SourceHealthRow[]
}
