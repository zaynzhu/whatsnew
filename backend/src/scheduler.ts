import cron from "node-cron"
import { iqiyiAdapter } from "./adapters/iqiyiAdapter.js"
import { tmdbAdapter } from "./adapters/tmdbAdapter.js"
import { tvmazeAdapter } from "./adapters/tvmazeAdapter.js"
import { youkuAdapter } from "./adapters/youkuAdapter.js"
import { db } from "./config/db.js"
import { env } from "./config/env.js"
import { runSourceSync } from "./services/sourceSyncService.js"

const scheduledAdapters = [tvmazeAdapter, tmdbAdapter, youkuAdapter, iqiyiAdapter]

export async function runInitialSync() {
  for (const adapter of scheduledAdapters) {
    await runSourceSync(db, adapter)
  }
}

export function registerScheduler() {
  cron.schedule("0 * * * *", async () => {
    for (const adapter of scheduledAdapters) {
      await runSourceSync(db, adapter)
    }
  })

  if (env.SYNC_ON_START) {
    runInitialSync().catch((error) => {
      console.error("Initial sync failed", error)
    })
  }
}
