import { tencentVideoAdapter } from "../adapters/tencentVideoAdapter.js"
import { db } from "../config/db.js"
import { assertManualSourceEnabled } from "../services/manualSourceSyncGuard.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()
assertManualSourceEnabled(runtimeSettings, "tencent")
const run = await runSourceSync(db, tencentVideoAdapter)

console.log(`腾讯视频 sync complete: ${run.itemCount} items, status=${run.status}`)
await db.$disconnect()

if (run.status !== "success") {
  process.exit(1)
}
