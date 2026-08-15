import Observation
import SwiftUI
import WhatsNewCore

@MainActor
@Observable
final class PreviewViewModel {
  private let client: APIClient
  private(set) var response: PreviewResponse?
  private(set) var state: FeatureLoadState = .idle
  private(set) var isRefreshing = false
  private(set) var isSyncing = false
  private(set) var syncError: String?
  var filter = ""

  init(client: APIClient) {
    self.client = client
  }

  func load(refresh: Bool = false) async {
    if refresh || response != nil {
      isRefreshing = true
    } else {
      state = .loading
    }
    defer { isRefreshing = false }
    do {
      let result = try await client.preview()
      response = result
      state = result.summary.total == 0 ? .empty : .loaded
    } catch {
      if response == nil {
        state = .failed((error as? LocalizedError)?.errorDescription ?? "前瞻数据暂时无法加载")
      }
    }
  }

  func sync() async {
    guard !isSyncing else { return }
    isSyncing = true
    syncError = nil
    defer { isSyncing = false }
    do {
      let result = try await client.syncPreview()
      isSyncing = result.syncing
      if result.syncing {
        try? await Task.sleep(for: .seconds(1))
      }
      await load(refresh: true)
    } catch {
      syncError = (error as? LocalizedError)?.errorDescription ?? "前瞻同步请求失败"
    }
  }

  fileprivate var filteredDays: [FilteredPreviewDay] {
    (response?.days ?? []).compactMap { day in
      let items = day.items.filter { matches($0) }
      return items.isEmpty ? nil : FilteredPreviewDay(date: day.date, items: items)
    }
  }

  var filteredUndated: [PreviewReleaseRow] {
    (response?.undated ?? []).filter(matches)
  }

  private func matches(_ item: PreviewReleaseRow) -> Bool {
    switch filter {
    case "movie": return item.releasePattern == "theatrical_coming_soon"
    case "series": return item.releasePattern == "tv_coming_soon"
    default: return true
    }
  }
}

fileprivate struct FilteredPreviewDay: Identifiable {
  let date: String
  let items: [PreviewReleaseRow]
  var id: String { date }
}

public struct PreviewView: View {
  private let client: APIClient
  private let onSelectMedia: (String) -> Void
  @State private var model: PreviewViewModel

  public init(client: APIClient, onSelectMedia: @escaping (String) -> Void = { _ in }) {
    self.client = client
    self.onSelectMedia = onSelectMedia
    _model = State(initialValue: PreviewViewModel(client: client))
  }

  public var body: some View {
    Group {
      switch model.state {
      case .idle, .loading:
        FeatureLoadingView(title: "加载前瞻时间线")
      case let .failed(message):
        FeatureFailureView(title: "前瞻加载失败", message: message) { Task { await model.load() } }
      case .empty, .loaded:
        content
      }
    }
    .task { await model.load() }
    .refreshable { await model.load(refresh: true) }
    .overlay(alignment: .topTrailing) {
      if model.isRefreshing {
        ProgressView()
          .controlSize(.small)
          .padding(16)
      }
    }
  }

  private var content: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        header
        controls

        if let error = model.syncError {
          Label(error, systemImage: "exclamationmark.triangle")
            .font(.callout)
            .foregroundStyle(DesignSystem.cueRed)
        }

        if let response = model.response, !response.source.enabled {
          Text("豆瓣数据源未启用，当前展示的是已有快照。")
            .font(.callout)
            .foregroundStyle(DesignSystem.cueRed)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DesignSystem.cueRed.opacity(0.1), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }

