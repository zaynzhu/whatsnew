import type { Prisma, PrismaClient } from "@prisma/client"
import type { ReleaseInput } from "../domain/types.js"
import { formatLocalDate } from "../utils/date.js"

export type PopularityEventPayload = {
  source: string
  platform: string | null
  region: string | null
  window: string
  previousRank: number | null
  currentRank: number | null
  rankDelta: number | null
  capturedAt: string
}

export async function createSourceFailedEvent(
  prisma: PrismaClient,
  source: string,
  errorMessage: string,
  runId: string,
  failedAt: Date
): Promise<void> {
  // 数据源失败不关联具体作品；errorMessage 已在 sourceSyncService 中脱敏，这里只截断长度
  const truncated = errorMessage.slice(0, 500)
  await prisma.changeEvent.create({
    data: {
      mediaItemId: null,
      eventType: "source_failed",
      title: `${source} 数据源同步失败`,
      description: truncated,
      source,
      sourceUrl: null,
      eventAt: failedAt,
      payload: JSON.stringify({ source, runId, errorMessage: truncated })
    }
  })
}

export async function createMediaDetectedEvent(
  prisma: PrismaClient,
  mediaItemId: string,
  title: string,
  source: string,
  sourceUrl: string | null
) {
  await prisma.changeEvent.create({
    data: {
      mediaItemId,
      eventType: "media_detected",
      title: `发现新条目：${title}`,
      description: `${source} 检测到 ${title}`,
      source,
      sourceUrl,
      payload: "{}"
    }
  })
}

export async function createPopularityEvent(
  prisma: Prisma.TransactionClient,
  mediaItemId: string,
  mediaTitle: string,
  eventType: "rank_entered" | "heat_rising" | "rank_changed",
  payload: PopularityEventPayload,
  sourceUrl: string | null
): Promise<void> {
  const descriptions = {
    rank_entered: `${mediaTitle} 新进入 ${payload.source} 前十`,
    heat_rising: `${mediaTitle} 在 ${payload.source} 上升 ${payload.rankDelta} 位`,
    rank_changed: `${mediaTitle} 在 ${payload.source} 排名发生变化`
  }
  const description = descriptions[eventType]

  await prisma.changeEvent.create({
    data: {
      mediaItemId,
      eventType,
      title: description,
      description,
      source: payload.source,
      sourceUrl,
      eventAt: new Date(payload.capturedAt),
      payload: JSON.stringify(payload)
    }
  })
}

export async function createReleaseAnnouncedEvent(
  prisma: PrismaClient,
  mediaItemId: string,
  mediaTitle: string,
  release: ReleaseInput,
  eventAt: Date
): Promise<void> {
  const title = `定档：${mediaTitle} 将于 ${release.releaseDate} 在 ${release.platform} 上线`
  await prisma.changeEvent.create({
    data: {
      mediaItemId,
      eventType: "release_announced",
      title,
      description: `${mediaTitle} 计划于 ${release.releaseDate} 在 ${release.platform}（${release.region}）上线`,
      source: release.source,
      sourceUrl: release.sourceUrl,
      eventAt,
      payload: JSON.stringify({
        source: release.source,
        platform: release.platform,
        region: release.region,
        seasonNumber: release.seasonNumber,
        episodeNumber: release.episodeNumber,
        releaseDate: release.releaseDate,
        releaseStatus: release.releaseStatus
      })
    }
  })
}

export async function createDelayedEvent(
  prisma: PrismaClient,
  mediaItemId: string,
  mediaTitle: string,
  release: ReleaseInput,
  previousDate: string,
  nextDate: string,
  eventAt: Date
): Promise<void> {
  const title = `改档：${mediaTitle} 由 ${previousDate} 延后至 ${nextDate}`
  await prisma.changeEvent.create({
    data: {
      mediaItemId,
      eventType: "delayed",
      title,
      description: `${mediaTitle} 在 ${release.platform}（${release.region}）的档期由 ${previousDate} 延后至 ${nextDate}`,
      source: release.source,
      sourceUrl: release.sourceUrl,
      eventAt,
      payload: JSON.stringify({
        source: release.source,
        platform: release.platform,
        region: release.region,
        seasonNumber: release.seasonNumber,
        episodeNumber: release.episodeNumber,
        previousDate,
        releaseDate: nextDate,
        releaseStatus: release.releaseStatus
      })
    }
  })
}

type ReleaseRef = {
  source: string
  platform: string
  region: string
  releaseDate: string | null
  seasonNumber: number | null
  episodeNumber: number | null
}

function releaseKey(ref: ReleaseRef): string {
  return [ref.source, ref.platform, ref.region, ref.seasonNumber ?? "", ref.episodeNumber ?? ""].join("|")
}

// 比较新旧 release，生成 release_announced 与 delayed 两类"变化"事件。
// 由于 release 写入是按来源全量替换，这里在替换前读出的 previousReleases 即为旧基线；
// "新槽位"与"日期后移"本身就是稀疏条件，下次同步槽位已存在且日期不变时不会重复触发，无需额外去重查询。
export async function generateReleaseEvents(
  prisma: PrismaClient,
  mediaItemId: string,
  mediaTitle: string,
  newReleases: ReleaseInput[],
  previousReleases: ReleaseRef[],
  now: Date
): Promise<void> {
  const today = formatLocalDate(now)
  const previousByKey = new Map<string, ReleaseRef>()
  for (const prev of previousReleases) {
    previousByKey.set(releaseKey(prev), prev)
  }

  for (const next of newReleases) {
    const prev = previousByKey.get(releaseKey(next))
    if (!prev) {
      // 新槽位：只有未来日期才记为定档，已过去的日期不追溯
      if (next.releaseDate && next.releaseDate > today) {
        await createReleaseAnnouncedEvent(prisma, mediaItemId, mediaTitle, next, now)
      }
      continue
    }

    // 同槽位：仅记录延后为改档，提前暂不记录
    const previousDate = prev.releaseDate
    const nextDate = next.releaseDate
    if (previousDate && nextDate && nextDate > previousDate) {
      await createDelayedEvent(prisma, mediaItemId, mediaTitle, next, previousDate, nextDate, now)
    }
  }
}