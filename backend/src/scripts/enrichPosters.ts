import { db } from "../config/db.js"
import { enrichMissingPosters } from "../services/tmdbPosterEnrichmentService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

function requestedLimit(): number {
  const argument = process.argv.find((value) => value.startsWith("--limit="))
  const value = Number(argument?.split("=")[1] ?? 120)
  return Number.isInteger(value) && value > 0 ? value : 120
}

try {
  await runtimeSettings.load()
  const result = await enrichMissingPosters({
    database: db,
    settings: runtimeSettings,
    limit: requestedLimit()
  })
  console.log(JSON.stringify(result))
} catch {
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
