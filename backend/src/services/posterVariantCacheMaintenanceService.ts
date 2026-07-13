import { readdir, readFile, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import {
  POSTER_VARIANT_CACHE_DIR,
  POSTER_VARIANT_WIDTHS
} from "./posterVariantService.js"
import { POSTER_CACHE_DIR } from "./posterImageService.js"

export const DEFAULT_POSTER_VARIANT_CACHE_MAX_BYTES = 512 * 1024 * 1024
export const DEFAULT_POSTER_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024
const DEFAULT_TARGET_RATIO = 0.9
const DEFAULT_WRITE_GRACE_MS = 60 * 60 * 1000

type CacheFile = {
  name: string
  size: number
  mtimeMs: number
}

type CacheEntry = {
  key: string
  files: CacheFile[]
  bytes: number
  cachedAt: number
}

export type PosterVariantCachePruneResult = {
  mode: "dry-run" | "apply"
  maxBytes: number
  targetBytes: number
  entriesBefore: number
  bytesBefore: number
  entriesAfter: number
  bytesAfter: number
  removedEntries: number
  removedFiles: number
  removedBytes: number
  reasons: {
    corrupt: number
    orphaned: number
    temporary: number
    overCapacity: number
  }
}

type PosterVariantCachePruneOptions = {
  cacheDir?: string
  maxBytes?: number
  apply?: boolean
  writeGraceMs?: number
  now?: number
}

async function cacheFiles(cacheDir: string): Promise<Map<string, CacheFile>> {
  let names: string[]
  try {
    names = await readdir(cacheDir)
  } catch {
    return new Map()
  }

  const files = await Promise.all(names.map(async (name): Promise<CacheFile | null> => {
    try {
      const details = await stat(join(cacheDir, name))
      if (!details.isFile()) return null
      return { name, size: details.size, mtimeMs: details.mtimeMs }
    } catch {
      return null
    }
  }))
  return new Map(files.filter((file): file is CacheFile => Boolean(file)).map((file) => [file.name, file]))
}

function variantMetadataIsValid(metadata: Record<string, unknown>): boolean {
  return typeof metadata.url === "string"
    && metadata.contentType === "image/webp"
    && typeof metadata.cachedAt === "string"
    && Number.isFinite(Date.parse(metadata.cachedAt))
    && typeof metadata.sourceDigest === "string"
    && /^[a-f0-9]{64}$/.test(metadata.sourceDigest)
    && typeof metadata.requestedWidth === "number"
    && POSTER_VARIANT_WIDTHS.includes(metadata.requestedWidth as typeof POSTER_VARIANT_WIDTHS[number])
    && (metadata.width === null || typeof metadata.width === "number")
    && (metadata.height === null || typeof metadata.height === "number")
}

function posterMetadataIsValid(metadata: Record<string, unknown>): boolean {
  return typeof metadata.url === "string"
    && typeof metadata.contentType === "string"
    && metadata.contentType.startsWith("image/")
    && typeof metadata.cachedAt === "string"
    && Number.isFinite(Date.parse(metadata.cachedAt))
    && (metadata.width === undefined || metadata.width === null || typeof metadata.width === "number")
    && (metadata.height === undefined || metadata.height === null || typeof metadata.height === "number")
}

async function prunePairedPosterCache(
  options: PosterVariantCachePruneOptions,
  defaults: {
    cacheDir: string
    maxBytes: number
    bodyExtension: ".bin" | ".webp"
    metadataIsValid(metadata: Record<string, unknown>): boolean
    invalidLimitMessage: string
  }
): Promise<PosterVariantCachePruneResult> {
  const cacheDir = options.cacheDir ?? defaults.cacheDir
  const maxBytes = options.maxBytes ?? defaults.maxBytes
  const apply = options.apply ?? false
  const writeGraceMs = options.writeGraceMs ?? DEFAULT_WRITE_GRACE_MS
  const now = options.now ?? Date.now()
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error(defaults.invalidLimitMessage)

  const files = await cacheFiles(cacheDir)
  const removableFiles = new Set<string>()
  const removableEntries = new Set<string>()
  const reasons = { corrupt: 0, orphaned: 0, temporary: 0, overCapacity: 0 }

  for (const file of files.values()) {
    if (file.name.endsWith(".tmp") && now - file.mtimeMs >= writeGraceMs) {
      removableFiles.add(file.name)
      reasons.temporary += 1
    }
  }

  const bodyKeys = new Set([...files.keys()]
    .filter((name) => name.endsWith(defaults.bodyExtension))
    .map((name) => name.slice(0, -defaults.bodyExtension.length)))
  const metadataKeys = new Set([...files.keys()]
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5)))
  const allKeys = new Set([...bodyKeys, ...metadataKeys])
  const validEntries: CacheEntry[] = []
  let completeEntries = 0
  let completeBytes = 0

  for (const key of allKeys) {
    const body = files.get(`${key}${defaults.bodyExtension}`)
    const metadataFile = files.get(`${key}.json`)
    if (!body || !metadataFile) {
      const orphan = body ?? metadataFile
      if (orphan && now - orphan.mtimeMs >= writeGraceMs) {
        removableFiles.add(orphan.name)
        reasons.orphaned += 1
      }
      continue
    }
    completeEntries += 1
    completeBytes += body.size + metadataFile.size

    let metadata: Record<string, unknown> | null = null
    try {
      metadata = JSON.parse(await readFile(join(cacheDir, metadataFile.name), "utf8")) as Record<string, unknown>
    } catch {
      metadata = null
    }
    const newestWrite = Math.max(body.mtimeMs, metadataFile.mtimeMs)
    if ((body.size <= 0 || !metadata || !defaults.metadataIsValid(metadata))
      && now - newestWrite >= writeGraceMs) {
      removableFiles.add(body.name)
      removableFiles.add(metadataFile.name)
      removableEntries.add(key)
      reasons.corrupt += 1
      continue
    }
    if (!metadata || !defaults.metadataIsValid(metadata)) continue

    validEntries.push({
      key,
      files: [body, metadataFile],
      bytes: body.size + metadataFile.size,
      cachedAt: Date.parse(String(metadata.cachedAt))
    })
  }

  const validBytes = validEntries.reduce((sum, entry) => sum + entry.bytes, 0)
  const targetBytes = Math.floor(maxBytes * DEFAULT_TARGET_RATIO)
  let bytesAfter = validBytes
  if (validBytes > maxBytes) {
    for (const entry of [...validEntries].sort((left, right) => left.cachedAt - right.cachedAt)) {
      if (bytesAfter <= targetBytes) break
      for (const file of entry.files) removableFiles.add(file.name)
      removableEntries.add(entry.key)
      reasons.overCapacity += 1
      bytesAfter -= entry.bytes
    }
  }

  let removedBytes = 0
  for (const name of removableFiles) removedBytes += files.get(name)?.size ?? 0
  if (apply) {
    await Promise.all([...removableFiles].map((name) => unlink(join(cacheDir, name)).catch(() => {})))
  }

  return {
    mode: apply ? "apply" : "dry-run",
    maxBytes,
    targetBytes,
    entriesBefore: completeEntries,
    bytesBefore: completeBytes,
    entriesAfter: completeEntries - removableEntries.size,
    bytesAfter,
    removedEntries: removableEntries.size,
    removedFiles: removableFiles.size,
    removedBytes,
    reasons
  }
}

export async function prunePosterVariantCache(
  options: PosterVariantCachePruneOptions = {}
): Promise<PosterVariantCachePruneResult> {
  return prunePairedPosterCache(options, {
    cacheDir: POSTER_VARIANT_CACHE_DIR,
    maxBytes: DEFAULT_POSTER_VARIANT_CACHE_MAX_BYTES,
    bodyExtension: ".webp",
    metadataIsValid: variantMetadataIsValid,
    invalidLimitMessage: "响应式图片缓存上限必须大于 0"
  })
}

export async function prunePosterCache(
  options: PosterVariantCachePruneOptions = {}
): Promise<PosterVariantCachePruneResult> {
  return prunePairedPosterCache(options, {
    cacheDir: POSTER_CACHE_DIR,
    maxBytes: DEFAULT_POSTER_CACHE_MAX_BYTES,
    bodyExtension: ".bin",
    metadataIsValid: posterMetadataIsValid,
    invalidLimitMessage: "原图缓存上限必须大于 0"
  })
}
