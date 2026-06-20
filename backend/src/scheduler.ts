import cron from "node-cron"
import { getEnabledAdapters } from "./adapters/adapterRegistry.js"
import { db } from "./config/db.js"
import { env } from "./config/env.js"
import { runSourceSync } from "./services/sourceSyncService.js"

export async function runInitialSync() {
  for (const adapter of getEnabledAdapters()) {
    await runSourceSync(db, adapter)
  }
}

export function registerScheduler() {
  cron.schedule("0 * * * *", async () => {
    for (const adapter of getEnabledAdapters()) {
      await runSourceSync(db, adapter)
    }
  })

  if (env.SYNC_ON_START) {
    runInitialSync().catch((error) => {
      console.error("Initial sync failed", error)
    })
  }
}
