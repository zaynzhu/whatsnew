import { db } from "../config/db.js"
import {
  reconcileDuplicateTmdbIdentities,
  reconcileSharedDateTitles,
  reconcileUniqueTitleIdentities
} from "../services/duplicateIdentityService.js"

const apply = process.argv.includes("--apply")

try {
  const tmdbIdentity = await reconcileDuplicateTmdbIdentities({ database: db, apply })
  const uniqueTitle = await reconcileUniqueTitleIdentities({ database: db, apply })
  const sharedDateTitle = await reconcileSharedDateTitles({ database: db, apply })
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    tmdbIdentity,
    uniqueTitle,
    sharedDateTitle
  }, null, 2))
} finally {
  await db.$disconnect()
}
