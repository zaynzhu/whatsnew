import { describe, expect, it } from "vitest"
import { SOURCE_CATALOG, getSourceDefinition } from "../src/settings/sourceCatalog.js"

describe("source catalog", () => {
  it("lists the approved active and planned sources without pretending planned sources are syncable", () => {
    expect(SOURCE_CATALOG).toHaveLength(20)
    expect(SOURCE_CATALOG.filter((source) => source.implementationStatus === "active").map((source) => source.id)).toEqual([
      "tvmaze",
      "tmdb",
      "trakt",
      "thetvdb",
      "netflix",
      "youku",
      "iqiyi"
    ])
    expect(getSourceDefinition("trakt")).toMatchObject({
      implementationStatus: "active",
      supportsSync: true,
      supportsEnable: true,
      defaultEnabled: true,
      credentialKeys: ["TRAKT_CLIENT_ID"],
      scheduleGroups: ["hourly", "daily"]
    })
    expect(getSourceDefinition("thetvdb")).toMatchObject({
      implementationStatus: "active",
      supportsSync: true,
      supportsEnable: true,
      defaultEnabled: false,
      scheduleGroups: ["daily"],
      credentialKeys: ["THETVDB_API_KEY"],
      optionalCredentialKeys: ["THETVDB_PIN"]
    })
    expect(getSourceDefinition("justwatch").implementationStatus).toBe("commercial")
    expect(getSourceDefinition("tencent").supportsSync).toBe(false)
  })

  it("assigns sources to schedule groups with safe defaults", () => {
    expect(getSourceDefinition("netflix").scheduleGroups).toEqual(["daily"])
    expect(["tvmaze", "tmdb", "youku", "iqiyi"].map((sourceId) => {
      return getSourceDefinition(sourceId).scheduleGroups
    })).toEqual([["hourly"], ["hourly"], ["hourly"], ["hourly"]])
    expect(getSourceDefinition("tmdb").defaultEnabled).toBe(true)
    expect(getSourceDefinition("trakt").defaultEnabled).toBe(true)
    expect(getSourceDefinition("trakt").scheduleGroups).toEqual(["hourly", "daily"])
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
