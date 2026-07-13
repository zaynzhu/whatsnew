import { db } from "../config/db.js"
import { cleanupOrphanedMedia } from "../services/orphanedMediaCleanupService.js"

const apply = process.argv.includes("--apply")

try {
  const result = await cleanupOrphanedMedia({
    database: db,
    sources: ["disney_plus", "hulu", "max", "prime_video"],
    apply
  })
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }, null, 2))
} finally {
  await db.$disconnect()
}
