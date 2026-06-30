import { createImdbDatasetCacheAdapter } from "../adapters/imdbDatasetCacheAdapter.js"
import { db } from "../config/db.js"
import { loadExistingMediaCandidates } from "../services/mediaCandidateService.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

let exitCode = 0

try {
  await runtimeSettings.load()
  const cacheDir = runtimeSettings.get("IMDB_DATASET_CACHE_DIR").trim()

  if (!cacheDir) {
    console.log("source=imdb status=missing_cache_dir items=0")
    exitCode = 1
  } else {
    const candidates = await loadExistingMediaCandidates(db)
    const adapter = createImdbDatasetCacheAdapter({ cacheDir, candidates })
    const run = await runSourceSync(db, adapter)
    console.log(`source=${run.source} scope=${run.scope ?? "datasets_cache"} status=${run.status} items=${run.itemCount}`)
    if (run.status !== "success") exitCode = 1
  }
} catch {
  console.log("source=imdb scope=datasets_cache status=failed items=0")
  exitCode = 1
} finally {
  await db.$disconnect()
}

if (exitCode !== 0) process.exit(exitCode)
