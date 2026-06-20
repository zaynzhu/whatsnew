import { netflixTop10Adapter } from "../adapters/netflixTop10Adapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()

try {
  const run = await runSourceSync(db, netflixTop10Adapter)
  console.log(JSON.stringify({
    source: run.source,
    status: run.status,
    itemCount: run.itemCount,
    durationMs: run.durationMs
  }))

  if (run.status !== "success") process.exitCode = 1
} finally {
  await db.$disconnect()
}
