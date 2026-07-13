import cron from "node-cron"
import { getEnabledAdapters } from "./adapters/adapterRegistry.js"
import { db } from "./config/db.js"
import { env } from "./config/env.js"
import { reconcileDuplicateTmdbIdentities } from "./services/duplicateIdentityService.js"
import { cleanupOrphanedMedia } from "./services/orphanedMediaCleanupService.js"
import { verifyPosterImages } from "./services/posterVerificationService.js"
import { enrichMissingPosters } from "./services/tmdbPosterEnrichmentService.js"
import { runSourceSync } from "./services/sourceSyncService.js"
import { runtimeSettings } from "./settings/runtimeSettingsService.js"
import {
  schedulerConfig,
  schedulerSettingsView,
  SCHEDULER_TIMEZONE
} from "./settings/schedulerSettings.js"

const AUTOMATIC_POSTER_LIMIT = 40
const AUTOMATIC_POSTER_VERIFICATION_LIMIT = 20
const PLATFORM_SNAPSHOT_SOURCES = ["disney_plus", "hulu", "max"]
const scheduledTasks: Array<{ stop(): void }> = []
let schedulerStarted = false

async function maintainDataQuality(cleanPlatformOrphans: boolean) {
  try {
    await reconcileDuplicateTmdbIdentities({ database: db, apply: true })
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
    await enrichMissingPosters({
      database: db,
      limit: AUTOMATIC_POSTER_LIMIT
    })
  } catch (error) {
    console.error("Automatic poster enrichment failed", error)
  }
}

async function verifyPostersAfterSync() {
  try {
    await verifyPosterImages({
      database: db,
      limit: AUTOMATIC_POSTER_VERIFICATION_LIMIT
    })
  } catch (error) {
    console.error("Automatic poster verification failed", error)
  }
}

export async function runInitialSync() {
  for (const entry of getEnabledAdapters()) {
    await runSourceSync(db, entry.adapter)
  }
  await maintainDataQuality(true)
  await enrichPostersAfterSync()
  await verifyPostersAfterSync()
}

function stopScheduledTasks() {
  for (const task of scheduledTasks.splice(0)) task.stop()
}

function scheduleRecurringJobs() {
  stopScheduledTasks()
  const config = schedulerConfig(runtimeSettings)

  scheduledTasks.push(cron.schedule(config.hourlyCron, async () => {
    for (const entry of getEnabledAdapters("hourly")) {
      await runSourceSync(db, entry.adapter)
    }
    await maintainDataQuality(false)
    await enrichPostersAfterSync()
  }, { timezone: SCHEDULER_TIMEZONE }))

  scheduledTasks.push(cron.schedule(config.dailyCron, async () => {
    for (const entry of getEnabledAdapters("daily")) {
      await runSourceSync(db, entry.adapter)
    }
    await maintainDataQuality(true)
    await enrichPostersAfterSync()
    await verifyPostersAfterSync()
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
