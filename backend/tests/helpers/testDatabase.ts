import { PrismaClient } from "@prisma/client"
import dotenv from "dotenv"
import { assertTestDatabaseUrl, deriveTestDatabaseUrl } from "../../src/config/databaseUrl.js"

dotenv.config()

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL 未配置，无法运行数据库测试")
}

process.env.DATABASE_URL = deriveTestDatabaseUrl(process.env.DATABASE_URL)
assertTestDatabaseUrl(process.env.DATABASE_URL)

export const testPrisma = new PrismaClient()

export async function resetTestDatabase(): Promise<void> {
  assertTestDatabaseUrl(process.env.DATABASE_URL ?? "")

  await testPrisma.changeEvent.deleteMany()
  await testPrisma.popularitySignal.deleteMany()
  await testPrisma.release.deleteMany()
  await testPrisma.mediaSourceRef.deleteMany()
  await testPrisma.mediaItem.deleteMany()
  await testPrisma.sourceSyncRun.deleteMany()
}
