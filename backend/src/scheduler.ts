import cron from "node-cron"
import { demoSeedAdapter } from "./adapters/demoSeedAdapter.js"
import { db } from "./config/db.js"
import { env } from "./config/env.js"
import { runSourceSync } from "./services/sourceSyncService.js"

export async function runInitialSync() {
  await runSourceSync(db, demoSeedAdapter)
}

export function registerScheduler() {
  cron.schedule("0 * * * *", async () => {
    await runSourceSync(db, demoSeedAdapter)
  })

  if (env.SYNC_ON_START) {
    runInitialSync().catch((error) => {
      console.error("Initial sync failed", error)
    })
  }
}
