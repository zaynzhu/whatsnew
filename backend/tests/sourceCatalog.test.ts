import { describe, expect, it } from "vitest"
import { SOURCE_CATALOG, getSourceDefinition } from "../src/settings/sourceCatalog.js"

describe("source catalog", () => {
  it("lists the approved active and planned sources without pretending planned sources are syncable", () => {
    expect(SOURCE_CATALOG).toHaveLength(22)
    expect(SOURCE_CATALOG.filter((source) => source.implementationStatus === "active").map((source) => source.id)).toEqual([
      "tvmaze",
      "tmdb",
      "trakt",
      "thetvdb",
      "netflix",
      "hulu",
      "disney_plus",
      "max",
      "apple_tv_plus",
      "youku",
      "iqiyi",
      "mango_tv",
      "bilibili",
      "douban"
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
    expect(getSourceDefinition("imdb")).toMatchObject({
      implementationStatus: "planned",
      supportsSync: false,
      supportsEnable: false,
      localSettingKeys: ["IMDB_DATASET_CACHE_DIR"]
    })
    expect(getSourceDefinition("imdb").manualCommands).toEqual([
      expect.objectContaining({
        label: "下载或刷新 IMDb 缓存",
        command: "npm run download:imdb --workspace backend"
      }),
      expect.objectContaining({
        label: "同步 IMDb 本地缓存",
        command: "npm run sync:imdb --workspace backend"
      })
    ])
    expect(getSourceDefinition("tmdb").manualCommands).toEqual([])
    expect(getSourceDefinition("justwatch").implementationStatus).toBe("commercial")
    expect(getSourceDefinition("tencent").supportsSync).toBe(false)
    expect(getSourceDefinition("hulu")).toMatchObject({
      implementationStatus: "active",
      supportsSync: true,
      supportsEnable: true,
      defaultEnabled: false,
      scheduleGroups: ["daily"],
      testUrl: "https://press.hulu.com/schedule/"
    })
    expect(getSourceDefinition("hulu").semantics).toMatchObject({
      signalKinds: ["platform_catalog", "release_calendar"],
      access: "public_page"
    })
    expect(getSourceDefinition("disney_plus")).toMatchObject({
      implementationStatus: "active",
      supportsSync: true,
      supportsEnable: true,
      defaultEnabled: false,
      scheduleGroups: ["daily"],
      testUrl: "https://www.disneyplus.com/explore/articles/new-to-disney-plus"
    })
    expect(getSourceDefinition("max")).toMatchObject({
      implementationStatus: "active",
      supportsSync: true,
      supportsEnable: true,
      defaultEnabled: false,
      scheduleGroups: ["daily"],
      testUrl: "https://press.wbd.com/us/media-release/hbo-max/whats-new-hbo-max-july"
    })
    expect(getSourceDefinition("prime_video").semantics.signalKinds).toEqual(["platform_catalog"])
    expect(getSourceDefinition("apple_tv_plus").semantics.signalKinds).toEqual(["news_signal"])
    expect(getSourceDefinition("apple_tv_plus").supportsSync).toBe(true)
  })

  it("describes source semantics without implying a fake global ranking", () => {
    expect((getSourceDefinition("trakt") as any).semantics).toMatchObject({
      signalKinds: expect.arrayContaining(["community_trend", "release_calendar"]),
      access: "free_key"
    })
    expect((getSourceDefinition("youku") as any).semantics.signalKinds).toEqual(
      expect.arrayContaining(["platform_catalog", "platform_rank"])
    )
    expect((getSourceDefinition("justwatch") as any).semantics.access).toBe("application")
    expect((getSourceDefinition("flixpatrol") as any).semantics.access).toBe("commercial")
  })

  it("keeps Maoyan and Dengta as non-syncable restricted market signal sources", () => {
    expect(getSourceDefinition("maoyan_pro")).toMatchObject({
      name: "猫眼专业版",
      implementationStatus: "planned",
      supportsSync: false,
      supportsEnable: false,
      defaultProxyMode: "direct"
    })
    expect(getSourceDefinition("maoyan_pro").semantics).toMatchObject({
      signalKinds: expect.arrayContaining(["box_office", "platform_rank"]),
      access: "restricted_page"
    })
    expect(getSourceDefinition("dengta_pro").semantics).toMatchObject({
      signalKinds: expect.arrayContaining(["box_office", "platform_rank"]),
      access: "restricted_page"
    })
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
