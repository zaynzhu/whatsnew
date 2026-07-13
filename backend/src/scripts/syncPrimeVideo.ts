import { primeVideoAdapter } from "../adapters/primeVideoAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

try {
  await runtimeSettings.load()
  const run = await runSourceSync(db, primeVideoAdapter)
  console.log(JSON.stringify(run, null, 2))
} finally {
  await db.$disconnect()
}
