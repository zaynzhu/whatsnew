import { getEnabledAdaptersForSource } from "../adapters/adapterRegistry.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

let failed = false

try {
  await runtimeSettings.load()
  const entries = getEnabledAdaptersForSource("trakt")
  if (entries.length === 0) failed = true

  for (const entry of entries) {
    const run = await runSourceSync(db, entry.adapter)
    console.log(`scope=${entry.adapter.scope ?? "all"} status=${run.status} items=${run.itemCount}`)
    if (run.status === "failed") failed = true
  }
} catch {
  failed = true
} finally {
  await db.$disconnect()
}

if (failed) process.exit(1)
