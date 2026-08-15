import Foundation
import Observation
import SwiftUI
import WhatsNewCore

@MainActor
@Observable
final class CalendarViewModel {
  private let client: APIClient
  private(set) var monthResponse: CalendarResponse?
  private(set) var dayResponse: CalendarResponse?
  private(set) var monthState: FeatureLoadState = .idle
  private(set) var dayState: FeatureLoadState = .idle
  private(set) var isRefreshing = false
  var month: Date
  var selectedDate: String
  var mediaType = ""

  init(client: APIClient) {
    self.client = client
    let now = Date()
    self.month = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: now)) ?? now
    self.selectedDate = Self.dateKey(now)
  }

  func loadInitial() async {
    await loadMonth()
    await loadDay()
  }

  func loadMonth(refresh: Bool = false) async {
    if refresh || monthResponse != nil {
      isRefreshing = true
    } else {
      monthState = .loading
    }
    defer { isRefreshing = false }
    let range = Self.monthRange(month)
    do {
      let result = try await client.calendar(
        from: range.from,
        to: range.to,
        summary: true,
        mediaType: mediaType.nilIfEmpty
      )
      monthResponse = result
      monthState = result.days.isEmpty ? .empty : .loaded
    } catch {
      if monthResponse == nil {
        monthState = .failed((error as? LocalizedError)?.errorDescription ?? "日历摘要暂时无法加载")
      }
    }
  }

  func loadDay() async {
    dayState = dayResponse == nil ? .loading : dayState
    do {
      let result = try await client.calendar(
        from: selectedDate,
        to: selectedDate,
        mediaType: mediaType.nilIfEmpty
      )
      dayResponse = result
      dayState = result.items.isEmpty ? .empty : .loaded
    } catch {
      if dayResponse == nil {
        dayState = .failed((error as? LocalizedError)?.errorDescription ?? "当天排期暂时无法加载")
      }
    }
  }

  func shiftMonth(by amount: Int) async {
    month = Calendar.current.date(byAdding: .month, value: amount, to: month) ?? month
    selectedDate = Self.dateKey(month)
    await loadMonth(refresh: true)
    await loadDay()
  }

  func selectToday() async {
    let now = Date()
    month = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: now)) ?? now
    selectedDate = Self.dateKey(now)
    await loadMonth(refresh: true)
    await loadDay()
  }

  func select(date: Date) async {
    let components = Calendar.current.dateComponents([.year, .month], from: date)
    let nextMonth = Calendar.current.date(from: components) ?? month
    if !Calendar.current.isDate(nextMonth, equalTo: month, toGranularity: .month) {
      month = nextMonth
      await loadMonth(refresh: true)
    }
    selectedDate = Self.dateKey(date)
    await loadDay()
  }

  var dayMap: [String: CalendarDay] {
    Dictionary(uniqueKeysWithValues: (monthResponse?.days ?? []).map { ($0.date, $0) })
  }

  static func monthRange(_ month: Date) -> (from: String, to: String) {
    let calendar = Calendar.current
    let start = calendar.date(from: calendar.dateComponents([.year, .month], from: month)) ?? month
    let end = calendar.date(byAdding: DateComponents(month: 1, day: -1), to: start) ?? month
    return (dateKey(start), dateKey(end))
  }

  static func dateKey(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
  }
}

public struct CalendarView: View {
  private let client: APIClient
  private let onSelectMedia: (String) -> Void
  @State private var model: CalendarViewModel
  @State private var isDayExpanded = true

