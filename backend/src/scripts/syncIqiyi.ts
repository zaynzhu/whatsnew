import { iqiyiAdapter } from "../adapters/iqiyiAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"

const run = await runSourceSync(db, iqiyiAdapter)

console.log(`iQIYI sync complete: ${run.itemCount} items, status=${run.status}`)
await db.$disconnect()

if (run.status !== "success") {
  process.exit(1)
}
