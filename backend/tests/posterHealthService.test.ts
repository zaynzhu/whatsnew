import { mkdtemp, rm, writeFile } from "node:fs/promises"
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
    await Promise.all([
      writeFile(join(tempDir, "valid.bin"), Buffer.from("image")),
      writeFile(join(tempDir, "valid.json"), JSON.stringify({
        url: "https://img.test/valid.jpg",
        contentType: "image/jpeg",
        cachedAt: "2026-07-11T00:00:00.000Z"
      })),
      writeFile(join(tempDir, "corrupt.bin"), Buffer.alloc(0)),
      writeFile(join(tempDir, "corrupt.json"), "{}"),
      writeFile(join(tempDir, "orphan.bin"), Buffer.from("orphan"))
    ])
    const sample = {
      id: "media-1",
      titleDisplay: "Missing Poster",
      heatScore: 98,
      sourceRefs: [{ source: "netflix" }]
    }
    const count = vi.fn(async ({ where }: any = {}) => {
      if (!where) return 10
      if (where.OR) return 2
      const statusCounts: Record<string, number> = { unverified: 5, healthy: 3, degraded: 1, broken: 1 }
      return statusCounts[String(where.posterStatus)] ?? 0
    })
    const findMany = vi.fn(async () => [sample])
    const service = createPosterHealthService({
      database: { mediaItem: { count, findMany } } as never,
      cacheDir: tempDir
    })

    await expect(service.getHealth()).resolves.toEqual({
      total: 10,
      withPoster: 8,
      missing: 2,
      coveragePercent: 80,
      statuses: { unverified: 5, healthy: 3, degraded: 1, broken: 1 },
      cache: { entries: 2, bytes: 5, orphanedFiles: 1, corruptEntries: 1 },
      samples: {
        broken: [{ id: "media-1", title: "Missing Poster", heatScore: 98, sources: ["netflix"] }],
        degraded: [{ id: "media-1", title: "Missing Poster", heatScore: 98, sources: ["netflix"] }],
        missing: [{ id: "media-1", title: "Missing Poster", heatScore: 98, sources: ["netflix"] }]
      }
    })
  })
})
