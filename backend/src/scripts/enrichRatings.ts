import { db } from "../config/db.js"
import { enrichRatings } from "../services/ratingEnrichmentService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

function requestedLimit(): number {
  const argument = process.argv.find((value) => value.startsWith("--limit="))
  const value = Number(argument?.split("=")[1] ?? 20)
  return Number.isInteger(value) && value > 0 ? value : 20
}

try {
  await runtimeSettings.load()
  const result = await enrichRatings({
    database: db,
    settings: runtimeSettings,
    limit: requestedLimit(),
    force: process.argv.includes("--force")
  })
  console.log(JSON.stringify(result))
} catch {
  console.error(JSON.stringify({ error: "评分补全启动失败" }))
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
