import { db } from "../config/db.js"
import { verifyPosterImages } from "../services/posterVerificationService.js"

function requestedLimit(): number {
  const argument = process.argv.find((value) => value.startsWith("--limit="))
  const value = Number(argument?.split("=")[1] ?? 20)
  return Number.isInteger(value) && value > 0 ? value : 20
}

try {
  console.log(JSON.stringify(await verifyPosterImages({
    database: db,
    limit: requestedLimit(),
    force: process.argv.includes("--force")
  }), null, 2))
} finally {
  await db.$disconnect()
}
