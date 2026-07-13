import { db } from "../config/db.js"
import {
  reconcileDuplicateStableIdentities,
  reconcileSharedDateTitles,
  reconcileUniqueTitleIdentities
} from "../services/duplicateIdentityService.js"

const apply = process.argv.includes("--apply")

try {
  const stableIdentity = await reconcileDuplicateStableIdentities({ database: db, apply })
  const uniqueTitle = await reconcileUniqueTitleIdentities({ database: db, apply })
  const sharedDateTitle = await reconcileSharedDateTitles({ database: db, apply })
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    stableIdentity,
    uniqueTitle,
    sharedDateTitle
  }, null, 2))
} finally {
  await db.$disconnect()
}
