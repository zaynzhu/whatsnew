import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 19992,
    proxy: {
      "/api": process.env.VITE_BACKEND_URL ?? "http://127.0.0.1:19993"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: []
  }
})
