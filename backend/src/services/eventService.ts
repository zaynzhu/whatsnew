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
