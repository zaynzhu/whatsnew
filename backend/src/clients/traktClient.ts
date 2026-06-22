import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type TraktClientOptions = {
  clientId?: string
  baseUrl?: string
  minIntervalMs?: number
  timeoutMs?: number
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

export type TraktClient = {
  get<T>(path: string): Promise<T>
}

export function createTraktClient(options: TraktClientOptions = {}): TraktClient {
  const settings = options.settings ?? runtimeSettings
  const httpClient = options.httpClient ?? sourceHttpClient
  const limiter = new RateLimiter(options.minIntervalMs ?? 2000)

  return {
    async get<T>(path: string): Promise<T> {
      const current = settings.view()
      const clientId = options.clientId ?? current.get("TRAKT_CLIENT_ID")
      if (!clientId) throw new Error("Trakt 凭据未配置")

      const configuredBaseUrl = options.baseUrl ?? current.get("TRAKT_BASE_URL")
      const baseUrl = (configuredBaseUrl || "https://api.trakt.tv").replace(/\/$/, "")
      const settingsOverride = captureSourceProxySettings(current, "trakt")

      return limiter.run(() => httpClient.fetchJson<T>("trakt", `${baseUrl}${path}`, {
        headers: {
          "User-Agent": "WhatsNew/0.1",
          "trakt-api-key": clientId,
          "trakt-api-version": "2"
        },
        timeoutMs: options.timeoutMs ?? 30000,
        settingsOverride
      }))
    }
  }
}
