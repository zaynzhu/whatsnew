import dotenv from "dotenv"
import { z } from "zod"

dotenv.config()

const envSchema = z.object({
  DATABASE_URL: z.string().default("mysql://user:password@localhost:3306/whatsnew"),
  PORT: z.coerce.number().default(19993),
  CORS_ORIGIN: z.string().default("http://localhost:19992"),
  TMDB_API_KEY: z.string().optional().default(""),
  TRAKT_CLIENT_ID: z.string().optional().default(""),
  SYNC_ON_START: z.coerce.boolean().default(false)
})

export const env = envSchema.parse(process.env)
