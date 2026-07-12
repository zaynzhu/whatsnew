import { bilibiliAdapter } from "../adapters/bilibiliAdapter.js"
import { doubanAdapter } from "../adapters/doubanAdapter.js"
import { iqiyiAdapter } from "../adapters/iqiyiAdapter.js"
import { mgtvAdapter } from "../adapters/mgtvAdapter.js"
import { youkuAdapter } from "../adapters/youkuAdapter.js"
import { db } from "../config/db.js"
import { env } from "../config/env.js"
import type { SourceAdapter, SourceFetchResult } from "../domain/types.js"
import { runSourceSync } from "../services/sourceSyncService.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"

const SANDBOX_DATABASE = "whatsnew_china_sandbox"
const adapters: Record<string, SourceAdapter<SourceFetchResult>> = {
  youku: youkuAdapter,
  iqiyi: iqiyiAdapter,
  mango_tv: mgtvAdapter,
  bilibili: bilibiliAdapter,
  douban: doubanAdapter
}

const source = process.argv[2]
const adapter = adapters[source]
if (!adapter) throw new Error(`来源无效，可选：${Object.keys(adapters).join("、")}`)

const databaseName = new URL(env.DATABASE_URL).pathname.replace(/^\//, "")
if (env.APP_ENVIRONMENT !== "china_sandbox" || databaseName !== SANDBOX_DATABASE) {
  throw new Error(`拒绝执行：当前不是 ${SANDBOX_DATABASE} 国内源沙盒`)
}

await runtimeSettings.load()

async function snapshot() {
  const [media, releases, signals, sourceRefs] = await Promise.all([
    db.mediaItem.count(),
    db.release.count(),
    db.popularitySignal.count(),
    db.mediaSourceRef.findMany({
      where: { source, isActive: true },
      include: {
        mediaItem: {
          include: {
            releases: { where: { source } },
            popularitySignals: { where: { source: { startsWith: source } } }
          }
        }
      }
    })
  ])
  const sourceItems = sourceRefs.map((ref) => ref.mediaItem)
  const suspicious = sourceItems
    .filter((item) => /新闻|早间|晚间|直播|预告|花絮|片段|采访/.test(item.titleDisplay))
    .slice(0, 20)
    .map((item) => item.titleDisplay)
  const mediaTypes = sourceItems.reduce<Record<string, number>>((counts, item) => {
    counts[item.mediaType] = (counts[item.mediaType] ?? 0) + 1
    return counts
  }, {})
  return {
    media,
    releases,
    signals,
    sourceIds: new Set(sourceRefs.map((ref) => ref.sourceId)),
    sourceItems: sourceItems.length,
    missingPoster: sourceItems.filter((item) => !item.posterUrl).length,
    missingDate: sourceItems.filter((item) => item.releases.every((release) => !release.releaseDate)).length,
    mediaTypes,
    suspicious
  }
}

const before = await snapshot()
const run = await runSourceSync(db, adapter)
const after = await snapshot()
const newSourceIds = [...after.sourceIds].filter((sourceId) => !before.sourceIds.has(sourceId))
const createdMedia = after.media - before.media
const matchedExisting = Math.max(0, newSourceIds.length - Math.max(0, createdMedia))

console.log(`\n国内源沙盒报告：${source}`)
console.log(`同步状态：${run.status}，本次返回 ${run.itemCount} 条，耗时 ${run.durationMs ?? 0}ms`)
console.log(`全库变化：作品 ${after.media - before.media >= 0 ? "+" : ""}${after.media - before.media}，排期 ${after.releases - before.releases >= 0 ? "+" : ""}${after.releases - before.releases}，热度信号 ${after.signals - before.signals >= 0 ? "+" : ""}${after.signals - before.signals}`)
console.log(`来源条目：${after.sourceItems}，本次新增来源身份：${newSourceIds.length}`)
console.log(`身份归并：新增作品 ${Math.max(0, createdMedia)}，匹配既有作品 ${matchedExisting}`)
console.log(`缺海报：${after.missingPoster}，无来源日期：${after.missingDate}`)
console.log(`类型分布：${JSON.stringify(after.mediaTypes)}`)
console.log(`可疑标题：${after.suspicious.length > 0 ? after.suspicious.join("、") : "无"}`)

await db.$disconnect()
if (run.status === "failed") process.exit(1)
