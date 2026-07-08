import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
  type Response
} from "undici"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"

export type PosterImage = {
  body: Buffer
  contentType: string
  cacheHit: boolean
}

type PosterMetadata = {
  url: string
  contentType: string
  cachedAt: string
}

type PosterTransport = (url: string, options?: UndiciRequestInit) => Promise<Response>

type PosterImageServiceOptions = {
  cacheDir?: string
  settings?: RuntimeSettingsService
  transport?: PosterTransport
  minIntervalMs?: number
  timeoutMs?: number
  maxBytes?: number
  createDispatcher?: (proxyUrl: string) => Dispatcher
}

const DEFAULT_CACHE_DIR = join(process.cwd(), ".cache", "posters")
const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const EXTERNAL_SERVICE_INTERVAL_MS = 2000

function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex")
}

function originReferer(url: string): string {
  const parsed = new URL(url)
  return `${parsed.origin}/`
}

function proxyFor(settings: RuntimeSettingsService, url: string): string | null {
  const protocol = new URL(url).protocol
  if (protocol === "https:") return settings.get("HTTPS_PROXY") || settings.get("HTTP_PROXY") || null
  if (protocol === "http:") return settings.get("HTTP_PROXY") || null
  return null
}

function assertImageResponse(contentType: string | null, size: number): string {
  if (size <= 0) throw new Error("图片响应为空")
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase() ?? ""
  if (!normalized.startsWith("image/")) throw new Error(`图片响应类型无效: ${contentType ?? "unknown"}`)
  return normalized
}

export class PosterImageService {
  private readonly cacheDir: string
  private readonly settings: RuntimeSettingsService
  private readonly transport: PosterTransport
  private readonly minIntervalMs: number
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly createDispatcher: (proxyUrl: string) => Dispatcher
  private readonly dispatchers = new Map<string, Dispatcher>()
  private readonly limiters = new Map<string, RateLimiter>()

  constructor(options: PosterImageServiceOptions = {}) {
    this.cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR
    this.settings = options.settings ?? runtimeSettings
    this.transport = options.transport ?? undiciFetch
    this.minIntervalMs = options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.createDispatcher = options.createDispatcher ?? ((proxyUrl: string) => new ProxyAgent(proxyUrl))
  }

  async getPoster(url: string): Promise<PosterImage> {
    this.validateUrl(url)
    const cached = await this.readCached(url)
    if (cached) return cached

    return this.fetchAndCache(url)
  }

  private validateUrl(url: string): void {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`不支持的图片地址协议: ${parsed.protocol}`)
    }
  }

  private async readCached(url: string): Promise<PosterImage | null> {
    const key = cacheKey(url)
    try {
      const [metadataRaw, body] = await Promise.all([
        readFile(join(this.cacheDir, `${key}.json`), "utf8"),
        readFile(join(this.cacheDir, `${key}.bin`))
      ])
      const metadata = JSON.parse(metadataRaw) as PosterMetadata
      if (metadata.url !== url) return null

      return {
        body,
        contentType: metadata.contentType,
        cacheHit: true
      }
    } catch {
      return null
    }
  }

  private async fetchAndCache(url: string): Promise<PosterImage> {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort(new DOMException(`图片请求超时（${this.timeoutMs}ms）`, "TimeoutError"))
    }, this.timeoutMs)

    try {
      const dispatcher = this.dispatcherFor(url)
      const response = await this.limiterFor(url).run(() => this.transport(url, {
        headers: {
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          referer: originReferer(url),
          "user-agent": "Mozilla/5.0 WhatsNewBot/0.1"
        },
        redirect: "follow",
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {})
      }))
      if (!response.ok) throw new Error(`图片请求失败: HTTP ${response.status}`)

      const body = Buffer.from(await response.arrayBuffer())
      if (body.length > this.maxBytes) throw new Error(`图片过大: ${body.length} bytes`)
      const contentType = assertImageResponse(response.headers.get("content-type"), body.length)

      await this.writeCached(url, contentType, body)
      return { body, contentType, cacheHit: false }
    } finally {
      clearTimeout(timer)
    }
  }

  private async writeCached(url: string, contentType: string, body: Buffer): Promise<void> {
    const key = cacheKey(url)
    const metadata: PosterMetadata = {
      url,
      contentType,
      cachedAt: new Date().toISOString()
    }
    await mkdir(this.cacheDir, { recursive: true })
    await Promise.all([
      writeFile(join(this.cacheDir, `${key}.bin`), body),
      writeFile(join(this.cacheDir, `${key}.json`), `${JSON.stringify(metadata, null, 2)}\n`)
    ])
  }

  private dispatcherFor(url: string): Dispatcher | undefined {
    const proxyUrl = proxyFor(this.settings, url)
    if (!proxyUrl) return undefined
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

export const posterImageService = new PosterImageService()
