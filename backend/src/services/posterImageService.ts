import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { imageSize } from "image-size"
import {
  ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
  type Response
} from "undici"
import { resolveProxy } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"

export type PosterImage = {
  body: Buffer
  contentType: string
  width: number | null
  height: number | null
  cacheHit: boolean
  cacheStatus: "hit" | "miss" | "stale"
}

type PosterMetadata = {
  url: string
  contentType: string
  cachedAt: string
  width?: number | null
  height?: number | null
}

type PosterTransport = (url: string, options?: UndiciRequestInit) => Promise<Response>

type PosterImageServiceOptions = {
  cacheDir?: string
  settings?: RuntimeSettingsService
  transport?: PosterTransport
  minIntervalMs?: number
  timeoutMs?: number
  maxBytes?: number
  cacheMaxAgeMs?: number
  failureCooldownMs?: number
  createDispatcher?: (proxyUrl: string) => Dispatcher
}

export const POSTER_CACHE_DIR = join(process.cwd(), ".cache", "posters")
const DEFAULT_TIMEOUT_MS = 45000
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_FAILURE_COOLDOWN_MS = 60 * 1000
const EXTERNAL_SERVICE_INTERVAL_MS = 2000

const POSTER_SOURCE_HOSTS = [
  ["image.tmdb.org", "tmdb"],
  ["static.tvmaze.com", "tvmaze"],
  ["artworks.thetvdb.com", "thetvdb"],
  ["media-amazon.com", "imdb"],
  ["doubanio.com", "douban"],
  ["iqiyipic.com", "iqiyi"],
  ["ykimg.com", "youku"],
  ["alicdn.com", "youku"],
  ["qpic.cn", "tencent"],
  ["gtimg.com", "tencent"],
  ["hdslb.com", "bilibili"]
] as const

type CachedPoster = PosterImage & {
  expired: boolean
}

type RecentFailure = {
  error: Error
  retryAt: number
}

function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex")
}

function originReferer(url: string): string {
  const parsed = new URL(url)
  return `${parsed.origin}/`
}

function sourceForPosterUrl(url: string): string | null {
  const hostname = new URL(url).hostname.toLowerCase()
  const match = POSTER_SOURCE_HOSTS.find(([host]) => hostname === host || hostname.endsWith(`.${host}`))
  return match?.[1] ?? null
}

