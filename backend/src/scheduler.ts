import cron from "node-cron"
import { getEnabledAdapters } from "./adapters/adapterRegistry.js"
import { db } from "./config/db.js"
import { env } from "./config/env.js"
import { enrichMissingPosters } from "./services/tmdbPosterEnrichmentService.js"
import { runSourceSync } from "./services/sourceSyncService.js"
import { runtimeSettings } from "./settings/runtimeSettingsService.js"

const AUTOMATIC_POSTER_LIMIT = 40

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

export async function runInitialSync() {
  for (const entry of getEnabledAdapters()) {
    await runSourceSync(db, entry.adapter)
  }
  await enrichPostersAfterSync()
}

export function registerScheduler() {
  cron.schedule("0 * * * *", async () => {
    for (const entry of getEnabledAdapters("hourly")) {
      await runSourceSync(db, entry.adapter)
    }
    await enrichPostersAfterSync()
  })

  cron.schedule("15 9 * * *", async () => {
    for (const entry of getEnabledAdapters("daily")) {
      await runSourceSync(db, entry.adapter)
    }
    await enrichPostersAfterSync()
  }, { timezone: "Asia/Shanghai" })

  if (env.SYNC_ON_START) {
    runInitialSync().catch((error) => {
      console.error("Initial sync failed", error)
    })
  }
}