  public init(client: APIClient, onSelectMedia: @escaping (String) -> Void = { _ in }) {
    self.client = client
    self.onSelectMedia = onSelectMedia
    _model = State(initialValue: CalendarViewModel(client: client))
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      controls
      Divider()
      content
    }
    .task { await model.loadInitial() }
    .refreshable {
      await model.loadMonth(refresh: true)
      await model.loadDay()
    }
    .onChange(of: model.mediaType) { _, _ in
      Task {
        await model.loadMonth(refresh: true)
        await model.loadDay()
      }
    }
    .overlay(alignment: .topTrailing) {
      if model.isRefreshing {
        ProgressView()
          .controlSize(.small)
          .padding(16)
      }
    }
  }

  private var header: some View {
    HStack(alignment: .bottom, spacing: 24) {
      VStack(alignment: .leading, spacing: 7) {
        Text("海报日历")
          .font(DesignSystem.pageTitle)
          .tracking(-0.8)
          .foregroundStyle(DesignSystem.reelBlue)
        Text("点开任意日期，在右侧展开当天的完整片单。")
          .font(.title3)
          .foregroundStyle(.secondary)
      }
      Spacer()
      let total = (model.monthResponse?.days ?? []).reduce(0) { $0 + $1.count }
      HStack(spacing: 24) {
        CalendarMetric(value: total, label: "月度排期")
        CalendarMetric(value: model.monthResponse?.days.count ?? 0, label: "有内容的日期")
      }
    }
    .padding(.horizontal, 30)
    .padding(.top, 22)
    .padding(.bottom, 16)
  }

  private var controls: some View {
    HStack(spacing: 10) {
      Button { Task { await model.shiftMonth(by: -1) } } label: {
        Image(systemName: "chevron.left")
      }
      .buttonStyle(.bordered)

      Text(SharedFormatters.monthText(model.month))
        .font(.title3.weight(.semibold))
        .frame(minWidth: 110)

      Button { Task { await model.shiftMonth(by: 1) } } label: {
        Image(systemName: "chevron.right")
      }
      .buttonStyle(.bordered)

      Button("回到今天") {
        withAnimation(.easeOut(duration: 0.2)) {
          isDayExpanded = true
        }
        Task { await model.selectToday() }
      }
      .buttonStyle(.bordered)

      Spacer()

      Picker("影视类型", selection: $model.mediaType) {
        Text("全部").tag("")
        Text("电影").tag("movie")
        Text("剧集").tag("series")
        Text("动画").tag("anime")
        Text("综艺").tag("variety")
        Text("短剧").tag("short_drama")
        Text("纪录片").tag("documentary")
      }
      .pickerStyle(.segmented)
      .frame(maxWidth: 470)
    }
    .padding(.horizontal, 30)
    .padding(.bottom, 16)
  }

  @ViewBuilder
  private var content: some View {
    switch model.monthState {
    case .idle, .loading:
      FeatureLoadingView(title: "加载月历摘要")
    case let .failed(message):
      FeatureFailureView(message: message) { Task { await model.loadMonth() } }
    case .empty, .loaded:
      GeometryReader { proxy in
        calendarLayout(width: proxy.size.width)
      }
    }
  }

  @ViewBuilder
  private func calendarLayout(width: CGFloat) -> some View {
    if width >= 1_000 {
      HStack(spacing: 0) {
        ScrollView {
          monthGrid
            .padding(24)
        }
        .frame(maxWidth: .infinity)

        if isDayExpanded {
          Divider()
          ScrollView {
            selectedDay
              .padding(22)
          }
          .frame(width: min(max(width * 0.32, 340), 430))
          .background(.ultraThinMaterial)
          .transition(.move(edge: .trailing).combined(with: .opacity))
        }
      }
      .animation(.easeOut(duration: 0.22), value: isDayExpanded)
    } else {
      ScrollView {
        VStack(alignment: .leading, spacing: 22) {
          monthGrid
          if isDayExpanded {
            selectedDay
              .padding(18)
              .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
        }
        .padding(24)
      }
      .animation(.easeOut(duration: 0.22), value: isDayExpanded)
    }
  }

  private var monthGrid: some View {
    let cells = Self.calendarCells(model.month)
    return VStack(alignment: .leading, spacing: 10) {
      HStack {
        ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { weekday in
          Text("周\(weekday)")
            .font(.caption.weight(.semibold))
            .foregroundStyle(weekday == "六" || weekday == "日" ? DesignSystem.cueRed : Color.secondary)
            .frame(maxWidth: .infinity)
        }
      }

      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 7), spacing: 8) {
        ForEach(cells, id: \.dateKey) { cell in
          CalendarDayCell(
            client: client,
            cell: cell,
            summary: model.dayMap[cell.dateKey],
            isSelected: cell.dateKey == model.selectedDate && isDayExpanded
          ) {
            select(cell)
          }
          .accessibilityLabel(calendarCellAccessibilityLabel(cell: cell, summary: model.dayMap[cell.dateKey]))
        }
      }
    }
  }

  private func select(_ cell: CalendarCell) {
    if cell.dateKey == model.selectedDate, isDayExpanded {
      withAnimation(.easeOut(duration: 0.2)) {
        isDayExpanded = false
      }
      return
    }

    withAnimation(.easeOut(duration: 0.2)) {
      isDayExpanded = true
    }
    Task { await model.select(date: cell.date) }
  }

  private func calendarCellAccessibilityLabel(cell: CalendarCell, summary: CalendarDay?) -> String {
    guard let summary, summary.count > 0 else {
      return "\(cell.dateKey)，暂无排期"
    }
    if let featured = summary.items.first {
      return "\(cell.dateKey)，\(summary.count) 部作品，代表作品 \(featured.mediaItem.preferredTitle)"
    }
    return "\(cell.dateKey)，\(summary.count) 部作品"
  }

  @ViewBuilder
  private var selectedDay: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(selectedDatePresentation.day)
            .font(.system(size: 46, weight: .bold, design: .serif))
            .monospacedDigit()
            .foregroundStyle(DesignSystem.reelBlue)
          Text("\(selectedDatePresentation.month) · \(selectedDatePresentation.weekday)")
            .font(.headline)
          Text(model.selectedDate)
            .font(.caption.monospaced())
            .foregroundStyle(.secondary)
        }
        Spacer()
        Button {
          withAnimation(.easeOut(duration: 0.2)) {
            isDayExpanded = false
          }
        } label: {
          Image(systemName: "xmark")
        }
        .buttonStyle(.bordered)
        .help("收起当天片单")
      }

      HStack {
        Text("当天片单")
          .font(DesignSystem.sectionTitle)
        Spacer()
        Text("\(model.dayResponse?.items.count ?? 0) 条排期")
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
      }

      switch model.dayState {
      case .idle, .loading:
        ProgressView("加载当天排期…")
          .frame(maxWidth: .infinity, minHeight: 180)
      case let .failed(message):
        FeatureFailureView(title: "当天排期加载失败", message: message) { Task { await model.loadDay() } }
          .frame(minHeight: 220)
      case .empty:
        FeatureEmptyView(title: "当天暂无排期", message: "再点一个日期看看。", systemImage: "calendar")
          .frame(minHeight: 220)
      case .loaded:
        LazyVStack(spacing: 10) {
          ForEach(model.dayResponse?.items ?? []) { release in
            Button { onSelectMedia(release.mediaItem.id) } label: {
              CalendarReleaseRow(client: client, release: release)
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
  }

  private var selectedDatePresentation: (day: String, month: String, weekday: String) {
    let parser = DateFormatter()
    parser.calendar = Calendar(identifier: .gregorian)
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.timeZone = .current
    parser.dateFormat = "yyyy-MM-dd"
    guard let date = parser.date(from: model.selectedDate) else {
      return (String(model.selectedDate.suffix(2)), "", "")
    }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.dateFormat = "M月|EEEE"
    let parts = formatter.string(from: date).split(separator: "|", omittingEmptySubsequences: false)
    return (
      String(Calendar.current.component(.day, from: date)),
      parts.first.map(String.init) ?? "",
      parts.count > 1 ? String(parts[1]) : ""
    )
  }

  private static func calendarCells(_ month: Date) -> [CalendarCell] {
    let calendar = Calendar.current
    let start = calendar.date(from: calendar.dateComponents([.year, .month], from: month)) ?? month
    let weekday = calendar.component(.weekday, from: start)
    let leading = (weekday + 5) % 7
    return (0..<42).compactMap { offset in
      guard let date = calendar.date(byAdding: .day, value: offset - leading, to: start) else { return nil }
      return CalendarCell(
        date: date,
        dateKey: CalendarViewModel.dateKey(date),
        isCurrentMonth: calendar.isDate(date, equalTo: month, toGranularity: .month)
      )
    }
  }
}

private struct CalendarMetric: View {
  let value: Int
  let label: String

  var body: some View {
    VStack(alignment: .trailing, spacing: 2) {
      Text(String(value))
        .font(.title.weight(.bold))
        .monospacedDigit()
        .foregroundStyle(DesignSystem.reelBlue)
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

private struct CalendarCell {
  let date: Date
  let dateKey: String
  let isCurrentMonth: Bool
}

private struct CalendarDayCell: View {
  let client: APIClient
  let cell: CalendarCell
  let summary: CalendarDay?
  let isSelected: Bool
  let action: () -> Void
  @State private var isHovering = false

  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 7) {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
          Text(String(Calendar.current.component(.day, from: cell.date)))
            .font(.title3.weight(Calendar.current.isDateInToday(cell.date) ? .bold : .semibold))
            .foregroundStyle(Calendar.current.isDateInToday(cell.date) ? DesignSystem.cueRed : Color.primary)
          Spacer(minLength: 0)
          if let summary, summary.count > 0 {
            Text("\(summary.count)")
              .font(.caption2.monospaced().weight(.bold))
              .foregroundStyle(isSelected ? .white : DesignSystem.reelBlue)
              .padding(.horizontal, 6)
              .padding(.vertical, 3)
              .background(isSelected ? DesignSystem.reelBlue : DesignSystem.reelBlue.opacity(0.1), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
          }
        }

        Spacer(minLength: 0)

        if let featured = summary?.items.first {
          VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .bottom, spacing: 7) {
              NASPosterView(
                client: client,
                mediaID: featured.mediaItem.id,
                title: featured.mediaItem.preferredTitle,
                posterAvailable: featured.mediaItem.posterUrl != nil,
                mediaStatus: featured.mediaItem.status,
                width: .small
              )
              .frame(width: 34, height: 51)
              .accessibilityHidden(true)
              Text(featured.mediaItem.preferredTitle)
                .font(.caption.weight(.medium))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            }
            ContentStatusBadge(featured.releaseStatus)
          }
        } else {
          Text("暂无排期")
            .font(.caption2)
            .foregroundStyle(.tertiary)
        }
      }
      .padding(10)
      .frame(maxWidth: .infinity, minHeight: 118, alignment: .topLeading)
      .background {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(isSelected ? DesignSystem.reelBlue.opacity(0.16) : Color.primary.opacity(isHovering ? 0.07 : 0.035))
      }
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .strokeBorder(isSelected ? DesignSystem.reelBlue.opacity(0.7) : Color.primary.opacity(isHovering ? 0.16 : 0.07), lineWidth: isSelected ? 1.5 : 1)
      }
      .contentShape(Rectangle())
      .scaleEffect(isHovering ? 1.012 : 1)
      .opacity(cell.isCurrentMonth ? 1 : 0.38)
    }
    .buttonStyle(.plain)
    .onHover { hovering in
      withAnimation(.easeOut(duration: 0.15)) {
        isHovering = hovering
      }
    }
  }
}

