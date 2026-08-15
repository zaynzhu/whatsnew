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
    HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 8) {
        Text("日历")
          .font(.system(size: 32, weight: .semibold, design: .serif))
          .foregroundStyle(DesignSystem.archiveOlive)
        Text("月视图显示每日作品摘要，选日后查看完整排期。")
          .foregroundStyle(.secondary)
      }
      Spacer()
      let total = (model.monthResponse?.days ?? []).reduce(0) { $0 + $1.count }
      VStack(alignment: .trailing, spacing: 3) {
        Text("\(total) 部作品")
          .font(.title2.weight(.semibold))
        Text("\(model.monthResponse?.days.count ?? 0) 个播出日")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(28)
  }

  private var controls: some View {
    HStack(spacing: 12) {
      Button { Task { await model.shiftMonth(by: -1) } } label: {
        Image(systemName: "chevron.left")
      }
      .buttonStyle(.bordered)
      Text(SharedFormatters.monthText(model.month))
        .font(.callout.weight(.medium))
        .frame(minWidth: 90)
      Button("今天") {
        Task { await model.selectToday() }
      }
      .buttonStyle(.bordered)
      Button { Task { await model.shiftMonth(by: 1) } } label: {
        Image(systemName: "chevron.right")
      }
      .buttonStyle(.bordered)
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
      .frame(maxWidth: 430)
      Spacer()
    }
    .padding(.horizontal, 28)
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
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          monthGrid
          selectedDay
        }
        .padding(28)
      }
    }
  }

  private var monthGrid: some View {
    let cells = Self.calendarCells(model.month)
    return VStack(alignment: .leading, spacing: 8) {
      HStack {
        ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { weekday in
          Text("周\(weekday)")
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
        }
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
        ForEach(cells, id: \.dateKey) { cell in
          let summary = model.dayMap[cell.dateKey]
          Button {
            Task { await model.select(date: cell.date) }
          } label: {
            VStack(alignment: .leading, spacing: 5) {
              HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(cell.dateKey.suffix(2))
                  .font(.callout.weight(cell.isCurrentMonth ? .semibold : .regular))
                Spacer(minLength: 0)
                if let summary, summary.count > 0 {
                  Text("\(summary.count) 部")
                    .font(.caption2)
                    .foregroundStyle(DesignSystem.cueRed)
                }
              }
              Spacer(minLength: 0)
              if let featured = summary?.items.first {
                HStack(alignment: .bottom, spacing: 6) {
                  Text(featured.mediaItem.titleDisplay)
                    .font(.caption2.weight(.medium))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                  Spacer(minLength: 0)
                  NASPosterView(
                    client: client,
                    mediaID: featured.mediaItem.id,
                    title: featured.mediaItem.titleDisplay,
                    posterAvailable: featured.mediaItem.posterUrl != nil,
                    mediaStatus: featured.mediaItem.status,
                    width: .small
                  )
                  .frame(width: 28, height: 42)
                  .accessibilityHidden(true)
                }
              } else {
                Text("暂无排期")
                  .font(.caption2)
                  .foregroundStyle(.tertiary)
              }
            }
            .padding(8)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .background {
              if cell.dateKey == model.selectedDate {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                  .fill(DesignSystem.reelBlue.opacity(0.18))
              } else {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                  .fill(.thinMaterial)
              }
            }
            .opacity(cell.isCurrentMonth ? 1 : 0.45)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(calendarCellAccessibilityLabel(cell: cell, summary: summary))
        }
      }
    }
  }

  private func calendarCellAccessibilityLabel(cell: CalendarCell, summary: CalendarDay?) -> String {
    guard let summary, summary.count > 0 else {
      return "\(cell.dateKey)，暂无排期"
    }
    if let featured = summary.items.first {
      return "\(cell.dateKey)，\(summary.count) 部作品，代表作品 \(featured.mediaItem.titleDisplay)"
    }
    return "\(cell.dateKey)，\(summary.count) 部作品"
  }

  @ViewBuilder
  private var selectedDay: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "\(model.selectedDate) 排期", subtitle: "完整保留多集、多平台和多来源记录")
      switch model.dayState {
      case .idle, .loading:
        ProgressView("加载当天排期…")
      case let .failed(message):
        FeatureFailureView(title: "当天排期加载失败", message: message) { Task { await model.loadDay() } }
          .frame(minHeight: 180)
      case .empty:
        FeatureEmptyView(title: "当天暂无排期", message: "可以选择其他日期查看。", systemImage: "calendar")
          .frame(minHeight: 180)
      case .loaded:
        LazyVStack(spacing: 0) {
          ForEach(model.dayResponse?.items ?? []) { release in
            Button { onSelectMedia(release.mediaItem.id) } label: {
              CalendarReleaseRow(release: release)
            }
            .buttonStyle(.plain)
            Divider()
          }
        }
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      }
    }
  }

  private struct CalendarCell {
    let date: Date
    let dateKey: String
    let isCurrentMonth: Bool
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

private struct CalendarReleaseRow: View {
  let release: ReleaseRow

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(release.mediaItem.titleDisplay)
          .font(.callout.weight(.medium))
        HStack(spacing: 8) {
          Text(release.platform == "Unspecified" ? "平台待确认" : release.platform)
          if let season = release.seasonNumber, let episode = release.episodeNumber {
            Text("S\(season) E\(episode)")
          }
          if let title = release.episodeTitle, !title.isEmpty {
            Text(title).lineLimit(1)
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 4) {
        Text(release.releasePattern.replacingOccurrences(of: "_", with: " "))
          .font(.caption)
        SemanticStatusBadge(release.releaseStatus)
      }
    }
    .padding(10)
    .contentShape(Rectangle())
  }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
