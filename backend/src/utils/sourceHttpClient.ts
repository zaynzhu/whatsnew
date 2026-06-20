import {
  ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
  type Response
} from "undici"
import { resolveProxy } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"

const SENSITIVE_QUERY_KEYS = new Set(["api_key", "key", "token", "access_token"])

export type SourceRequestOptions = Omit<RequestInit, "signal"> & {
  timeoutMs: number
  settingsOverride?: Record<string, string>
}

export type SourceTransport = (url: string, options?: UndiciRequestInit) => Promise<Response>

type RedactedUrl = {
  safeUrl: string
  secrets: string[]
}

function redactUrl(rawUrl: string): RedactedUrl {
  const url = new URL(rawUrl)
  const secrets: string[] = []

  for (const [key, value] of [...url.searchParams.entries()]) {
    if (!SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) continue
    if (value) secrets.push(value)
    url.searchParams.set(key, "[REDACTED]")
  }

  if (url.username) {
    secrets.push(url.username)
    url.username = "[REDACTED]"
  }
  if (url.password) {
    secrets.push(url.password)
    url.password = "[REDACTED]"
  }

  return { safeUrl: url.toString(), secrets }
}

function redactSecrets(value: string, secrets: string[]): string {
  const orderedSecrets = [...new Set(secrets)].sort((left, right) => right.length - left.length)
  return orderedSecrets.reduce((redacted, secret) => {
    return redacted
      .replaceAll(secret, "[REDACTED]")
      .replaceAll(encodeURIComponent(secret), "[REDACTED]")
  }, value)
}

function proxySecrets(proxyUrl: string): string[] {
  const secrets = [proxyUrl]
  try {
    const url = new URL(proxyUrl)
    secrets.push(url.origin, url.host, url.hostname, url.username, url.password)
  } catch {
    // 无效代理仍将原始输入整体视为敏感值
  }
  return secrets.filter(Boolean)
}

function redactError(error: unknown, secrets: string[]): unknown {
  if (!(error instanceof Error)) return error
  const message = redactSecrets(error.message, secrets)
  const cause = "cause" in error ? redactError(error.cause, secrets) : undefined
  if (message === error.message && cause === error.cause) return error

  const redacted = new Error(message, cause ? { cause } : undefined) as Error & { code?: unknown }
  redacted.name = error.name
  if ("code" in error) redacted.code = error.code
  return redacted
}

export class SourceHttpError extends Error {
  constructor(
    message: string,
    readonly sourceId: string,
    readonly statusCode: number,
    readonly bodySnippet: string
  ) {
    super(message)
    this.name = "SourceHttpError"
  }
}

export class SourceHttpClient {
  private readonly dispatchers = new Map<string, Dispatcher>()

  constructor(
    private readonly settings: RuntimeSettingsService,
    private readonly transport: SourceTransport = undiciFetch,
    private readonly createDispatcher = (proxyUrl: string): Dispatcher => new ProxyAgent(proxyUrl)
  ) {}

  async fetchJson<T>(sourceId: string, url: string, options: SourceRequestOptions): Promise<T> {
    const response = await this.request(sourceId, url, options)
    return await response.json() as T
  }

  async fetchText(sourceId: string, url: string, options: SourceRequestOptions): Promise<string> {
    const response = await this.request(sourceId, url, options)
    return response.text()
  }

  async request(sourceId: string, url: string, options: SourceRequestOptions): Promise<Response> {
    const { timeoutMs, settingsOverride, ...requestOptions } = options
    const settings = this.settings.view(settingsOverride)
    const proxyUrl = resolveProxy(settings, sourceId, url)
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort(new DOMException(`请求超时（${timeoutMs}ms）`, "TimeoutError"))
    }, timeoutMs)
    const redactedUrl = redactUrl(url)
    const secrets = [...redactedUrl.secrets, ...(proxyUrl ? proxySecrets(proxyUrl) : [])]

    try {
      const dispatcher = proxyUrl ? this.dispatcherFor(proxyUrl) : undefined
      const response = await this.transport(url, {
        ...requestOptions as UndiciRequestInit,
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {})
      })
      if (response.ok) return response

      const body = redactSecrets(await response.text(), secrets).slice(0, 500)
      const message = redactSecrets(
        `HTTP ${response.status} ${response.statusText} for ${redactedUrl.safeUrl}: ${body}`,
        secrets
      )
      throw new SourceHttpError(message, sourceId, response.status, body)
    } catch (error) {
      throw redactError(error, secrets)
    } finally {
      clearTimeout(timeout)
    }
  }

  private dispatcherFor(proxyUrl: string): Dispatcher {
    const existing = this.dispatchers.get(proxyUrl)
    if (existing) return existing

    const dispatcher = this.createDispatcher(proxyUrl)
    this.dispatchers.set(proxyUrl, dispatcher)
    return dispatcher
  }
}

export const sourceHttpClient = new SourceHttpClient(runtimeSettings)
