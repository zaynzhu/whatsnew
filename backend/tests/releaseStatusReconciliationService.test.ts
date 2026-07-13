import { describe, expect, it, vi } from "vitest"
import { normalizeReleaseStatusForDate } from "../src/domain/releaseStatus.js"
import { reconcileReleaseStatuses } from "../src/services/releaseStatusReconciliationService.js"

describe("normalizeReleaseStatusForDate", () => {
  it("按日期规范待播、今日播出和已上线状态", () => {
    expect(normalizeReleaseStatusForDate("available", "2026-07-20", "2026-07-13")).toBe("upcoming")
    expect(normalizeReleaseStatusForDate("upcoming", "2026-07-13", "2026-07-13")).toBe("airing_today")
    expect(normalizeReleaseStatusForDate("available", "2026-07-13", "2026-07-13")).toBe("available")
    expect(normalizeReleaseStatusForDate("airing_today", "2026-07-12", "2026-07-13")).toBe("available")
  })

  it("保留延期、完结和无精确日期状态", () => {
    expect(normalizeReleaseStatusForDate("delayed", "2026-07-12", "2026-07-13")).toBe("delayed")
    expect(normalizeReleaseStatusForDate("ended", "2026-07-20", "2026-07-13")).toBe("ended")
    expect(normalizeReleaseStatusForDate("announced", null, "2026-07-13")).toBe("announced")
  })
})

describe("reconcileReleaseStatuses", () => {
  it("预览并按目标状态批量修复排期矛盾", async () => {
    const rows = [
      {
        id: "past",
        releaseDate: "2026-07-12",
        releaseStatus: "upcoming",
        platform: "Test",
        mediaItem: { titleDisplay: "Past" }
      },
      {
        id: "today",
        releaseDate: "2026-07-13",
        releaseStatus: "upcoming",
        platform: "Test",
        mediaItem: { titleDisplay: "Today" }
      },
      {
        id: "stable",
        releaseDate: "2026-07-20",
        releaseStatus: "upcoming",
        platform: "Test",
        mediaItem: { titleDisplay: "Stable" }
      }
    ]
    const database = {
      release: {
        findMany: vi.fn(async () => rows),
        updateMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({
          count: where.id.in.length
        }))
      }
    }

    const preview = await reconcileReleaseStatuses({
      database: database as never,
      now: new Date("2026-07-13T08:00:00+08:00")
    })
    expect(preview).toMatchObject({
      scanned: 3,
      matched: 2,
      updated: 0,
      transitions: {
        "upcoming->available": 1,
        "upcoming->airing_today": 1
      }
    })
    expect(database.release.updateMany).not.toHaveBeenCalled()

    const applied = await reconcileReleaseStatuses({
      database: database as never,
      apply: true,
      now: new Date("2026-07-13T08:00:00+08:00")
    })
    expect(applied.updated).toBe(2)
    expect(database.release.updateMany).toHaveBeenCalledTimes(2)
  })
})
