import cron from "node-cron"
import { getEnabledAdapters } from "./adapters/adapterRegistry.js"
import { db } from "./config/db.js"
import { env } from "./config/env.js"
import {
  reconcileDuplicateStableIdentities,
  reconcileSharedDateTitles,
  reconcileUniqueTitleIdentities
} from "./services/duplicateIdentityService.js"
import { reconcileMediaStatuses } from "./services/mediaStatusReconciliationService.js"
import { cleanupOrphanedMedia } from "./services/orphanedMediaCleanupService.js"
import { verifyPosterImages } from "./services/posterVerificationService.js"
import {
  prunePosterCache,
  prunePosterVariantCache
} from "./services/posterVariantCacheMaintenanceService.js"
import { reconcileReleaseStatuses } from "./services/releaseStatusReconciliationService.js"
import { enrichMissingPosters } from "./services/tmdbPosterEnrichmentService.js"
import { runSourceSync } from "./services/sourceSyncService.js"
import { runtimeSettings } from "./settings/runtimeSettingsService.js"
import {
  schedulerConfig,
  schedulerSettingsView,
  SCHEDULER_TIMEZONE
} from "./settings/schedulerSettings.js"

const AUTOMATIC_POSTER_LIMIT = 40
const HOURLY_POSTER_VERIFICATION_LIMIT = 20
const DAILY_POSTER_VERIFICATION_LIMIT = 100
const PLATFORM_SNAPSHOT_SOURCES = ["disney_plus", "hulu", "max", "prime_video"]
const scheduledTasks: Array<{ stop(): void }> = []
let schedulerStarted = false

async function runScheduledAdapters(scheduleGroup?: "hourly" | "daily") {
  for (const entry of getEnabledAdapters(scheduleGroup)) {
    try {
      await runSourceSync(db, entry.adapter)
    } catch (error) {
      console.error(`Scheduled ${entry.sourceId}/${entry.adapter.scope ?? "all"} sync failed`, error)
    }
  }
}

async function maintainDataQuality(cleanPlatformOrphans: boolean) {
  try {
    await reconcileMediaStatuses({ database: db, apply: true })
    await reconcileReleaseStatuses({ database: db, apply: true })
    await reconcileDuplicateStableIdentities({ database: db, apply: true })
    await reconcileUniqueTitleIdentities({ database: db, apply: true })
    await reconcileSharedDateTitles({ database: db, apply: true })
    if (cleanPlatformOrphans) {
      await cleanupOrphanedMedia({
        database: db,
        sources: PLATFORM_SNAPSHOT_SOURCES,
        apply: true
      })
    }
  } catch (error) {
    console.error("Automatic data quality maintenance failed", error)
  }
}

async function enrichPostersAfterSync() {
  if (!runtimeSettings.sourceRunnable("tmdb")) return

  try {
    const result = await enrichMissingPosters({
      database: db,
      limit: AUTOMATIC_POSTER_LIMIT
    })
    if (result.failed > 0) {
      console.warn("Automatic poster enrichment completed with failures", {
        failed: result.failed,
        failures: result.failures
      })
    }
  } catch (error) {
    console.error("Automatic poster enrichment failed", error)
  }
}

async function verifyPostersAfterSync(limit: number) {
  try {
    await verifyPosterImages({
      database: db,
      limit
    })
  } catch (error) {
    console.error("Automatic poster verification failed", error)
  }
}

async function prunePosterCaches() {
  try {
    await Promise.all([
      prunePosterCache({ apply: true }),
      prunePosterVariantCache({ apply: true })
    ])
  } catch (error) {
    console.error("Automatic poster cache maintenance failed", error)
  }
}

export async function runInitialSync() {
  await runScheduledAdapters()
  await maintainDataQuality(true)
  await enrichPostersAfterSync()
  await verifyPostersAfterSync(DAILY_POSTER_VERIFICATION_LIMIT)
  await prunePosterCaches()
}

function stopScheduledTasks() {
  for (const task of scheduledTasks.splice(0)) task.stop()
}

function scheduleRecurringJobs() {
  stopScheduledTasks()
  const config = schedulerConfig(runtimeSettings)

  scheduledTasks.push(cron.schedule(config.hourlyCron, async () => {
    await runScheduledAdapters("hourly")
    await maintainDataQuality(false)
    await enrichPostersAfterSync()
    await verifyPostersAfterSync(HOURLY_POSTER_VERIFICATION_LIMIT)
  }, { timezone: SCHEDULER_TIMEZONE }))

  scheduledTasks.push(cron.schedule(config.dailyCron, async () => {
    await runScheduledAdapters("daily")
    await maintainDataQuality(true)
    await enrichPostersAfterSync()
    await verifyPostersAfterSync(DAILY_POSTER_VERIFICATION_LIMIT)
    await prunePosterCaches()
  }, { timezone: SCHEDULER_TIMEZONE }))
}

export function refreshScheduler() {
  if (!schedulerStarted) return
  scheduleRecurringJobs()
}

export function schedulerView() {
  return schedulerSettingsView(
    runtimeSettings,
    schedulerStarted,
    env.APP_ENVIRONMENT === "china_sandbox"
  )
}

export function registerScheduler() {
  schedulerStarted = true
  scheduleRecurringJobs()

  if (env.SYNC_ON_START) {
    runInitialSync().catch((error) => {
      console.error("Initial sync failed", error)
    })
  }
}

export const schedulerControl = {
  view: schedulerView,
  refresh: refreshScheduler
}
