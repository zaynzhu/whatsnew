import { describe, expect, it, vi } from "vitest"
import { verifyPosterImages } from "../src/services/posterVerificationService.js"
import { posterQuality } from "../src/services/posterHealthStateService.js"

describe("verifyPosterImages", () => {
  it("classifies genuinely small posters without flagging usable landscape art", () => {
    expect(posterQuality({ width: 141, height: 188 })).toBe("undersized")
    expect(posterQuality({ width: 540, height: 432 })).toBe("adequate")
    expect(posterQuality({ width: null, height: null })).toBe("unknown")
  })

  it("records healthy, stale and unavailable poster outcomes", async () => {
    const now = new Date("2026-07-11T00:00:00.000Z")
    const items = [
      {
        id: "healthy",
        titleDisplay: "Healthy Poster",
        posterUrl: "https://img.test/healthy.jpg",
        posterStatus: "unverified",
        posterCheckedAt: null,
        posterFailureCount: 0,
        posterWidth: null,
        posterHeight: null,
        posterQuality: "unknown"
      },
      {
        id: "stale",
        titleDisplay: "Stale Poster",
        posterUrl: "https://img.test/stale.jpg",
        posterStatus: "degraded",
        posterCheckedAt: new Date("2026-07-09T00:00:00.000Z"),
        posterFailureCount: 1,
        posterWidth: null,
        posterHeight: null,
        posterQuality: "unknown"
      },
      {
        id: "failed",
        titleDisplay: "Failed Poster",
        posterUrl: "https://img.test/failed.jpg",
        posterStatus: "degraded",
        posterCheckedAt: new Date("2026-07-09T00:00:00.000Z"),
        posterFailureCount: 1,
        posterWidth: null,
        posterHeight: null,
        posterQuality: "unknown"
      }
    ]
    const update = vi.fn(async () => ({}))
    const database = {
      mediaItem: {
        findMany: vi.fn(async () => items),
        update
      }
    }
    const getPoster = vi.fn(async (url: string) => {
      if (url.includes("failed")) throw new Error("unavailable")
      return {
        body: Buffer.from("image"),
        contentType: "image/jpeg",
        width: url.includes("healthy") ? 240 : 640,
        height: url.includes("healthy") ? 360 : 960,
        cacheHit: url.includes("stale"),
        cacheStatus: url.includes("stale") ? "stale" as const : "miss" as const
      }
    })

    const result = await verifyPosterImages({
      database: database as never,
      imageService: { getPoster },
      limit: 3,
      now: () => now
    })

    expect(result).toEqual({
      scanned: 3,
      healthy: 1,
      degraded: 1,
      failed: 1,
      adequate: 1,
      undersized: 1,
      unknown: 0,
      samples: ["Healthy Poster", "Stale Poster", "Failed Poster"]
    })
    expect(database.mediaItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 3,
      orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { posterStatus: "unverified" },
          expect.objectContaining({ posterStatus: "degraded" }),
          expect.objectContaining({ posterStatus: "broken" }),
          expect.objectContaining({ posterQuality: "unknown" })
        ])
      })
    }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "healthy" },
      data: expect.objectContaining({
        posterStatus: "healthy",
        posterCheckedAt: now,
        posterWidth: 240,
        posterHeight: 360,
        posterQuality: "undersized"
      })
    }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "stale" },
      data: expect.objectContaining({ posterStatus: "degraded", posterFailureCount: 2 })
    }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "failed" },
      data: expect.objectContaining({ posterStatus: "broken", posterFailureCount: 2 })
    }))
  })
})
