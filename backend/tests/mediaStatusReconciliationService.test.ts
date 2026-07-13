import { describe, expect, it, vi } from "vitest"
import { normalizeMediaStatusForDate } from "../src/domain/mediaStatus.js"
import { reconcileMediaStatuses } from "../src/services/mediaStatusReconciliationService.js"

describe("normalizeMediaStatusForDate", () => {
  it("用首发日期约束互相矛盾的作品状态", () => {
    expect(normalizeMediaStatusForDate("released", "2026-07-20", "2026-07-13")).toBe("upcoming")
    expect(normalizeMediaStatusForDate("upcoming", "2026-07-12", "2026-07-13")).toBe("released")
    expect(normalizeMediaStatusForDate("upcoming", "2026-07-13", "2026-07-13")).toBe("released")
  })

  it("保留已开播作品更具体的生命周期状态和非精确日期", () => {
    expect(normalizeMediaStatusForDate("ongoing", "2024-01-01", "2026-07-13")).toBe("ongoing")
    expect(normalizeMediaStatusForDate("ended", "2024-01-01", "2026-07-13")).toBe("ended")
    expect(normalizeMediaStatusForDate("upcoming", "2027", "2026-07-13")).toBe("upcoming")
  })
})

describe("reconcileMediaStatuses", () => {
  it("预览并按目标状态批量修复日期矛盾", async () => {
    const rows = [
      { id: "past", titleDisplay: "Past", firstReleaseDate: "2026-07-12", status: "upcoming" },
      { id: "future", titleDisplay: "Future", firstReleaseDate: "2026-07-20", status: "released" },
      { id: "stable", titleDisplay: "Stable", firstReleaseDate: "2024-01-01", status: "ended" }
    ]
    const database = {
      mediaItem: {
        findMany: vi.fn(async () => rows),
        updateMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({
          count: where.id.in.length
        }))
      }
    }

    const preview = await reconcileMediaStatuses({
      database: database as never,
      now: new Date("2026-07-13T08:00:00+08:00")
    })
    expect(preview).toMatchObject({
      scanned: 3,
      matched: 2,
      updated: 0,
      transitions: {
        "upcoming->released": 1,
        "released->upcoming": 1
      }
    })
    expect(database.mediaItem.updateMany).not.toHaveBeenCalled()

    const applied = await reconcileMediaStatuses({
      database: database as never,
      apply: true,
      now: new Date("2026-07-13T08:00:00+08:00")
    })
    expect(applied.updated).toBe(2)
    expect(database.mediaItem.updateMany).toHaveBeenCalledTimes(2)
  })
})
