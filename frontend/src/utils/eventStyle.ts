// 将 ChangeEvent.eventType 映射为中文标签和色调，用于事件流视觉区分。
// 色调对应设计方向：颜色用于表达状态——上线/上升/失败/即将开播/改档。

export type EventTone =
  | "detect"
  | "announce"
  | "today"
  | "rising"
  | "change"
  | "delay"
  | "failed"
  | "neutral"

export type EventStyle = {
  label: string
  tone: EventTone
}

const EVENT_STYLES: Record<string, EventStyle> = {
  media_detected: { label: "新发现", tone: "detect" },
  release_announced: { label: "即将上线", tone: "announce" },
  airing_today: { label: "今日播出", tone: "today" },
  available_now: { label: "今日上架", tone: "today" },
  rank_entered: { label: "进榜", tone: "rising" },
  rank_changed: { label: "排名变化", tone: "change" },
  heat_rising: { label: "热度上升", tone: "rising" },
  delayed: { label: "改档", tone: "delay" },
  source_failed: { label: "数据源失败", tone: "failed" }
}

export function eventStyle(eventType: string): EventStyle {
  return EVENT_STYLES[eventType] ?? { label: "动态", tone: "neutral" }
}