import { describe, expect, it } from "vitest"
import {
  schedulerConfig,
  schedulerSettingsView,
  validateSchedulerSetting
} from "../src/settings/schedulerSettings.js"

function settings(values: Record<string, string>) {
  return {
    get(key: string, fallback = "") {
      return values[key] ?? fallback
    },
    getBoolean() {
      return false
    },
    sourceProxyMode() {
      return "inherit" as const
    }
  }
}

describe("scheduler settings", () => {
  it("builds cron expressions from validated settings", () => {
    expect(schedulerConfig(settings({
      SCHEDULER_HOURLY_INTERVAL_HOURS: "3",
      SCHEDULER_DAILY_TIME: "06:40"
    }))).toEqual({
      hourlyIntervalHours: 3,
      dailyTime: "06:40",
      hourlyCron: "0 */3 * * *",
      dailyCron: "40 6 * * *"
    })
  })

  it("rejects unsupported intervals and invalid daily times", () => {
    expect(() => validateSchedulerSetting("SCHEDULER_HOURLY_INTERVAL_HOURS", "5"))
      .toThrow("小时级调度间隔无效")
    expect(() => validateSchedulerSetting("SCHEDULER_DAILY_TIME", "24:00"))
      .toThrow("日级调度时间无效")
  })

  it("returns the next Shanghai hourly and daily runs", () => {
    const view = schedulerSettingsView(
      settings({
        SCHEDULER_HOURLY_INTERVAL_HOURS: "3",
        SCHEDULER_DAILY_TIME: "09:15"
      }),
      true,
      false,
      new Date("2026-07-13T01:20:00.000Z")
    )

    expect(view.nextHourlyRunAt).toBe("2026-07-13T04:00:00.000Z")
    expect(view.nextDailyRunAt).toBe("2026-07-14T01:15:00.000Z")
  })

  it("does not expose next runs while the sandbox scheduler is forced off", () => {
    expect(schedulerSettingsView(settings({}), false, true)).toMatchObject({
      enabled: false,
      forcedDisabled: true,
      nextHourlyRunAt: null,
      nextDailyRunAt: null
    })
  })
})
