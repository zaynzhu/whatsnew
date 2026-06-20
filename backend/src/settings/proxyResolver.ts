import type { SettingsReader } from "./runtimeSettingsService.js"
import { sourceEnvKey } from "./settingsFields.js"

export function resolveProxy(settings: SettingsReader, sourceId: string, targetUrl: string): string | null {
  const mode = settings.sourceProxyMode(sourceId)
  if (mode === "direct") return null

  const protocolKey: "HTTP_PROXY" | "HTTPS_PROXY" = new URL(targetUrl).protocol === "http:"
    ? "HTTP_PROXY"
    : "HTTPS_PROXY"
  if (mode === "custom") {
    return settings.get(sourceEnvKey(sourceId, protocolKey)) || null
  }

  return settings.get(protocolKey) || null
}

export function captureSourceProxySettings(settings: SettingsReader, sourceId: string): Record<string, string> {
  return {
    HTTP_PROXY: settings.get("HTTP_PROXY"),
    HTTPS_PROXY: settings.get("HTTPS_PROXY"),
    [sourceEnvKey(sourceId, "PROXY_MODE")]: settings.sourceProxyMode(sourceId),
    [sourceEnvKey(sourceId, "HTTP_PROXY")]: settings.get(sourceEnvKey(sourceId, "HTTP_PROXY")),
    [sourceEnvKey(sourceId, "HTTPS_PROXY")]: settings.get(sourceEnvKey(sourceId, "HTTPS_PROXY"))
  }
}
