import { describe, expect, it, vi } from "vitest"
import { assertManualSourceEnabled } from "../src/services/manualSourceSyncGuard.js"

describe("manual source sync guard", () => {
  it("allows an enabled source", () => {
    const sourceEnabled = vi.fn(() => true)

    expect(() => assertManualSourceEnabled({ sourceEnabled }, "iqiyi")).not.toThrow()
    expect(sourceEnabled).toHaveBeenCalledWith("iqiyi")
  })

  it("rejects a disabled main-database source", () => {
    const sourceEnabled = vi.fn(() => false)

    expect(() => assertManualSourceEnabled({ sourceEnabled }, "youku"))
      .toThrow("国内源验证请使用 sandbox:sync")
  })
})
