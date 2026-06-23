import type { ConnectionTestResult } from "@whatsnew/shared/settings"
import { captureSourceProxySettings, resolveProxy } from "../settings/proxyResolver.js"
import type { SourceDefinition } from "../settings/sourceCatalog.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import {
  KNOWN_SETTING_KEYS,
  isSensitiveKey,
  sourceEnvKey
} from "../settings/settingsFields.js"
import {
  SourceHttpClient,
  SourceHttpError,
  sourceHttpClient,
  type SourceRequestOptions
} from "../utils/sourceHttpClient.js"
import { RateLimiter } from "../utils/rateLimiter.js"

type ConnectionMode = ConnectionTestResult["mode"]

function errorCode(error: unknown): string | null {
  let current = error
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    if ("code" in current && typeof current.code === "string") return current.code
    current = "cause" in current ? current.cause : undefined
  }
  return null
}

function redactMessage(message: string, sensitiveValues: string[]): string {
  const values = [...new Set(sensitiveValues.filter(Boolean))].sort((left, right) => right.length - left.length)
  const redacted = values.reduce((current, value) => {
    return current
      .replaceAll(value, "[REDACTED]")
      .replaceAll(encodeURIComponent(value), "[REDACTED]")
  }, message)

  return redacted
    .replace(/([?&](?:api_key|key|token|access_token)=)[^&\s)]+/gi, "$1[REDACTED]")
    .replace(/:\/\/[^/@\s]+@/g, "://[REDACTED]@")
    .slice(0, 500)
}

function failureResult(
  mode: ConnectionMode,
  startedAt: number,
  errorType: string,
  message: string,
  statusCode: number | null = null
): ConnectionTestResult {
  return {
    mode,
    success: false,
    durationMs: Date.now() - startedAt,
    statusCode,
    errorType,
    message: message.slice(0, 500)
  }
}

export class ConnectionTestService {
  private readonly limiters = new Map<string, RateLimiter>()

  constructor(
    private readonly settings: RuntimeSettingsService = runtimeSettings,
    private readonly httpClient: SourceHttpClient = sourceHttpClient,
    private readonly minIntervalMs = 2000
  ) {}

  async testSource(source: SourceDefinition): Promise<ConnectionTestResult> {
    const startedAt = Date.now()
    const currentSettings = this.settings.view()
    const missingCredentials = source.credentialKeys.filter((key) => !currentSettings.get(key))
    if (missingCredentials.length > 0) {
      const commercial = source.implementationStatus === "commercial"
      return failureResult(
        "source",
        startedAt,
        commercial ? "commercial_access_required" : "credential_missing",
        commercial ? "需要商业授权凭据" : `缺少凭据：${missingCredentials.join("、")}`
      )
    }

    const request = this.sourceRequest(source, currentSettings)
    return this.execute("source", source.id, request.url, request.options, currentSettings)
  }

  async testProxy(
    mode: "direct" | "http_proxy" | "https_proxy",
    targetUrl: string,
    overrides: Record<string, string>
  ): Promise<ConnectionTestResult> {
    const startedAt = Date.now()
    const currentSettings = this.settings.view(overrides)
    const proxyMode = mode === "direct" ? "direct" : "inherit"
    const settingsOverride = {
      ...captureSourceProxySettings(currentSettings, "tvmaze"),
      ...overrides,
      [sourceEnvKey("tvmaze", "PROXY_MODE")]: proxyMode
    }
    const protocolKey = mode === "http_proxy" ? "HTTP_PROXY" : "HTTPS_PROXY"
    if (mode !== "direct" && !settingsOverride[protocolKey]) {
      return failureResult(mode, startedAt, "proxy_not_configured", `${protocolKey} 未配置`)
    }

    return this.execute(
      mode,
      "tvmaze",
      targetUrl,
      { timeoutMs: 10000, settingsOverride },
      this.settings.view(settingsOverride)
    )
  }

