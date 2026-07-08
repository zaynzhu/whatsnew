import { describe, expect, it } from "vitest"
import {
  SOURCE_HEALTH_ACCEPTANCE_STATUSES,
  SOURCE_HEALTH_REASON_CODES,
  SOURCE_HEALTH_RUN_STATUSES
} from "@whatsnew/shared/settings"

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
