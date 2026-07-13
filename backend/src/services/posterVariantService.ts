import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import type { PosterImage } from "./posterImageService.js"

export const POSTER_VARIANT_WIDTHS = [160, 320, 640, 960] as const
export type PosterVariantWidth = typeof POSTER_VARIANT_WIDTHS[number]

export type PosterVariant = {
  body: Buffer
  contentType: string
  width: number | null
  height: number | null
  cacheStatus: "hit" | "miss" | "fallback"
}

type PosterVariantMetadata = {
  url: string
  requestedWidth: PosterVariantWidth
  sourceDigest: string
  contentType: string
  width: number | null
  height: number | null
  cachedAt: string
}

type PosterVariantServiceOptions = {
  cacheDir?: string
}

export const POSTER_VARIANT_CACHE_DIR = join(process.cwd(), ".cache", "poster-variants")
const CACHE_VERSION = "v1"

function sourceDigest(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex")
}

function variantKey(url: string, width: PosterVariantWidth, digest: string): string {
  return createHash("sha256")
    .update(`${CACHE_VERSION}:${url}:${width}:${digest}`)
    .digest("hex")
}

export class PosterVariantService {
  private readonly cacheDir: string
  private readonly inFlight = new Map<string, Promise<PosterVariant>>()

  constructor(options: PosterVariantServiceOptions = {}) {
    this.cacheDir = options.cacheDir ?? POSTER_VARIANT_CACHE_DIR
  }

  async getVariant(url: string, image: PosterImage, width: PosterVariantWidth): Promise<PosterVariant> {
    const digest = sourceDigest(image.body)
    const key = variantKey(url, width, digest)
    const cached = await this.readCached(key, url, width, digest)
    if (cached) return cached

    const active = this.inFlight.get(key)
    if (active) return active

    const request = this.createAndCache(key, url, image, width, digest)
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, request)
    return request
  }

  private async readCached(
    key: string,
    url: string,
    width: PosterVariantWidth,
    digest: string
  ): Promise<PosterVariant | null> {
    try {
      const [metadataRaw, body] = await Promise.all([
        readFile(join(this.cacheDir, `${key}.json`), "utf8"),
        readFile(join(this.cacheDir, `${key}.webp`))
      ])
      const metadata = JSON.parse(metadataRaw) as PosterVariantMetadata
      if (metadata.url !== url
        || metadata.requestedWidth !== width
        || metadata.sourceDigest !== digest
        || metadata.contentType !== "image/webp"
        || body.length === 0) return null

      return {
        body,
        contentType: metadata.contentType,
        width: metadata.width,
        height: metadata.height,
        cacheStatus: "hit"
      }
    } catch {
      return null
    }
  }

  private async createAndCache(
    key: string,
    url: string,
    image: PosterImage,
    requestedWidth: PosterVariantWidth,
    digest: string
  ): Promise<PosterVariant> {
    try {
      const { data, info } = await sharp(image.body)
        .rotate()
        .resize({ width: requestedWidth, withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer({ resolveWithObject: true })
      const variant: PosterVariant = {
        body: data,
        contentType: "image/webp",
        width: info.width,
        height: info.height,
        cacheStatus: "miss"
      }
      await this.writeCached(key, {
        url,
        requestedWidth,
        sourceDigest: digest,
        contentType: variant.contentType,
        width: variant.width,
        height: variant.height,
        cachedAt: new Date().toISOString()
      }, data)
      return variant
    } catch {
      return {
        body: image.body,
        contentType: image.contentType,
        width: image.width,
        height: image.height,
        cacheStatus: "fallback"
      }
    }
  }

  private async writeCached(key: string, metadata: PosterVariantMetadata, body: Buffer): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true })
    const suffix = `${process.pid}-${Date.now()}`
    const bodyPath = join(this.cacheDir, `${key}.webp`)
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
}

export const posterVariantService = new PosterVariantService()
