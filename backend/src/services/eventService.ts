import type { Prisma, PrismaClient } from "@prisma/client"

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