  private sourceRequest(source: SourceDefinition, settings: ReturnType<RuntimeSettingsService["view"]>) {
    const url = new URL(source.testUrl)
    const headers: Record<string, string> = {}
    const options: SourceRequestOptions = {
      timeoutMs: 10000,
      settingsOverride: captureSourceProxySettings(settings, source.id)
    }

    if (source.id === "tmdb") {
      const credential = settings.get("TMDB_API_KEY")
      if (credential.startsWith("eyJ") || credential.split(".").length === 3) {
        headers.Authorization = `Bearer ${credential}`
      } else {
        url.searchParams.set("api_key", credential)
      }
    }

    if (source.id === "trakt") {
      headers["User-Agent"] = "WhatsNew/0.1"
      headers["trakt-api-key"] = settings.get("TRAKT_CLIENT_ID")
      headers["trakt-api-version"] = "2"
    }

    if (source.id === "thetvdb") {
      const pin = settings.get("THETVDB_PIN")
      headers["content-type"] = "application/json"
      options.method = "POST"
      options.body = JSON.stringify(pin
        ? { apikey: settings.get("THETVDB_API_KEY"), pin }
        : { apikey: settings.get("THETVDB_API_KEY") })
      options.sensitiveValues = [settings.get("THETVDB_API_KEY"), pin]
    }

    if (Object.keys(headers).length > 0) options.headers = headers
    return { url: url.toString(), options }
  }

  private async execute(
    mode: ConnectionMode,
    sourceId: string,
    url: string,
    options: SourceRequestOptions,
    settings: ReturnType<RuntimeSettingsService["view"]>
  ): Promise<ConnectionTestResult> {
    const startedAt = Date.now()
    const selectedProxy = resolveProxy(settings, sourceId, url)
    const sensitiveValues = [...KNOWN_SETTING_KEYS]
      .filter((key) => isSensitiveKey(key))
      .map((key) => settings.get(key))
      .filter(Boolean)

    try {
      const response = await this.limiterFor(url).run(() => this.httpClient.request(sourceId, url, options))
      await response.body?.cancel().catch(() => undefined)
      return {
        mode,
        success: true,
        durationMs: Date.now() - startedAt,
        statusCode: response.status,
        errorType: null,
        message: "连接成功"
      }
    } catch (error) {
      const code = errorCode(error)
      const statusCode = error instanceof SourceHttpError ? error.statusCode : null
      const body = error instanceof SourceHttpError ? error.bodySnippet : ""
      const server = error instanceof SourceHttpError ? error.serverHeader ?? "" : ""
      const technicalMessage = redactMessage(error instanceof Error ? error.message : String(error), sensitiveValues)

      if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
        return failureResult(mode, startedAt, "timeout", `请求超时：${technicalMessage}`, statusCode)
      }
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
        return failureResult(mode, startedAt, "dns_error", `域名解析失败：${technicalMessage}`, statusCode)
      }
      if (selectedProxy && code === "ECONNREFUSED") {
        return failureResult(mode, startedAt, "proxy_unreachable", `代理无法连接：${technicalMessage}`, statusCode)
      }
      if (statusCode === 401) {
        return failureResult(mode, startedAt, "unauthorized", `授权失败：${technicalMessage}`, statusCode)
      }
      if (statusCode === 403) {
        const cloudflare = `${body} ${server}`.toLowerCase().includes("cloudflare")
        return failureResult(
          mode,
          startedAt,
          cloudflare ? "cloudflare_blocked" : "forbidden",
          `${cloudflare ? "Cloudflare 拦截" : "访问被拒绝"}：${technicalMessage}`,
          statusCode
        )
      }
      if (statusCode !== null) {
        return failureResult(mode, startedAt, "http_error", `HTTP 请求失败：${technicalMessage}`, statusCode)
      }
      return failureResult(mode, startedAt, "unknown", `连接失败：${technicalMessage}`)
    }
  }

  private limiterFor(url: string): RateLimiter {
    const service = new URL(url).host
    const existing = this.limiters.get(service)
    if (existing) return existing

    const limiter = new RateLimiter(this.minIntervalMs)
    this.limiters.set(service, limiter)
    return limiter
  }
}

export const connectionTestService = new ConnectionTestService()
