import { db } from "../config/db.js"
import {
  reconcileDuplicateTmdbIdentities,
  reconcileUniqueTitleIdentities
} from "../services/duplicateIdentityService.js"

const apply = process.argv.includes("--apply")

try {
  const tmdbIdentity = await reconcileDuplicateTmdbIdentities({ database: db, apply })
  const uniqueTitle = await reconcileUniqueTitleIdentities({ database: db, apply })
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    tmdbIdentity,
    uniqueTitle
  }, null, 2))
} finally {
  await db.$disconnect()
}
