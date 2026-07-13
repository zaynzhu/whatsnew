import type { SchedulerSettingsView } from "@whatsnew/shared/settings"
import type { SettingsReader } from "./runtimeSettingsService.js"

export const SCHEDULER_HOURLY_INTERVAL_KEY = "SCHEDULER_HOURLY_INTERVAL_HOURS"
export const SCHEDULER_DAILY_TIME_KEY = "SCHEDULER_DAILY_TIME"
export const SCHEDULER_TIMEZONE = "Asia/Shanghai" as const
export const SCHEDULER_HOURLY_INTERVALS = [1, 2, 3, 4, 6, 12] as const
export const DEFAULT_HOURLY_INTERVAL_HOURS = 1
export const DEFAULT_DAILY_TIME = "09:15"

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

export type SchedulerConfig = {
  hourlyIntervalHours: number
  dailyTime: string
  hourlyCron: string
  dailyCron: string
}

function validDailyTime(value: string): boolean {
  const match = value.match(/^(\d{2}):(\d{2})$/)
  if (!match) return false

  return Number(match[1]) <= 23 && Number(match[2]) <= 59
}

export function validateSchedulerSetting(key: string, value: string): void {
  if (value === "") return

  if (key === SCHEDULER_HOURLY_INTERVAL_KEY) {
    if (!SCHEDULER_HOURLY_INTERVALS.includes(Number(value) as typeof SCHEDULER_HOURLY_INTERVALS[number])) {
      throw new Error(`小时级调度间隔无效: ${value}`)
    }
  }

  if (key === SCHEDULER_DAILY_TIME_KEY && !validDailyTime(value)) {
    throw new Error(`日级调度时间无效: ${value}`)
  }
}

export function schedulerConfig(settings: SettingsReader): SchedulerConfig {
  const configuredInterval = Number(settings.get(
    SCHEDULER_HOURLY_INTERVAL_KEY,
    String(DEFAULT_HOURLY_INTERVAL_HOURS)
  ))
  const hourlyIntervalHours = SCHEDULER_HOURLY_INTERVALS.includes(
    configuredInterval as typeof SCHEDULER_HOURLY_INTERVALS[number]
  ) ? configuredInterval : DEFAULT_HOURLY_INTERVAL_HOURS
  const configuredDailyTime = settings.get(SCHEDULER_DAILY_TIME_KEY, DEFAULT_DAILY_TIME)
  const dailyTime = validDailyTime(configuredDailyTime) ? configuredDailyTime : DEFAULT_DAILY_TIME
  const [dailyHour, dailyMinute] = dailyTime.split(":").map(Number)

  return {
    hourlyIntervalHours,
    dailyTime,
    hourlyCron: hourlyIntervalHours === 1 ? "0 * * * *" : `0 */${hourlyIntervalHours} * * *`,
    dailyCron: `${dailyMinute} ${dailyHour} * * *`
  }
}

function fromShanghaiDate(date: Date): Date {
  return new Date(date.getTime() - SHANGHAI_OFFSET_MS)
}

function nextHourlyRun(now: Date, intervalHours: number): Date {
  const shanghai = new Date(now.getTime() + SHANGHAI_OFFSET_MS)
  shanghai.setUTCMinutes(0, 0, 0)
  shanghai.setUTCHours(shanghai.getUTCHours() + 1)
  while (shanghai.getUTCHours() % intervalHours !== 0) {
    shanghai.setUTCHours(shanghai.getUTCHours() + 1)
  }

  return fromShanghaiDate(shanghai)
}

function nextDailyRun(now: Date, dailyTime: string): Date {
  const [hour, minute] = dailyTime.split(":").map(Number)
  const shanghai = new Date(now.getTime() + SHANGHAI_OFFSET_MS)
  const candidate = new Date(shanghai)
  candidate.setUTCHours(hour, minute, 0, 0)
  if (candidate.getTime() <= shanghai.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1)

  return fromShanghaiDate(candidate)
}

export function schedulerSettingsView(
  settings: SettingsReader,
  enabled: boolean,
  forcedDisabled: boolean,
  now = new Date()
): SchedulerSettingsView {
  const config = schedulerConfig(settings)

  return {
    enabled,
    forcedDisabled,
    hourlyIntervalHours: config.hourlyIntervalHours,
    dailyTime: config.dailyTime,
    timezone: SCHEDULER_TIMEZONE,
    nextHourlyRunAt: enabled ? nextHourlyRun(now, config.hourlyIntervalHours).toISOString() : null,
    nextDailyRunAt: enabled ? nextDailyRun(now, config.dailyTime).toISOString() : null
  }
}
