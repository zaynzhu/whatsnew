import { SOURCE_CATALOG } from "./sourceCatalog.js"

export type SourceSettingSuffix = "ENABLED" | "PROXY_MODE" | "HTTP_PROXY" | "HTTPS_PROXY"

export const SOURCE_PROXY_MODES = ["inherit", "direct", "custom"] as const

export type SettingFieldDefinition = {
  key: string
  label: string
  type: "text" | "password" | "boolean" | "select"
  sensitive: boolean
  options?: string[]
}

export function sourceEnvKey(sourceId: string, suffix: SourceSettingSuffix): string {
  return `SOURCE_${sourceId.toUpperCase()}_${suffix}`
}

export const GLOBAL_PROXY_FIELDS: SettingFieldDefinition[] = [
  { key: "HTTP_PROXY", label: "HTTP 代理", type: "password", sensitive: true },
  { key: "HTTPS_PROXY", label: "HTTPS 代理", type: "password", sensitive: true }
]

export const GLOBAL_SETTING_KEYS = new Set([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "TVMAZE_BASE_URL",
  "TMDB_API_KEY",
  "TMDB_BASE_URL",
  "TMDB_IMAGE_BASE_URL",
  "TRAKT_CLIENT_ID",
  "TRAKT_CLIENT_SECRET",
  "TRAKT_ACCESS_TOKEN",
  "TRAKT_BASE_URL",
  "OMDB_API_KEY",
  "OMDB_BASE_URL",
  "THETVDB_API_KEY",
  "THETVDB_PIN",
  "THETVDB_BASE_URL",
  "IMDB_DATASET_CACHE_DIR",
  "DOUBAN_COOKIE",
  "DOUBAN_BASE_URL"
])

const SOURCE_SETTING_SUFFIXES: SourceSettingSuffix[] = ["ENABLED", "PROXY_MODE", "HTTP_PROXY", "HTTPS_PROXY"]

export const KNOWN_SETTING_KEYS = new Set([
  ...GLOBAL_SETTING_KEYS,
  ...SOURCE_CATALOG.flatMap((source) => [
    source.baseUrlKey,
    ...source.credentialKeys,
    ...source.optionalCredentialKeys,
    ...SOURCE_SETTING_SUFFIXES.map((suffix) => sourceEnvKey(source.id, suffix))
  ])
])

export function isSensitiveKey(key: string): boolean {
  return key === "DATABASE_URL" || /(?:PROXY|COOKIE|TOKEN|SECRET|PASSWORD|API_KEY|CLIENT_ID|PIN)(?:$|_)/.test(key)
}

export function getSettingFieldDefinition(key: string, label = key): SettingFieldDefinition {
  const proxyField = GLOBAL_PROXY_FIELDS.find((field) => field.key === key)
  if (proxyField) return proxyField

  if (key.endsWith("_ENABLED")) {
    return { key, label, type: "boolean", sensitive: false }
  }

  if (key.endsWith("_PROXY_MODE")) {
    return { key, label, type: "select", sensitive: false, options: [...SOURCE_PROXY_MODES] }
  }

  const sensitive = isSensitiveKey(key)
  return { key, label, type: sensitive ? "password" : "text", sensitive }
}