private struct CalendarReleaseRow: View {
  let client: APIClient
  let release: ReleaseRow

  var body: some View {
    HStack(spacing: 12) {
      NASPosterView(
        client: client,
        mediaID: release.mediaItem.id,
        title: release.mediaItem.preferredTitle,
        posterAvailable: release.mediaItem.posterUrl != nil,
        mediaStatus: release.mediaItem.status,
        width: .small
      )
      .frame(width: 48, height: 72)

      VStack(alignment: .leading, spacing: 5) {
        Text(release.mediaItem.preferredTitle)
          .font(.callout.weight(.semibold))
          .lineLimit(2)
        if let secondaryTitle = release.mediaItem.secondaryTitle {
          Text(secondaryTitle)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Text(release.platform == "Unspecified" ? "平台待确认" : release.platform)
          .font(.caption)
          .foregroundStyle(.secondary)
        HStack(spacing: 7) {
          if let season = release.seasonNumber, let episode = release.episodeNumber {
            Text("S\(season) E\(episode)")
          }
          if let title = release.episodeTitle, !title.isEmpty {
            Text(title).lineLimit(1)
          }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
      }
      Spacer(minLength: 6)
      VStack(alignment: .trailing, spacing: 5) {
        ContentStatusBadge(release.releaseStatus)
        Text(release.releasePattern.replacingOccurrences(of: "_", with: " "))
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    .contentShape(Rectangle())
  }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
