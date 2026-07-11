import type { ChangeEvent } from "../api/types"

type PopularityEventPayload = {
  previousRank?: number | null
  currentRank?: number | null
  rankDelta?: number | null
}

export type EventPresentation = {
  headline: string
  detail: string | null
}

function parsePayload(payload: string): PopularityEventPayload {
  try {
    return JSON.parse(payload) as PopularityEventPayload
  } catch {
    return {}
  }
}

function legacyMediaTitle(event: ChangeEvent): string {
  const marker = ` 在 ${event.source}`
  const markerIndex = event.title.indexOf(marker)
  return markerIndex > 0 ? event.title.slice(0, markerIndex) : event.title
}

export function eventPresentation(event: ChangeEvent): EventPresentation {
  if (!["rank_entered", "heat_rising", "rank_changed"].includes(event.eventType)) {
    return {
      headline: event.title,
      detail: event.description !== event.title ? event.description : null
    }
  }

  const payload = parsePayload(event.payload)
  const mediaTitle = event.mediaItem?.titleDisplay ?? legacyMediaTitle(event)
  const previousRank = payload.previousRank
  const currentRank = payload.currentRank
  const rankDelta = payload.rankDelta

  if (event.eventType === "rank_entered" && currentRank != null) {
    return {
      headline: `${mediaTitle} 新进入榜`,
      detail: `当前第 ${currentRank} 名`
    }
  }

  if (previousRank != null && currentRank != null && rankDelta != null) {
    const direction = rankDelta > 0 ? "升至" : "回落至"
    const movement = rankDelta > 0 ? "上升" : "下降"
    return {
      headline: `${mediaTitle} ${direction}第 ${currentRank} 名`,
      detail: `从第 ${previousRank} 名${movement} ${Math.abs(rankDelta)} 位`
    }
  }

  return {
    headline: mediaTitle,
    detail: "排名发生变化"
  }
}
