import dotenv from "dotenv"
import path from "node:path"
import { z } from "zod"
import { deriveTestDatabaseUrl } from "./databaseUrl.js"
import { parseEnvBoolean } from "./envValue.js"

export const settingsEnvPath = path.resolve(process.cwd(), process.env.SETTINGS_ENV_PATH ?? ".env")

dotenv.config({ path: settingsEnvPath })

if (process.env.NODE_ENV === "test" && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = deriveTestDatabaseUrl(process.env.DATABASE_URL)
}

const envSchema = z.object({
  DATABASE_URL: z.string().default("mysql://user:password@localhost:3306/whatsnew"),
  PORT: z.coerce.number().default(19993),
  CORS_ORIGIN: z.string().default("http://localhost:19992"),
  APP_ENVIRONMENT: z.enum(["main", "china_sandbox"]).default("main"),
  SCHEDULER_ENABLED: z.preprocess(parseEnvBoolean, z.boolean()).default(true),
  TMDB_API_KEY: z.string().optional().default(""),
  TMDB_BASE_URL: z.string().default("https://api.themoviedb.org/3"),
  TMDB_IMAGE_BASE_URL: z.string().default("https://image.tmdb.org/t/p/w500"),
  TRAKT_CLIENT_ID: z.string().optional().default(""),
  SYNC_ON_START: z.preprocess(parseEnvBoolean, z.boolean()).default(false)
})

export const env = envSchema.parse(process.env)
