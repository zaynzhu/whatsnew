import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { registerScheduler } from "./scheduler.js"
import { runtimeSettings } from "./settings/runtimeSettingsService.js"

await runtimeSettings.load()
const app = createApp()

registerScheduler()

app.listen(env.PORT, () => {
  console.log(`WhatsNew backend listening on http://localhost:${env.PORT}`)
})