        if model.filteredDays.isEmpty && model.filteredUndated.isEmpty {
          FeatureEmptyView(title: "暂无前瞻条目", message: "当前筛选没有待映或待播作品。", systemImage: "calendar.badge.clock")
            .frame(minHeight: 260)
        } else {
          VStack(alignment: .leading, spacing: 0) {
            ForEach(model.filteredDays) { day in
              PreviewTimelineSection(
                client: client,
                date: day.date,
                items: day.items,
                onSelectMedia: onSelectMedia
              )
            }

            if !model.filteredUndated.isEmpty {
              PreviewTimelineSection(
                client: client,
                date: nil,
                items: model.filteredUndated,
                onSelectMedia: onSelectMedia
              )
            }
          }
        }
      }
      .padding(.horizontal, 30)
      .padding(.top, 24)
      .padding(.bottom, 42)
      .frame(maxWidth: 1_480, alignment: .leading)
      .frame(maxWidth: .infinity)
    }
  }

  private var header: some View {
    HStack(alignment: .bottom, spacing: 30) {
      VStack(alignment: .leading, spacing: 8) {
        Text("前瞻时间线")
          .font(DesignSystem.pageTitle)
          .tracking(-0.8)
          .foregroundStyle(DesignSystem.archiveOlive)
        Text("顺着日期向下看，每一天都是一条即将到来的片单。")
          .font(.title3)
          .foregroundStyle(.secondary)
      }
      Spacer()
      if let summary = model.response?.summary {
        HStack(spacing: 22) {
          PreviewSummaryMetric(value: summary.total, label: "全部")
          PreviewSummaryMetric(value: summary.movies, label: "电影")
          PreviewSummaryMetric(value: summary.series, label: "剧集")
          PreviewSummaryMetric(value: summary.hot, label: "热门", tint: DesignSystem.cueRed)
        }
      }
    }
  }

  private var controls: some View {
    HStack(spacing: 14) {
      Picker("类型", selection: $model.filter) {
        Text("全部").tag("")
        Text("电影").tag("movie")
        Text("剧集").tag("series")
      }
      .pickerStyle(.segmented)
      .frame(width: 240)

      Spacer()

      if let source = model.response?.source {
        Text(source.lastSuccessAt.map { "更新于 \(SharedFormatters.dateTimeText(fromISO8601: $0))" } ?? "尚未成功同步")
          .font(.caption)
          .foregroundStyle(.secondary)
        Button {
          Task { await model.sync() }
        } label: {
          Label(model.isSyncing ? "同步中" : "立即同步", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.borderedProminent)
        .tint(DesignSystem.archiveOlive)
        .disabled(model.isSyncing || !source.enabled || !source.runnable)
      }
    }
    .padding(14)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

private struct PreviewSummaryMetric: View {
  let value: Int
  let label: String
  var tint: Color = .primary

  var body: some View {
    VStack(alignment: .trailing, spacing: 2) {
      Text(String(value))
        .font(.title.weight(.bold))
        .monospacedDigit()
        .foregroundStyle(tint)
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

private struct PreviewTimelineSection: View {
  let client: APIClient
  let date: String?
  let items: [PreviewReleaseRow]
  let onSelectMedia: (String) -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 16) {
      VStack(alignment: .trailing, spacing: 2) {
        if date != nil {
          Text(datePresentation.day)
            .font(.system(size: 38, weight: .bold, design: .serif))
            .monospacedDigit()
            .foregroundStyle(DesignSystem.archiveOlive)
          Text(datePresentation.month)
            .font(.callout.weight(.semibold))
          Text(datePresentation.weekday)
            .font(.caption)
            .foregroundStyle(.secondary)
        } else {
          Text("待定")
            .font(.title2.weight(.bold))
            .foregroundStyle(DesignSystem.cinemaGold)
          Text("未定档")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Text("\(items.count) 部")
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
          .padding(.top, 4)
      }
      .frame(width: 82, alignment: .topTrailing)

      VStack(spacing: 0) {
        Circle()
          .fill(date == nil ? DesignSystem.cinemaGold : DesignSystem.archiveOlive)
          .frame(width: 12, height: 12)
          .overlay {
            Circle()
              .stroke(.background, lineWidth: 3)
          }
        Rectangle()
          .fill(DesignSystem.archiveOlive.opacity(0.25))
          .frame(width: 2)
          .frame(maxHeight: .infinity)
      }
      .frame(width: 14)

      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .firstTextBaseline) {
          Text(date.map { SharedFormatters.dateText(fromISO8601: "\($0)T00:00:00Z") } ?? "还没有确定日期")
            .font(DesignSystem.sectionTitle)
          Spacer()
          if items.contains(where: { $0.doubanHotRank != nil }) {
            Label("含豆瓣热门", systemImage: "flame.fill")
              .font(.caption.weight(.medium))
              .foregroundStyle(DesignSystem.cueRed)
          }
        }

        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(alignment: .top, spacing: 14) {
            ForEach(items) { item in
              PreviewPosterCard(client: client, item: item) {
                onSelectMedia(item.mediaItemId)
              }
            }
          }
          .padding(.vertical, 3)
        }
      }
      .padding(.bottom, 30)
    }
  }

  private var datePresentation: (day: String, month: String, weekday: String) {
    guard let date else { return ("", "", "") }
    let parser = DateFormatter()
    parser.calendar = Calendar(identifier: .gregorian)
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.dateFormat = "yyyy-MM-dd"
    guard let value = parser.date(from: date) else {
      return (String(date.suffix(2)), "", "")
    }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.dateFormat = "M月|EEEE"
    let parts = formatter.string(from: value).split(separator: "|", omittingEmptySubsequences: false)
    return (
      String(Calendar.current.component(.day, from: value)),
      parts.first.map(String.init) ?? "",
      parts.count > 1 ? String(parts[1]) : ""
    )
  }
}

private struct PreviewPosterCard: View {
  let client: APIClient
  let item: PreviewReleaseRow
  let onSelect: () -> Void
  @State private var isHovering = false

  var body: some View {
    Button(action: onSelect) {
      VStack(alignment: .leading, spacing: 8) {
        ZStack(alignment: .topTrailing) {
          NASPosterView(
            client: client,
            mediaID: item.mediaItem.id,
            title: item.mediaItem.preferredTitle,
            posterAvailable: item.mediaItem.posterUrl != nil,
            mediaStatus: item.mediaItem.status,
            width: .medium
          )
          .frame(width: 132, height: 198)

          if let rank = item.doubanHotRank {
            Text("#\(rank)")
              .font(.caption.monospaced().weight(.bold))
              .foregroundStyle(.white)
              .padding(.horizontal, 7)
              .padding(.vertical, 5)
              .background(DesignSystem.cueRed, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
              .padding(7)
          }
        }
        .shadow(color: DesignSystem.archiveOlive.opacity(isHovering ? 0.24 : 0.1), radius: isHovering ? 15 : 7, y: 7)

        Text(item.mediaItem.preferredTitle)
          .font(.callout.weight(.semibold))
          .lineLimit(2)
          .frame(width: 132, alignment: .leading)

        if let secondaryTitle = item.mediaItem.secondaryTitle {
          Text(secondaryTitle)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .frame(width: 132, alignment: .leading)
        }

        HStack(spacing: 6) {
          Text(StatusPresentation.label(item.releasePattern == "theatrical_coming_soon" ? "movie" : "series"))
          if let wish = item.doubanWishCount {
            Text("想看 \(SharedFormatters.numberText(wish))")
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
      }
      .frame(width: 132, alignment: .leading)
      .contentShape(Rectangle())
      .offset(y: isHovering ? -4 : 0)
    }
    .buttonStyle(.plain)
    .onHover { hovering in
      withAnimation(.easeOut(duration: 0.18)) {
        isHovering = hovering
      }
    }
  }
}
