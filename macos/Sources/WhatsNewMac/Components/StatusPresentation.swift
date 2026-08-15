import SwiftUI

public enum StatusPresentation {
  public static func label(_ value: String) -> String {
    switch value {
    case "upcoming": return "待播"
    case "released": return "已发行"
    case "available": return "可观看"
    case "airing_today": return "今日播出"
    case "delayed": return "延期"
    case "ended": return "已完结"
    case "ongoing": return "连载中"
    case "returning": return "待回归"
    case "unknown": return "未知"
    case "running": return "运行中"
    case "success": return "成功"
    case "warning": return "有警告"
    case "failed": return "失败"
    case "blocked": return "已阻断"
    case "active": return "已接入"
    case "planned": return "规划中"
    case "commercial": return "商业授权"
    case "passed": return "通过"
    case "degraded": return "降级"
    case "fresh": return "新鲜"
    case "stale": return "过期"
    case "disabled": return "未启用"
    case "ready": return "就绪"
    case "partial": return "部分就绪"
    case "missing_config": return "缺少配置"
    case "missing_files": return "缺少文件"
    case "unverified": return "未验证"
    case "healthy": return "健康"
    case "undersized": return "低清"
    case "not_attempted": return "未尝试"
    case "cooldown": return "冷却中"
    case "retry_eligible": return "可重试"
    case "new": return "新进榜"
    case "rising": return "上升"
    case "falling": return "下降"
    case "stable": return "稳定"
    case "movie": return "电影"
    case "series": return "剧集"
    case "anime": return "动画"
    case "variety": return "综艺"
    case "short_drama": return "短剧"
    case "documentary": return "纪录片"
    case "theatrical_movie": return "院线电影"
    case "streaming_movie": return "流媒体电影"
    case "animated_film": return "动画电影"
    case "tv_series": return "电视剧"
    case "web_series": return "网络剧"
    case "animated_series": return "动画剧集"
    case "anime_season": return "番剧季度"
    case "variety_season": return "综艺季度"
    case "micro_drama": return "微短剧"
    case "documentary_film": return "纪录电影"
    case "documentary_series": return "纪录剧集"
    case "scripted": return "电影与剧情剧"
    case "animation": return "动画"
    case "reality_variety": return "真人秀与综艺"
    case "talk_game": return "谈话与游戏"
    case "news": return "新闻"
    case "sports": return "体育"
    default: return value.isEmpty ? "未知" : value
    }
  }

  public static func color(_ value: String) -> Color {
    switch value {
    case "success", "available", "released", "airing_today", "stable", "ongoing", "active", "passed", "fresh", "ready", "healthy":
      return DesignSystem.archiveOlive
    case "failed", "delayed", "falling", "blocked", "stale", "missing_config", "missing_files", "undersized":
      return DesignSystem.cueRed
    case "upcoming", "running", "new", "rising", "returning", "planned", "degraded", "partial", "retry_eligible":
      return DesignSystem.reelBlue
    default:
      return .secondary
    }
  }
}

public struct SemanticStatusBadge: View {
  public let value: String

  public init(_ value: String) {
    self.value = value
  }

  public var body: some View {
    StatusBadge(text: StatusPresentation.label(value), color: StatusPresentation.color(value))
  }
}

public struct ContentStatusBadge: View {
  public let value: String

  public init(_ value: String) {
    self.value = value
  }

  public var body: some View {
    Label(label, systemImage: systemImage)
      .font(.caption.weight(.semibold))
      .foregroundStyle(color)
      .padding(.horizontal, 7)
      .padding(.vertical, 4)
      .background(color.opacity(0.13), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 5, style: .continuous)
          .strokeBorder(color.opacity(0.35), lineWidth: 1)
      }
      .help("作品状态：\(label)")
  }

  private var label: String {
    value == "unknown" || value.isEmpty ? "状态待确认" : StatusPresentation.label(value)
  }

  private var color: Color {
    StatusPresentation.color(value)
  }

  private var systemImage: String {
    switch value {
    case "upcoming", "returning": return "clock"
    case "airing_today": return "dot.radiowaves.left.and.right"
    case "available", "released": return "checkmark.circle.fill"
    case "ongoing": return "play.circle.fill"
    case "ended": return "flag.checkered"
    case "delayed": return "exclamationmark.arrow.triangle.2.circlepath"
    default: return "questionmark.circle"
    }
  }
}
