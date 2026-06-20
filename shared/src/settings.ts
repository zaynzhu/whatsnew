export const SOURCE_IDS = [
  "tvmaze", "tmdb", "trakt", "imdb", "thetvdb", "justwatch", "flixpatrol",
  "netflix", "prime_video", "hulu", "disney_plus", "max", "apple_tv_plus",
  "youku", "iqiyi", "tencent", "mango_tv", "bilibili", "douban", "mtime"
] as const
export type SourceId = (typeof SOURCE_IDS)[number]

export const PROXY_MODES = ["inherit", "direct", "custom"] as const
export type ProxyMode = (typeof PROXY_MODES)[number]

export const SOURCE_IMPLEMENTATION_STATUSES = ["active", "blocked", "planned", "commercial"] as const
export type SourceImplementationStatus = (typeof SOURCE_IMPLEMENTATION_STATUSES)[number]

export const SOURCE_GROUPS = ["global_metadata", "cross_platform", "international_platform", "china_platform"] as const
export type SourceGroup = (typeof SOURCE_GROUPS)[number]

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

export type SourceSettingsView = {
  id: string
  name: string
  description: string
  group: SourceGroup
  implementationStatus: SourceImplementationStatus
  enabled: boolean
  proxyMode: ProxyMode
  credentialsComplete: boolean
  supportsSync: boolean
  supportsEnable: boolean
  fields: SettingsFieldView[]
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
  sources: SourceSettingsView[]
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
