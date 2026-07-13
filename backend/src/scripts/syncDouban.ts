import { doubanTopAdapter, doubanUpcomingAdapter } from "../adapters/doubanAdapter.js"
import { db } from "../config/db.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

await runtimeSettings.load()
const topRun = await runSourceSync(db, doubanTopAdapter)
const upcomingRun = await runSourceSync(db, doubanUpcomingAdapter)
const runs = [topRun, upcomingRun]

console.log(runs.map((run) => (
  `豆瓣 ${run.scope} sync complete: ${run.itemCount} items, status=${run.status}`
)).join("\n"))
await db.$disconnect()

if (runs.some((run) => run.status !== "success")) {
  process.exit(1)
}
