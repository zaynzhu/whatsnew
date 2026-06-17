import { demoSeedAdapter } from "../adapters/demoSeedAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"

const run = await runSourceSync(db, demoSeedAdapter)

console.log(`Seed complete: ${run.itemCount} items, status=${run.status}`)
await db.$disconnect()
