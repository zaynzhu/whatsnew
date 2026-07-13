import { youkuAdapter } from "../adapters/youkuAdapter.js"
import { db } from "../config/db.js"
import { assertManualSourceEnabled } from "../services/manualSourceSyncGuard.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()
assertManualSourceEnabled(runtimeSettings, "youku")
const run = await runSourceSync(db, youkuAdapter)

console.log(`Youku sync complete: ${run.itemCount} items, status=${run.status}`)
await db.$disconnect()

if (run.status !== "success") {
  process.exit(1)
}
