import { db } from "../config/db.js"
import { reconcileReleaseStatuses } from "../services/releaseStatusReconciliationService.js"

const apply = process.argv.includes("--apply")

try {
  const result = await reconcileReleaseStatuses({ database: db, apply })
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }, null, 2))
} finally {
  await db.$disconnect()
}
