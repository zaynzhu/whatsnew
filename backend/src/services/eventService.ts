import type { PrismaClient } from "@prisma/client"

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
