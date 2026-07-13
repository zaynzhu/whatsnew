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
      mediaType: "movie",
      releaseForm: "streaming_movie",
      sourceContentType: null,
      genres: "[]",
      heatScore: 98,
      posterUrl: null,
      posterWidth: 240,
      posterHeight: 360,
      posterLookupAttemptedAt: new Date("2026-07-10T00:00:00.000Z"),
      updatedAt: new Date("2026-07-12T00:00:00.000Z"),
      sourceRefs: [{ source: "netflix" }]
    }
    const count = vi.fn(async ({ where }: any = {}) => {
      if (where?.sourceRefs && Object.keys(where).length === 1) return 10
      if (where.OR) return 2
      if (where.AND) {
        const isReplacement = where.AND[0]?.posterQuality === "undersized"
        const lookup = where.AND[1]?.posterLookupAttemptedAt
        if (lookup === null) return isReplacement ? 1 : 0
        if (lookup?.gte) return isReplacement ? 1 : 2
        if (lookup?.lt) return isReplacement ? 1 : 0
      }
      const qualityCounts: Record<string, number> = { unknown: 4, adequate: 3, undersized: 1 }
      if (where.posterQuality) return qualityCounts[String(where.posterQuality)] ?? 0
      const statusCounts: Record<string, number> = { unverified: 5, healthy: 3, degraded: 1, broken: 1 }
      return statusCounts[String(where.posterStatus)] ?? 0
    })
    const findMany = vi.fn(async (_args?: any) => [sample])
    const findFirst = vi.fn(async ({ where }: any) => ({
      posterLookupAttemptedAt: where.AND[0]?.posterQuality === "undersized"
        ? new Date("2026-07-11T00:00:00.000Z")
        : new Date("2026-07-10T00:00:00.000Z")
    }))
    const service = createPosterHealthService({
      database: { mediaItem: { count, findFirst, findMany } } as never,
      cacheDir: originalCacheDir,
      variantCacheDir,
      now: () => new Date("2026-07-13T00:00:00.000Z")
    })

    await expect(service.getHealth()).resolves.toEqual({
      total: 10,
      withPoster: 8,
      missing: 2,
      coveragePercent: 80,
      missingBySource: [{ source: "netflix", count: 1 }],
      statuses: { unverified: 5, healthy: 3, degraded: 1, broken: 1 },
      quality: { unknown: 4, adequate: 3, undersized: 1 },
      lookup: {
        notAttempted: 0,
        cooldown: 2,
        retryEligible: 0,
        retryAfterDays: 3,
        nextCooldownExpiryAt: "2026-07-13T00:00:00.000Z"
      },
      replacement: {
        notAttempted: 1,
        cooldown: 1,
        retryEligible: 1,
        retryAfterDays: 3,
        nextCooldownExpiryAt: "2026-07-14T00:00:00.000Z"
      },
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
        broken: [{ id: "media-1", title: "Missing Poster", heatScore: 98, attentionCategory: "scripted", priorityScore: 99.4, sources: ["netflix"], width: 240, height: 360, lookupState: "cooldown", lastLookupAt: "2026-07-10T00:00:00.000Z" }],
        degraded: [{ id: "media-1", title: "Missing Poster", heatScore: 98, attentionCategory: "scripted", priorityScore: 99.4, sources: ["netflix"], width: 240, height: 360, lookupState: "cooldown", lastLookupAt: "2026-07-10T00:00:00.000Z" }],
        missing: [{ id: "media-1", title: "Missing Poster", heatScore: 98, attentionCategory: "scripted", priorityScore: 99.4, sources: ["netflix"], width: 240, height: 360, lookupState: "cooldown", lastLookupAt: "2026-07-10T00:00:00.000Z" }],
        undersized: [{ id: "media-1", title: "Missing Poster", heatScore: 98, attentionCategory: "scripted", priorityScore: 99.4, sources: ["netflix"], width: 240, height: 360, lookupState: "cooldown", lastLookupAt: "2026-07-10T00:00:00.000Z" }]
      }
    })
    expect(count.mock.calls.every(([args]) => (
      args.where?.sourceRefs?.some?.isActive === true
      || args.where?.AND?.[0]?.sourceRefs?.some?.isActive === true
    ))).toBe(true)
    expect(findMany.mock.calls.every(([args]) => (
      args.where?.sourceRefs?.some?.isActive === true
    ))).toBe(true)
  })

  it("returns health samples in the same attention order as poster enrichment", async () => {
    const row = (overrides: Record<string, unknown>) => ({
      id: "media",
      titleDisplay: "Media",
      mediaType: "series",
      releaseForm: "tv_series",
      sourceContentType: "scripted",
      genres: "[]",
      heatScore: 0,
      posterUrl: null,
      posterWidth: null,
      posterHeight: null,
      posterLookupAttemptedAt: null,
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      sourceRefs: [{ source: "tvmaze" }],
      ...overrides
    })
    const news = row({
      id: "news",
      titleDisplay: "Morning News",
      sourceContentType: "news",
      heatScore: 100,
      updatedAt: new Date("2026-07-14T00:00:00.000Z")
    })
    const drama = row({ id: "drama", titleDisplay: "Upcoming Drama" })
    const findMany = vi.fn(async ({ where, select }: any = {}) => (
      where?.OR && select?.titleDisplay ? [news, drama] : []
    ))
    const service = createPosterHealthService({
      database: {
        mediaItem: {
          count: vi.fn(async () => 0),
          findFirst: vi.fn(async () => null),
          findMany
        }
      } as never,
      cacheDir: "/tmp/whatsnew-missing-original-cache",
      variantCacheDir: "/tmp/whatsnew-missing-variant-cache",
      now: () => new Date("2026-07-14T00:00:00.000Z")
    })

    const health = await service.getHealth()

    expect(health.samples.missing.map((item) => item.title)).toEqual([
      "Upcoming Drama",
      "Morning News"
    ])
    expect(health.samples.missing.map((item) => item.priorityScore)).toEqual([70, 33.5])
  })
})
