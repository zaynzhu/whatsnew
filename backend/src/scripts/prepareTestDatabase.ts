import { spawnSync } from "node:child_process"
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { assertTestDatabaseUrl, deriveTestDatabaseUrl, getDatabaseName } from "../config/databaseUrl.js"

dotenv.config()

const sourceDatabaseUrl = process.env.DATABASE_URL

if (!sourceDatabaseUrl) {
  throw new Error("DATABASE_URL 未配置，无法准备测试数据库")
}

const testDatabaseUrl = deriveTestDatabaseUrl(sourceDatabaseUrl)
assertTestDatabaseUrl(testDatabaseUrl)

const adminUrl = new URL(sourceDatabaseUrl)
adminUrl.pathname = "/mysql"

const databaseName = getDatabaseName(testDatabaseUrl)
const adminPrisma = new PrismaClient({
  datasources: {
    db: {
      url: adminUrl.toString()
    }
  }
})

await adminPrisma.$executeRawUnsafe(
  `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
)
await adminPrisma.$disconnect()

const result = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl
  },
  stdio: "inherit"
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
