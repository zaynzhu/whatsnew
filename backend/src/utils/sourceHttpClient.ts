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
import { RateLimiter } from "./rateLimiter.js"
import { currentSourceSyncSignal } from "./sourceSyncContext.js"

const SENSITIVE_QUERY_KEYS = new Set(["api_key", "apikey", "key", "token", "access_token"])

export type SourceRequestOptions = Omit<RequestInit, "signal"> & {
  timeoutMs: number
  retryAttempts?: number
  retryDelayMs?: number
  settingsOverride?: Record<string, string>
  sensitiveValues?: readonly string[]
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
  if (typeof error === "string") return redactSecrets(error, secrets)
  if (!(error instanceof Error)) return error
  const message = redactSecrets(error.message, secrets)
  const hasCause = "cause" in error
  const cause = hasCause ? redactError(error.cause, secrets) : undefined
  const bodySnippet = error instanceof SourceHttpError
    ? redactSecrets(error.bodySnippet, secrets)
    : null
  const bodyUnchanged = !(error instanceof SourceHttpError) || bodySnippet === error.bodySnippet
  if (message === error.message && bodyUnchanged && (!hasCause || cause === error.cause)) return error

  const errorOptions = hasCause ? { cause } : undefined
  const redacted: Error & { code?: unknown } = error instanceof SourceHttpError
    ? new SourceHttpError(
        message,
        error.sourceId,
        error.statusCode,
        bodySnippet ?? "",
        error.serverHeader,
        errorOptions
      )
    : new Error(message, errorOptions) as Error & { code?: unknown }
  redacted.name = error.name
  if ("code" in error) redacted.code = error.code
  return redacted
}

export class SourceHttpError extends Error {
  constructor(
    message: string,
    readonly sourceId: string,
    readonly statusCode: number,
    readonly bodySnippet: string,
    readonly serverHeader: string | null = null,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = "SourceHttpError"
  }
}

function isRetryableRequestError(error: unknown): boolean {
  if (error instanceof SourceHttpError) {
    return error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500
  }
  if (!(error instanceof Error)) return false
  if (["AbortError", "TimeoutError"].includes(error.name)) return true
  const message = `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`.toLowerCase()
  return ["fetch failed", "econnreset", "econnrefused", "etimedout", "socket", "network"]
    .some((fragment) => message.includes(fragment))
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export class SourceHttpClient {
  private readonly dispatchers = new Map<string, Dispatcher>()
  private readonly limiters = new Map<string, RateLimiter>()

  constructor(
    private readonly settings: RuntimeSettingsService,
    private readonly transport: SourceTransport = undiciFetch,
    private readonly createDispatcher = (proxyUrl: string): Dispatcher => new ProxyAgent(proxyUrl),
    private readonly minIntervalMs = 0,
    private readonly defaultRetryAttempts = 1
  ) {}

  async fetchJson<T>(sourceId: string, url: string, options: SourceRequestOptions): Promise<T> {
    const response = await this.request(sourceId, url, options)
    return await response.json() as T
  }

  async fetchText(sourceId: string, url: string, options: SourceRequestOptions): Promise<string> {
    const response = await this.request(sourceId, url, options)
    return response.text()
  }

  async fetchBuffer(sourceId: string, url: string, options: SourceRequestOptions): Promise<Buffer> {
    const response = await this.request(sourceId, url, options)
    return Buffer.from(await response.arrayBuffer())
  }

  async request(sourceId: string, url: string, options: SourceRequestOptions): Promise<Response> {
    const {
      timeoutMs,
      retryAttempts = this.defaultRetryAttempts,
      retryDelayMs = 500,
      settingsOverride,
      sensitiveValues = [],
      ...requestOptions
    } = options
    const settings = this.settings.view(settingsOverride)
    const proxyUrl = resolveProxy(settings, sourceId, url)
    const redactedUrl = redactUrl(url)
    const secrets = [
      ...redactedUrl.secrets,
      ...(proxyUrl ? proxySecrets(proxyUrl) : []),
      ...sensitiveValues.filter(Boolean)
    ]

    const method = (requestOptions.method ?? "GET").toUpperCase()
    const retryableMethod = ["GET", "HEAD", "OPTIONS"].includes(method)
    const attempts = retryableMethod ? Math.max(1, Math.min(retryAttempts, 3)) : 1
    const sourceSyncSignal = currentSourceSyncSignal()
    let lastError: unknown

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      sourceSyncSignal?.throwIfAborted()
      try {
        const dispatcher = proxyUrl ? this.dispatcherFor(proxyUrl) : undefined
        const response = await this.limiterFor(url).run(async () => {
          const controller = new AbortController()
          const timeout = setTimeout(() => {
            controller.abort(new DOMException(`请求超时（${timeoutMs}ms）`, "TimeoutError"))
          }, timeoutMs)
          const signal = sourceSyncSignal
            ? AbortSignal.any([controller.signal, sourceSyncSignal])
            : controller.signal
          try {
            return await this.transport(url, {
              ...requestOptions as UndiciRequestInit,
              signal,
              ...(dispatcher ? { dispatcher } : {})
            })
          } finally {
            clearTimeout(timeout)
          }
        })
        if (response.ok) return response

        const body = redactSecrets(await response.text(), secrets).slice(0, 500)
        const message = redactSecrets(
          `HTTP ${response.status} ${response.statusText} for ${redactedUrl.safeUrl}`,
          secrets
        )
        throw new SourceHttpError(message, sourceId, response.status, body, response.headers.get("server"))
      } catch (error) {
        lastError = redactError(error, secrets)
        sourceSyncSignal?.throwIfAborted()
        if (attempt >= attempts || !isRetryableRequestError(lastError)) throw lastError
        if (retryDelayMs > 0) await sleep(retryDelayMs)
      }
    }

    throw lastError
  }

  private dispatcherFor(proxyUrl: string): Dispatcher {
    const existing = this.dispatchers.get(proxyUrl)
    if (existing) return existing

    const dispatcher = this.createDispatcher(proxyUrl)
    this.dispatchers.set(proxyUrl, dispatcher)
    return dispatcher
  }

  private limiterFor(url: string): RateLimiter {
    const service = new URL(url).origin
    const existing = this.limiters.get(service)
    if (existing) return existing

    const limiter = new RateLimiter(this.minIntervalMs)
    this.limiters.set(service, limiter)
    return limiter
  }
}

export const sourceHttpClient = new SourceHttpClient(runtimeSettings, undiciFetch, undefined, 2000, 2)
