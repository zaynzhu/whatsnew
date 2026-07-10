import { db } from "../config/db.js"
import { reconcileDuplicateTmdbIdentities } from "../services/duplicateIdentityService.js"

const apply = process.argv.includes("--apply")

try {
  const result = await reconcileDuplicateTmdbIdentities({ database: db, apply })
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }, null, 2))
} finally {
  await db.$disconnect()
}
