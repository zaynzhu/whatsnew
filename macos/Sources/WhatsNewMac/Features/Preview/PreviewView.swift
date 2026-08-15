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
      case .empty:
        content
      case .loaded:
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
            .background(DesignSystem.cueRed.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
        }
        if model.filteredDays.isEmpty && model.filteredUndated.isEmpty {
          FeatureEmptyView(title: "暂无前瞻条目", message: "当前筛选没有待映或待播作品。", systemImage: "calendar.badge.clock")
            .frame(minHeight: 220)
        } else {
          ForEach(model.filteredDays) { day in
            PreviewDateSection(client: client, day: day, onSelectMedia: onSelectMedia)
          }
          if !model.filteredUndated.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              SectionHeader(title: "未定档", subtitle: "按豆瓣热门名次优先")
              ForEach(model.filteredUndated) { item in
                PreviewReleaseRowView(client: client, item: item, onSelect: { onSelectMedia(item.mediaItemId) })
              }
            }
          }
        }
      }
      .padding(28)
    }
  }

  private var header: some View {
    HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 8) {
        Text("前瞻")
          .font(.system(size: 32, weight: .semibold, design: .serif))
          .foregroundStyle(DesignSystem.archiveOlive)
        Text("豆瓣未来日期与未定档条目，保留热门名次和想看人数。")
          .foregroundStyle(.secondary)
      }
      Spacer()
      if let summary = model.response?.summary {
        HStack(spacing: 18) {
          SummaryMetric(value: summary.total, label: "全部")
          SummaryMetric(value: summary.movies, label: "电影")
          SummaryMetric(value: summary.series, label: "剧集")
          SummaryMetric(value: summary.hot, label: "热门")
        }
      }
    }
  }

  private var controls: some View {
    HStack(spacing: 12) {
      Picker("类型", selection: $model.filter) {
        Text("全部").tag("")
        Text("电影").tag("movie")
        Text("剧集").tag("series")
      }
      .pickerStyle(.segmented)
      .frame(width: 210)
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
  }
}

private struct SummaryMetric: View {
  let value: Int
  let label: String

  var body: some View {
    VStack(alignment: .trailing, spacing: 2) {
      Text(String(value))
        .font(.title2.weight(.semibold))
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

private struct PreviewDateSection: View {
  let client: APIClient
  let day: FilteredPreviewDay
  let onSelectMedia: (String) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text(SharedFormatters.dateText(fromISO8601: "\(day.date)T00:00:00Z"))
          .font(DesignSystem.sectionTitle)
        Text("\(day.items.count) 部")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      ForEach(day.items) { item in
        PreviewReleaseRowView(client: client, item: item, onSelect: { onSelectMedia(item.mediaItemId) })
      }
    }
  }
}

private struct PreviewReleaseRowView: View {
  let client: APIClient
  let item: PreviewReleaseRow
  let onSelect: () -> Void

  var body: some View {
    Button(action: onSelect) {
      HStack(spacing: 12) {
        NASPosterView(
          client: client,
          mediaID: item.mediaItem.id,
          title: item.mediaItem.titleDisplay,
          posterAvailable: item.mediaItem.posterUrl != nil,
          mediaStatus: item.mediaItem.status,
          width: .small
        )
        .frame(width: 45, height: 68)
        VStack(alignment: .leading, spacing: 4) {
          Text(item.mediaItem.titleDisplay)
            .font(.callout.weight(.medium))
            .lineLimit(1)
          HStack(spacing: 8) {
            SemanticStatusBadge(item.releasePattern == "theatrical_coming_soon" ? "movie" : "series")
            if let rank = item.doubanHotRank {
              Text("豆瓣 #\(rank)")
                .font(.caption.monospaced())
                .foregroundStyle(DesignSystem.cueRed)
            }
            if let wish = item.doubanWishCount {
              Text("想看 \(SharedFormatters.numberText(wish))")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
        }
        Spacer()
        Text(item.releaseDate ?? "日期待定")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding(10)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}