function proxyFor(settings: RuntimeSettingsService, url: string): string | null {
  const sourceId = sourceForPosterUrl(url)
  if (sourceId) return resolveProxy(settings, sourceId, url)

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

function dimensions(body: Buffer): { width: number | null, height: number | null } {
  try {
    const result = imageSize(body)
    return {
      width: Number.isInteger(result.width) ? result.width : null,
      height: Number.isInteger(result.height) ? result.height : null
    }
  } catch {
    return { width: null, height: null }
  }
}

export class PosterImageService {
  private readonly cacheDir: string
  private readonly settings: RuntimeSettingsService
  private readonly transport: PosterTransport
  private readonly minIntervalMs: number
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly cacheMaxAgeMs: number
  private readonly failureCooldownMs: number
  private readonly createDispatcher: (proxyUrl: string) => Dispatcher
  private readonly dispatchers = new Map<string, Dispatcher>()
  private readonly limiters = new Map<string, RateLimiter>()
  private readonly inFlight = new Map<string, Promise<PosterImage>>()
  private readonly recentFailures = new Map<string, RecentFailure>()
  private cacheWriteWarningLogged = false

  constructor(options: PosterImageServiceOptions = {}) {
    this.cacheDir = options.cacheDir ?? POSTER_CACHE_DIR
    this.settings = options.settings ?? runtimeSettings
    this.transport = options.transport ?? undiciFetch
    this.minIntervalMs = options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.cacheMaxAgeMs = options.cacheMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS
    this.failureCooldownMs = options.failureCooldownMs ?? DEFAULT_FAILURE_COOLDOWN_MS
    this.createDispatcher = options.createDispatcher ?? ((proxyUrl: string) => new ProxyAgent(proxyUrl))
  }

  async getPoster(url: string): Promise<PosterImage> {
    this.validateUrl(url)
    const cached = await this.readCached(url)
    if (cached && !cached.expired) return cached

    const inFlight = this.inFlight.get(url)
    if (inFlight) return inFlight

    const recentFailure = this.recentFailures.get(url)
    if (recentFailure && recentFailure.retryAt > Date.now()) {
      if (cached) return { ...cached, cacheStatus: "stale" }
      throw recentFailure.error
    }

    const request = this.fetchAndCache(url)
      .then((image) => {
        this.recentFailures.delete(url)
        return image
      })
      .catch((error: unknown) => {
        const normalized = error instanceof Error ? error : new Error(String(error))
        this.recentFailures.set(url, {
          error: normalized,
          retryAt: Date.now() + this.failureCooldownMs
        })
        if (cached) return { ...cached, cacheStatus: "stale" as const }
        throw normalized
      })
      .finally(() => {
        this.inFlight.delete(url)
      })

    this.inFlight.set(url, request)
    return request
  }

  private validateUrl(url: string): void {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`不支持的图片地址协议: ${parsed.protocol}`)
    }
  }

  private async readCached(url: string): Promise<CachedPoster | null> {
    const key = cacheKey(url)
    try {
      const [metadataRaw, body] = await Promise.all([
        readFile(join(this.cacheDir, `${key}.json`), "utf8"),
        readFile(join(this.cacheDir, `${key}.bin`))
      ])
      const metadata = JSON.parse(metadataRaw) as PosterMetadata
      if (metadata.url !== url) return null
      const contentType = assertImageResponse(metadata.contentType, body.length)
      if (body.length > this.maxBytes) return null
      const cachedAt = Date.parse(metadata.cachedAt)
      if (!Number.isFinite(cachedAt)) return null

      const measured = Number.isInteger(metadata.width) && Number.isInteger(metadata.height)
        ? { width: metadata.width ?? null, height: metadata.height ?? null }
        : dimensions(body)

      return {
        body,
        contentType,
        ...measured,
        cacheHit: true,
        cacheStatus: "hit",
        expired: Date.now() - cachedAt > this.cacheMaxAgeMs
      }
    } catch {
      return null
    }
  }

  private async fetchAndCache(url: string): Promise<PosterImage> {
    return this.limiterFor(url).run(async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => {
        controller.abort(new DOMException(`图片请求超时（${this.timeoutMs}ms）`, "TimeoutError"))
      }, this.timeoutMs)

      try {
        const dispatcher = this.dispatcherFor(url)
        const response = await this.transport(url, {
          headers: {
            accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            referer: originReferer(url),
            "user-agent": "Mozilla/5.0 WhatsNewBot/0.1"
          },
          redirect: "follow",
          signal: controller.signal,
          ...(dispatcher ? { dispatcher } : {})
        })
        if (!response.ok) throw new Error(`图片请求失败: HTTP ${response.status}`)

        const body = Buffer.from(await response.arrayBuffer())
        if (body.length > this.maxBytes) throw new Error(`图片过大: ${body.length} bytes`)
        const contentType = assertImageResponse(response.headers.get("content-type"), body.length)
        const measured = dimensions(body)

        try {
          await this.writeCached(url, contentType, body, measured)
        } catch (error) {
          if (!this.cacheWriteWarningLogged) {
            const code = error && typeof error === "object" && "code" in error
              ? String(error.code)
              : "unknown"
            console.warn("海报缓存写入失败，当前请求将返回未缓存图片", { code })
            this.cacheWriteWarningLogged = true
          }
        }
        return { body, contentType, ...measured, cacheHit: false, cacheStatus: "miss" }
      } finally {
        clearTimeout(timer)
      }
    })
  }

  private async writeCached(
    url: string,
    contentType: string,
    body: Buffer,
    measured: { width: number | null, height: number | null }
  ): Promise<void> {
    const key = cacheKey(url)
    const metadata: PosterMetadata = {
      url,
      contentType,
      cachedAt: new Date().toISOString(),
      ...measured
    }
    await mkdir(this.cacheDir, { recursive: true })
    const suffix = `${process.pid}-${Date.now()}`
    const bodyPath = join(this.cacheDir, `${key}.bin`)
    const metadataPath = join(this.cacheDir, `${key}.json`)
    const temporaryBodyPath = `${bodyPath}.${suffix}.tmp`
    const temporaryMetadataPath = `${metadataPath}.${suffix}.tmp`
    await Promise.all([
      writeFile(temporaryBodyPath, body),
      writeFile(temporaryMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
    ])
    await rename(temporaryBodyPath, bodyPath)
    await rename(temporaryMetadataPath, metadataPath)
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
