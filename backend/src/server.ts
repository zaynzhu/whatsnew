import { createApp } from "./app.js"
import { db } from "./config/db.js"
import { env } from "./config/env.js"
import { registerScheduler } from "./scheduler.js"
import { recoverInterruptedSourceRuns } from "./services/sourceSyncService.js"
import { runtimeSettings } from "./settings/runtimeSettingsService.js"

await runtimeSettings.load()
const recoveredRuns = await recoverInterruptedSourceRuns(db)
if (recoveredRuns > 0) {
  console.warn(`Recovered ${recoveredRuns} interrupted source sync run(s)`)
}
const app = createApp()

if (env.SCHEDULER_ENABLED) registerScheduler()

app.listen(env.PORT, () => {
  console.log(`WhatsNew backend (${env.APP_ENVIRONMENT}) listening on http://localhost:${env.PORT}`)
})
