export function getDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl)
  return url.pathname.replace(/^\//, "")
}

export function deriveTestDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl)
  const databaseName = getDatabaseName(databaseUrl)

  if (!databaseName) {
    throw new Error("DATABASE_URL 缺少数据库名")
  }

  if (!databaseName.endsWith("_test")) {
    url.pathname = `/${databaseName}_test`
  }

  return url.toString()
}

export function assertTestDatabaseUrl(databaseUrl: string): void {
  const databaseName = getDatabaseName(databaseUrl)

  if (!databaseName.endsWith("_test")) {
    throw new Error(`拒绝清理非测试数据库：${databaseName}`)
  }
}
