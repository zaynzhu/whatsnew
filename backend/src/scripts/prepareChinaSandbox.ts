import { chmod, copyFile, readFile } from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { EnvFileStore } from "../settings/envFileStore.js"
import { SOURCE_IDS } from "@whatsnew/shared/settings"

const SANDBOX_DATABASE = "whatsnew_china_sandbox"
const sourceEnvPath = path.resolve(process.cwd(), ".env")
const sandboxEnvPath = path.resolve(process.cwd(), ".env.china-sandbox")
const sourceValues = dotenv.parse(await readFile(sourceEnvPath, "utf8"))
const sourceUrl = new URL(sourceValues.DATABASE_URL)
const sourceDatabase = sourceUrl.pathname.replace(/^\//, "")

if (!sourceDatabase || sourceDatabase === SANDBOX_DATABASE) {
  throw new Error("主库配置无效，拒绝创建国内源沙盒")
}

const sandboxUrl = new URL(sourceUrl)
sandboxUrl.pathname = `/${SANDBOX_DATABASE}`

await copyFile(sourceEnvPath, sandboxEnvPath)
await chmod(sandboxEnvPath, 0o600)
const sandboxStore = new EnvFileStore(sandboxEnvPath)
await sandboxStore.update({
  DATABASE_URL: sandboxUrl.toString(),
  PORT: "19994",
  CORS_ORIGIN: "http://127.0.0.1:19995",
  APP_ENVIRONMENT: "china_sandbox",
  SCHEDULER_ENABLED: "false",
  SYNC_ON_START: "false",
  ...Object.fromEntries(SOURCE_IDS.map((sourceId) => [`SOURCE_${sourceId.toUpperCase()}_ENABLED`, "false"]))
})

const sourceDb = new PrismaClient({ datasources: { db: { url: sourceUrl.toString() } } })
await sourceDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${SANDBOX_DATABASE}\``)
await sourceDb.$executeRawUnsafe(
  `CREATE DATABASE \`${SANDBOX_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
)

const push = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: sandboxUrl.toString() },
  stdio: "inherit"
})
if (push.status !== 0) throw new Error("沙盒 Prisma schema 初始化失败")

const tables = await sourceDb.$queryRawUnsafe<Array<{ tableName: string }>>(
  "SELECT TABLE_NAME AS tableName FROM information_schema.tables WHERE table_schema = ? AND TABLE_TYPE = 'BASE TABLE'",
  sourceDatabase
)
const targetDb = new PrismaClient({ datasources: { db: { url: sandboxUrl.toString() } } })
const sourceColumns = await sourceDb.$queryRawUnsafe<Array<{ tableName: string, columnName: string }>>(
  "SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.columns WHERE table_schema = ? ORDER BY ORDINAL_POSITION",
  sourceDatabase
)
const targetColumns = await sourceDb.$queryRawUnsafe<Array<{ tableName: string, columnName: string }>>(
  "SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.columns WHERE table_schema = ? ORDER BY ORDINAL_POSITION",
  SANDBOX_DATABASE
)
await targetDb.$transaction(async (transaction) => {
  await transaction.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0")
  for (const { tableName } of tables) {
    const availableTargetColumns = new Set(targetColumns
      .filter((column) => column.tableName === tableName)
      .map((column) => column.columnName))
    const columns = sourceColumns
      .filter((column) => column.tableName === tableName && availableTargetColumns.has(column.columnName))
      .map((column) => `\`${column.columnName}\``)
    if (columns.length === 0) continue
    const columnList = columns.join(", ")
    await transaction.$executeRawUnsafe(
      `INSERT INTO \`${SANDBOX_DATABASE}\`.\`${tableName}\` (${columnList}) SELECT ${columnList} FROM \`${sourceDatabase}\`.\`${tableName}\``
    )
  }
  await transaction.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1")
}, { timeout: 120000 })

const [media, releases, signals] = await Promise.all([
  targetDb.mediaItem.count(),
  targetDb.release.count(),
  targetDb.popularitySignal.count()
])
await Promise.all([sourceDb.$disconnect(), targetDb.$disconnect()])

console.log(`国内源沙盒已重建：${SANDBOX_DATABASE}`)
console.log(`基线数据：作品 ${media}，排期 ${releases}，热度信号 ${signals}`)
console.log(`配置文件：${sandboxEnvPath}`)
