import { mgtvAdapter } from "../adapters/mgtvAdapter.js"
import { db } from "../config/db.js"
import { assertManualSourceEnabled } from "../services/manualSourceSyncGuard.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()
assertManualSourceEnabled(runtimeSettings, "mango_tv")
const run = await runSourceSync(db, mgtvAdapter)

console.log(`芒果TV sync complete: ${run.itemCount} items, status=${run.status}`)
await db.$disconnect()

if (run.status !== "success") {
  process.exit(1)
}
