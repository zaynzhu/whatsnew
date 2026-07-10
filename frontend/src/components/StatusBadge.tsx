type StatusBadgeProps = {
  children: string
}

const STATUS_LABELS: Record<string, string> = {
  unknown: "待确认",
  upcoming: "即将上线",
  released: "已上映",
  ongoing: "播出中",
  returning: "待回归",
  ended: "已完结",
  announced: "已官宣",
  airing_today: "今日播出",
  available: "已上线",
  delayed: "已延期",
  running: "同步中",
  success: "成功",
  warning: "需关注",
  failed: "失败"
}

export function StatusBadge({ children }: StatusBadgeProps) {
  return <span className={`statusBadge ${children}`}>{STATUS_LABELS[children] ?? children}</span>
}
