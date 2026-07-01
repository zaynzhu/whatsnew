import { appleTvPlusAdapter } from "../adapters/appleTvPlusAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()
const run = await runSourceSync(db, appleTvPlusAdapter)

console.log(`Apple TV+ sync complete: ${run.itemCount} items, status=${run.status}`)
await db.$disconnect()

if (run.status !== "success") {
  process.exit(1)
}