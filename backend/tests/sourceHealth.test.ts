import { describe, expect, it } from "vitest"
import {
  SOURCE_HEALTH_ACCEPTANCE_STATUSES,
  SOURCE_HEALTH_REASON_CODES,
  SOURCE_HEALTH_RUN_STATUSES
} from "@whatsnew/shared/settings"
import {
  healthScopeKey,
  registeredAdapters,
  registeredHealthScopes
} from "../src/adapters/adapterRegistry.js"

describe("source health shared contract", () => {
  it("exposes stable run, acceptance and reason code enums", () => {
    expect(SOURCE_HEALTH_RUN_STATUSES).toEqual(["none", "running", "success", "warning", "failed"])
    expect(SOURCE_HEALTH_ACCEPTANCE_STATUSES).toEqual(["passed", "degraded", "failed", "blocked"])
    expect(SOURCE_HEALTH_REASON_CODES).toEqual([
      "passed",
      "disabled",
      "missing_credentials",
      "not_implemented",
      "commercial",
      "restricted",
      "never_succeeded",
      "stale_success",
      "latest_failed_no_fresh_success",
      "latest_failed_with_fresh_success",
      "latest_running_no_fresh_success",
      "latest_running_with_fresh_success",
      "latest_warning",
      "empty_result",
      "manual_cache_missing",
      "manual_cache_ready"
    ])
  })
})

describe("source health registry", () => {
  it("registers health policy per adapter scope", () => {
    const traktScopes = registeredHealthScopes
      .filter((entry) => entry.sourceId === "trakt")
      .map((entry) => ({
        key: healthScopeKey(entry),
        scheduleGroup: entry.scheduleGroup,
        staleAfterHours: entry.healthPolicy.staleAfterHours,
        signalKinds: entry.healthPolicy.expectedSignalKinds
      }))

    expect(traktScopes).toEqual([
      {
        key: "trakt:popularity",
        scheduleGroup: "hourly",
        staleAfterHours: 6,
        signalKinds: ["community_trend"]
      },
      {
        key: "trakt:calendar",
        scheduleGroup: "daily",
        staleAfterHours: 36,
        signalKinds: ["release_calendar"]
      }
    ])
  })

  it("keeps health scope keys unique and includes manual IMDb health", () => {
    const keys = registeredHealthScopes.map((entry) => healthScopeKey(entry))
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain("imdb:datasets_cache")
    expect(registeredHealthScopes.find((entry) => healthScopeKey(entry) === "imdb:datasets_cache")).toMatchObject({
      scheduleGroup: "manual",
      healthPolicy: {
        staleAfterHours: null,
        expectedSignalKinds: ["metadata", "rating"],
        sampleStrategy: "local_state"
      }
    })
  })

  it("keeps every runnable adapter represented in the health scopes", () => {
    const healthKeys = new Set(registeredHealthScopes.map((entry) => healthScopeKey(entry)))
    for (const adapter of registeredAdapters) {
      expect(healthKeys.has(healthScopeKey(adapter))).toBe(true)
    }
  })
})
