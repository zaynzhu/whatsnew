import { describe, expect, it } from "vitest"
import { SOURCE_CATALOG, getSourceDefinition } from "../src/settings/sourceCatalog.js"

describe("source catalog", () => {
  it("lists the approved active and planned sources without pretending planned sources are syncable", () => {
    expect(SOURCE_CATALOG).toHaveLength(20)
    expect(SOURCE_CATALOG.filter((source) => source.implementationStatus === "active").map((source) => source.id)).toEqual([
      "tvmaze",
      "tmdb",
      "youku",
      "iqiyi"
    ])
    expect(getSourceDefinition("trakt").implementationStatus).toBe("blocked")
    expect(getSourceDefinition("justwatch").implementationStatus).toBe("commercial")
    expect(getSourceDefinition("tencent").supportsSync).toBe(false)
  })

  it("defaults domestic sources to direct and international sources to inherited proxy", () => {
    expect(getSourceDefinition("youku").defaultProxyMode).toBe("direct")
    expect(getSourceDefinition("tmdb").defaultProxyMode).toBe("inherit")
  })

  it("uses approved base URL keys and generated keys for remaining sources", () => {
    expect(getSourceDefinition("tvmaze").baseUrlKey).toBe("TVMAZE_BASE_URL")
    expect(getSourceDefinition("prime_video").baseUrlKey).toBe("SOURCE_PRIME_VIDEO_BASE_URL")
  })

  it("rejects an unknown source", () => {
    expect(() => getSourceDefinition("unknown")).toThrow("未知数据源: unknown")
  })
})
