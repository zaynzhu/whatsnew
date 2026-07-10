import { describe, expect, it, vi } from "vitest"
import { cleanupOrphanedMedia } from "../src/services/orphanedMediaCleanupService.js"

describe("cleanupOrphanedMedia", () => {
  it("previews only inactive source-owned media without releases or popularity", async () => {
    const database = {
      mediaItem: {
        findMany: vi.fn(async () => [
          { id: "old-1", titleDisplay: "Old Listing" },
          { id: "old-2", titleDisplay: "Old Movie (2022)" }
        ]),
        deleteMany: vi.fn()
      }
    }

    const result = await cleanupOrphanedMedia({
      database: database as never,
      sources: ["hulu", "disney_plus"]
    })

    expect(result).toEqual({
      matched: 2,
      deleted: 0,
      samples: ["Old Listing", "Old Movie (2022)"]
    })
    expect(database.mediaItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sourceRefs: {
          some: { source: { in: ["hulu", "disney_plus"] } },
          none: { isActive: true }
        },
        releases: { none: {} },
        popularitySignals: { none: {} }
      }
    }))
    expect(database.mediaItem.deleteMany).not.toHaveBeenCalled()
  })

  it("deletes the exact previewed ids only when apply is explicit", async () => {
    const database = {
      mediaItem: {
        findMany: vi.fn(async () => [{ id: "old-1", titleDisplay: "Old Listing" }]),
        deleteMany: vi.fn(async () => ({ count: 1 }))
      }
    }

    const result = await cleanupOrphanedMedia({
      database: database as never,
      sources: ["hulu"],
      apply: true
    })

    expect(result.deleted).toBe(1)
    expect(database.mediaItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["old-1"] } }
    })
  })
})
