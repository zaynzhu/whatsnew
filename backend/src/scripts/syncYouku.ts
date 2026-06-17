import { youkuAdapter } from "../adapters/youkuAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"

const run = await runSourceSync(db, youkuAdapter)

console.log(`Youku sync complete: ${run.itemCount} items, status=${run.status}`)
await db.$disconnect()

if (run.status !== "success") {
  process.exit(1)
}
