import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { registerScheduler } from "./scheduler.js"

const app = createApp()

registerScheduler()

app.listen(env.PORT, () => {
  console.log(`WhatsNew backend listening on http://localhost:${env.PORT}`)
})
