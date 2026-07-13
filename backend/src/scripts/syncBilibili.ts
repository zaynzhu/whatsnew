import { bilibiliAdapter } from "../adapters/bilibiliAdapter.js"
import { db } from "../config/db.js"
import { assertManualSourceEnabled } from "../services/manualSourceSyncGuard.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()
assertManualSourceEnabled(runtimeSettings, "bilibili")
const run = await runSourceSync(db, bilibiliAdapter)

console.log(`哔哩哔哩 sync complete: ${run.itemCount} items, status=${run.status}`)
await db.$disconnect()

if (run.status !== "success") {
  process.exit(1)
}
