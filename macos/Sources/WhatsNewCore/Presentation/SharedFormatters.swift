import Foundation

public enum SharedFormatters {
  private static func iso8601Formatter() -> ISO8601DateFormatter {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }

  private static func fallbackISO8601Formatter() -> ISO8601DateFormatter {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }

  private static func dateFormatter() -> DateFormatter {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy年M月d日"
    return formatter
  }

  private static func dateTimeFormatter() -> DateFormatter {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.timeZone = .current
    formatter.dateFormat = "M月d日 HH:mm"
    return formatter
  }

  private static func monthFormatter() -> DateFormatter {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy年M月"
    return formatter
  }

  private static func relativeFormatter() -> RelativeDateTimeFormatter {
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.unitsStyle = .short
    return formatter
  }

  private static func numberFormatter() -> NumberFormatter {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 1
    return formatter
  }

  public static func date(fromISO8601 value: String) -> Date? {
    iso8601Formatter().date(from: value) ?? fallbackISO8601Formatter().date(from: value)
  }

  public static func dateText(fromISO8601 value: String?) -> String {
    guard let value, let date = date(fromISO8601: value) else {
      return "日期未知"
    }
    return dateFormatter().string(from: date)
  }

  public static func dateTimeText(fromISO8601 value: String?) -> String {
    guard let value, let date = date(fromISO8601: value) else {
      return "时间未知"
    }
    return dateTimeFormatter().string(from: date)
  }

  public static func monthText(_ date: Date) -> String {
    monthFormatter().string(from: date)
  }

  public static func listText(_ value: String?, fallback: String = "—") -> String {
    guard let value else {
      return fallback
    }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return fallback
    }
    guard let data = trimmed.data(using: .utf8),
          let values = try? JSONSerialization.jsonObject(with: data) as? [String] else {
      return trimmed
    }

    var seen = Set<String>()
    let unique = values.compactMap { item -> String? in
      let normalized = item.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !normalized.isEmpty else { return nil }
      guard seen.insert(normalized.lowercased()).inserted else { return nil }
      return normalized
    }
    return unique.isEmpty ? fallback : unique.joined(separator: " · ")
  }

  public static func relativeText(fromISO8601 value: String?, now: Date = Date()) -> String {
    guard let value, let date = date(fromISO8601: value) else {
      return "时间未知"
    }
    return relativeFormatter().localizedString(for: date, relativeTo: now)
  }

  public static func numberText(_ value: Double?, fallback: String = "—") -> String {
    guard let value, let formatted = numberFormatter().string(from: NSNumber(value: value)) else {
      return fallback
    }
    return formatted
  }

  public static func rankText(_ rank: Int?) -> String {
    guard let rank else {
      return "—"
    }
    return String(rank)
  }

  public static func durationText(milliseconds: Int?) -> String {
    guard let milliseconds else {
      return "—"
    }
    if milliseconds < 1_000 {
      return "\(milliseconds) ms"
    }
    return String(format: "%.1f s", Double(milliseconds) / 1_000)
  }
}
