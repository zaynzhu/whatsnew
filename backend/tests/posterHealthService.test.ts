import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createPosterHealthService } from "../src/services/posterHealthService.js"

let tempDir: string | null = null

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe("PosterHealthService", () => {
  it("summarizes database coverage, health states and disk cache integrity", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-poster-health-"))
    const originalCacheDir = join(tempDir, "original")
    const variantCacheDir = join(tempDir, "variants")
    await Promise.all([mkdir(originalCacheDir), mkdir(variantCacheDir)])
    await Promise.all([
      writeFile(join(originalCacheDir, "valid.bin"), Buffer.from("image")),
      writeFile(join(originalCacheDir, "valid.json"), JSON.stringify({
        url: "https://img.test/valid.jpg",
        contentType: "image/jpeg",
        cachedAt: "2026-07-11T00:00:00.000Z"
      })),
      writeFile(join(originalCacheDir, "corrupt.bin"), Buffer.alloc(0)),
      writeFile(join(originalCacheDir, "corrupt.json"), "{}"),
      writeFile(join(originalCacheDir, "orphan.bin"), Buffer.from("orphan")),
      writeFile(join(variantCacheDir, "valid.webp"), Buffer.from("webp")),
      writeFile(join(variantCacheDir, "valid.json"), JSON.stringify({
        url: "https://img.test/valid.jpg",
        requestedWidth: 320,
        sourceDigest: "a".repeat(64),
        contentType: "image/webp",
        width: 320,
        height: 480,
        cachedAt: "2026-07-11T00:00:00.000Z"
      })),
      writeFile(join(variantCacheDir, "invalid.webp"), Buffer.from("invalid")),
      writeFile(join(variantCacheDir, "invalid.json"), JSON.stringify({
        url: "https://img.test/invalid.jpg",
        requestedWidth: 500,
        sourceDigest: "short",
        contentType: "image/webp",
        width: 500,
        height: 750,
        cachedAt: "2026-07-11T00:00:00.000Z"
      })),
      writeFile(join(variantCacheDir, "orphan.json"), "{}")
    ])
    const sample = {
      id: "media-1",
      titleDisplay: "Missing Poster",
      heatScore: 98,
      posterWidth: 240,
      posterHeight: 360,
      sourceRefs: [{ source: "netflix" }]
    }
    const count = vi.fn(async ({ where }: any = {}) => {
      if (!where) return 10
      if (where.OR) return 2
      const qualityCounts: Record<string, number> = { unknown: 4, adequate: 3, undersized: 1 }
      if (where.posterQuality) return qualityCounts[String(where.posterQuality)] ?? 0
      const statusCounts: Record<string, number> = { unverified: 5, healthy: 3, degraded: 1, broken: 1 }
      return statusCounts[String(where.posterStatus)] ?? 0
    })
    const findMany = vi.fn(async () => [sample])
    const service = createPosterHealthService({
      database: { mediaItem: { count, findMany } } as never,
      cacheDir: originalCacheDir,
      variantCacheDir
    })

    await expect(service.getHealth()).resolves.toEqual({
      total: 10,
      withPoster: 8,
      missing: 2,
      coveragePercent: 80,
      statuses: { unverified: 5, healthy: 3, degraded: 1, broken: 1 },
      quality: { unknown: 4, adequate: 3, undersized: 1 },
      cache: {
        entries: 2,
        bytes: 5,
        orphanedFiles: 1,
        corruptEntries: 1,
        variants: {
          entries: 2,
          bytes: 11,
          orphanedFiles: 1,
          corruptEntries: 1,
          maxBytes: 536_870_912
        }
      },
      samples: {
        broken: [{ id: "media-1", title: "Missing Poster", heatScore: 98, sources: ["netflix"], width: 240, height: 360 }],
        degraded: [{ id: "media-1", title: "Missing Poster", heatScore: 98, sources: ["netflix"], width: 240, height: 360 }],
        missing: [{ id: "media-1", title: "Missing Poster", heatScore: 98, sources: ["netflix"], width: 240, height: 360 }],
        undersized: [{ id: "media-1", title: "Missing Poster", heatScore: 98, sources: ["netflix"], width: 240, height: 360 }]
      }
    })
  })
})
