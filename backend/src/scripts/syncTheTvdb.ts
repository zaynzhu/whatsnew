import { getImplementedAdaptersForSource } from "../adapters/adapterRegistry.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

let exitCode = 0

try {
  await runtimeSettings.load()
  const [entry] = getImplementedAdaptersForSource("thetvdb")

  if (!entry) {
    console.log("scope=updates status=not_implemented items=0")
    exitCode = 1
  } else if (!runtimeSettings.sourceEnabled("thetvdb")) {
    console.log(`scope=${entry.adapter.scope ?? "all"} status=disabled items=0`)
    exitCode = 1
  } else if (runtimeSettings.missingCredentials("thetvdb").length > 0) {
    console.log(`scope=${entry.adapter.scope ?? "all"} status=missing_credentials items=0`)
    exitCode = 1
  } else {
    const run = await runSourceSync(db, entry.adapter)
    console.log(`scope=${entry.adapter.scope ?? "all"} status=${run.status} items=${run.itemCount}`)
    if (run.status === "failed") exitCode = 1
  }
} catch {
  console.log("scope=updates status=failed items=0")
  exitCode = 1
} finally {
  await db.$disconnect()
}

if (exitCode !== 0) process.exit(exitCode)
