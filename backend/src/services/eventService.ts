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

const POPULARITY_SOURCE_LABELS: Record<string, string> = {
  tmdb_trending: "TMDb 电影趋势",
  tmdb_tv_trending: "TMDb 剧集趋势",
  trakt_trending: "Trakt 趋势榜",
  trakt_anticipated: "Trakt 期待榜",
  netflix_top10: "Netflix Top 10",
  youku_hot: "优酷热度",
  youku_reserve: "优酷预约",
  iqiyi_reserve: "爱奇艺预约",
  tencent_reserve: "腾讯视频预约",
  douban_upcoming: "豆瓣即将播出",
  douban_top: "豆瓣 TOP250"
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
  const sourceName = POPULARITY_SOURCE_LABELS[payload.source] ?? payload.platform ?? payload.source
  const currentRank = payload.currentRank == null ? "未知" : `${payload.currentRank}`
  const previousRank = payload.previousRank == null ? "未知" : `${payload.previousRank}`
  const direction = (payload.rankDelta ?? 0) > 0 ? "上升" : "下降"
  const titles = {
    rank_entered: `${mediaTitle} 新进入榜`,
    heat_rising: `${mediaTitle} 升至第 ${currentRank} 名`,
    rank_changed: `${mediaTitle} ${(payload.rankDelta ?? 0) > 0 ? "升至" : "回落至"}第 ${currentRank} 名`
  }
  const descriptions = {
    rank_entered: `${sourceName} · 当前第 ${currentRank} 名`,
    heat_rising: `${sourceName} · 从第 ${previousRank} 名上升 ${Math.abs(payload.rankDelta ?? 0)} 位`,
    rank_changed: `${sourceName} · 从第 ${previousRank} 名${direction} ${Math.abs(payload.rankDelta ?? 0)} 位`
  }

  await prisma.changeEvent.create({
    data: {
      mediaItemId,
      eventType,
      title: titles[eventType],
      description: descriptions[eventType],
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
  direction: "提前" | "延后",
  eventAt: Date
): Promise<void> {
  const title = `改档：${mediaTitle} 由 ${previousDate} ${direction}至 ${nextDate}`
  await prisma.changeEvent.create({
    data: {
      mediaItemId,
      eventType: "delayed",
      title,
      description: `${mediaTitle} 在 ${release.platform}（${release.region}）的档期由 ${previousDate} ${direction}至 ${nextDate}`,
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
        direction,
        releaseStatus: release.releaseStatus
      })
    }
  })
}

export async function createAiringTodayEvent(
  prisma: PrismaClient,
  mediaItemId: string,
  mediaTitle: string,
  release: ReleaseInput,
  eventType: "airing_today" | "available_now",
  eventAt: Date
): Promise<void> {
  const verb = eventType === "available_now" ? "今日上架" : "今日播出"
  const action = eventType === "available_now" ? "上架" : "播出"
  const title = `${verb}：${mediaTitle}（${release.platform}）`
  await prisma.changeEvent.create({
    data: {
      mediaItemId,
      eventType,
      title,
      description: `${mediaTitle} 于 ${release.releaseDate} 在 ${release.platform}（${release.region}）${action}`,
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
    const nextDate = next.releaseDate
    const prevDate = prev?.releaseDate ?? null

    // 今日到档：首次发现今天播出/上架；下次同步 prevDate 已是今天，不再重复
    if (nextDate && nextDate === today && prevDate !== today) {
      const eventType = next.releaseStatus === "available" ? "available_now" : "airing_today"
      await createAiringTodayEvent(prisma, mediaItemId, mediaTitle, next, eventType, now)
      continue
    }

    if (!prev) {
      // 新槽位：只有未来日期才记为定档，已过去的日期不追溯
      if (nextDate && nextDate > today) {
        await createReleaseAnnouncedEvent(prisma, mediaItemId, mediaTitle, next, now)
      }
      continue
    }

    // 同槽位：日期变化即记为改档，区分提前与延后
    if (prevDate && nextDate && nextDate !== prevDate) {
      const direction = nextDate > prevDate ? "延后" : "提前"
      await createDelayedEvent(prisma, mediaItemId, mediaTitle, next, prevDate, nextDate, direction, now)
    }
  }
}
