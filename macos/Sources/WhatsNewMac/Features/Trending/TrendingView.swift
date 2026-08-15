import Observation
import SwiftUI
import WhatsNewCore

@MainActor
@Observable
final class TrendingViewModel {
  private let client: APIClient
  private(set) var response: TrendingResponse?
  private(set) var state: FeatureLoadState = .idle
  private(set) var isRefreshing = false
  var source = ""
  var platform = ""
  var region = ""
  var window = ""
  var mediaType = ""
  var rankingScope = ""
  var movement = ""

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
      let result = try await client.trending(
        source: source.nilIfEmpty,
        platform: platform.nilIfEmpty,
        region: region.nilIfEmpty,
        mediaType: mediaType.nilIfEmpty,
        window: window.nilIfEmpty,
        rankingScope: rankingScope.nilIfEmpty,
        movement: PopularityMovement(rawValue: movement)
      )
      response = result
      state = result.items.isEmpty ? .empty : .loaded
    } catch {
      if response == nil {
        state = .failed((error as? LocalizedError)?.errorDescription ?? "热度数据暂时无法加载")
      }
    }
  }
}

public struct TrendingView: View {
  private let client: APIClient
  private let onSelectMedia: (String) -> Void
  @State private var model: TrendingViewModel

  public init(client: APIClient, onSelectMedia: @escaping (String) -> Void = { _ in }) {
    self.client = client
    self.onSelectMedia = onSelectMedia
    _model = State(initialValue: TrendingViewModel(client: client))
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      controls
      Divider()
      resultBody
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

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("热度")
        .font(.system(size: 32, weight: .semibold, design: .serif))
        .foregroundStyle(DesignSystem.cueRed)
      Text("按来源、平台、地区、窗口和榜单范围复核当前热度信号。")
        .foregroundStyle(.secondary)
    }
    .padding(28)
  }

  private var controls: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 12) {
        Picker("来源", selection: $model.source) {
        Text("全部来源").tag("")
        Text("TMDb 电影趋势").tag("tmdb_trending")
        Text("TMDb 剧集趋势").tag("tmdb_tv_trending")
        Text("Trakt 趋势").tag("trakt_trending")
        Text("Trakt 期待榜").tag("trakt_anticipated")
        Text("Netflix Top 10").tag("netflix_top10")
        Text("IMDb 评分").tag("imdb_rating")
        Text("哔哩哔哩榜单").tag("bilibili_rank")
        Text("优酷预约").tag("youku_reserve")
        Text("爱奇艺预约").tag("iqiyi_reserve")
        Text("腾讯视频预约").tag("tencent_reserve")
        Text("豆瓣榜单").tag("douban_top")
        Text("豆瓣前瞻").tag("douban_upcoming_hot")
        }
        .frame(width: 210)
        Picker("榜单范围", selection: $model.rankingScope) {
        Text("全部范围").tag("")
        Text("电影榜").tag("movie")
        Text("剧集榜").tag("series")
        Text("英语电影榜").tag("films_english")
        Text("非英语电影榜").tag("films_non_english")
        Text("英语剧集榜").tag("tv_english")
        Text("非英语剧集榜").tag("tv_non_english")
        }
        .frame(width: 175)
        Picker("平台", selection: $model.platform) {
        Text("全部平台").tag("")
        Text("IMDb").tag("IMDb")
        Text("TMDb").tag("TMDb")
        Text("Trakt").tag("Trakt")
        Text("Netflix").tag("Netflix")
        Text("豆瓣").tag("豆瓣")
        Text("优酷").tag("优酷")
        Text("哔哩哔哩").tag("哔哩哔哩")
        Text("爱奇艺").tag("爱奇艺")
        Text("腾讯视频").tag("腾讯视频")
        }
        .frame(width: 145)
        Picker("地区", selection: $model.region) {
        Text("全部地区").tag("")
        Text("全球").tag("GLOBAL")
        Text("中国大陆").tag("CN")
        Text("美国").tag("US")
        }
        .frame(width: 135)
        Spacer()
      }
      HStack(spacing: 12) {
        Picker("窗口", selection: $model.window) {
        Text("全部窗口").tag("")
        Text("当前").tag("current")
        Text("本周").tag("week")
        Text("即将上线").tag("upcoming")
        Text("累计").tag("lifetime")
        }
        .frame(width: 145)
        Picker("类型", selection: $model.mediaType) {
        Text("全部类型").tag("")
        Text("电影").tag("movie")
        Text("剧集").tag("series")
        Text("动画").tag("anime")
        Text("综艺").tag("variety")
        Text("短剧").tag("short_drama")
        Text("纪录片").tag("documentary")
        }
        .frame(width: 145)
        Picker("走势", selection: $model.movement) {
        Text("全部走势").tag("")
        Text("新进榜").tag("new")
        Text("上升").tag("rising")
        Text("下降").tag("falling")
        Text("稳定").tag("stable")
        }
        .frame(width: 145)
        Button("刷新") { Task { await model.load(refresh: true) } }
          .buttonStyle(.borderedProminent)
          .tint(DesignSystem.cueRed)
        Spacer()
      }
    }
    .padding(.horizontal, 28)
    .padding(.bottom, 16)
    .onChange(of: model.source) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.rankingScope) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.platform) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.region) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.window) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.mediaType) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.movement) { _, _ in Task { await model.load(refresh: true) } }
  }

  @ViewBuilder
  private var resultBody: some View {
    switch model.state {
    case .idle, .loading:
      FeatureLoadingView(title: "加载热度榜")
    case let .failed(message):
      FeatureFailureView(message: message) { Task { await model.load() } }
    case .empty:
      FeatureEmptyView(title: "暂无热度信号", message: "当前筛选没有匹配的榜单信号。", systemImage: "chart.line.uptrend.xyaxis")
    case .loaded:
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 12) {
          ForEach(groupedItems, id: \.id) { group in
            TrendingWorkRow(client: client, group: group) {
              onSelectMedia(group.mediaItem.id)
            }
          }
        }
        .padding(28)
      }
    }
  }

  private var groupedItems: [TrendingGroup] {
    let items = model.response?.items ?? []
    var groups: [String: [PopularitySignal]] = [:]
    for signal in items {
      groups[signal.mediaItem?.id ?? signal.mediaItemId, default: []].append(signal)
    }
    return groups.compactMap { key, signals in
      guard let mediaItem = signals.first?.mediaItem else { return nil }
      return TrendingGroup(id: key, mediaItem: mediaItem, signals: signals)
    }
    .sorted { left, right in
      if model.source.isEmpty { return left.mediaItem.heatScore > right.mediaItem.heatScore }
      return (left.signals.first?.rank ?? Int.max) < (right.signals.first?.rank ?? Int.max)
    }
  }
}

private struct TrendingGroup: Identifiable {
  let id: String
  let mediaItem: MediaItem
  let signals: [PopularitySignal]
}

private struct TrendingWorkRow: View {
  let client: APIClient
  let group: TrendingGroup
  let onSelect: () -> Void

  var body: some View {
    Button(action: onSelect) {
      HStack(alignment: .top, spacing: 14) {
        NASPosterView(
          client: client,
          mediaID: group.mediaItem.id,
          title: group.mediaItem.titleDisplay,
          posterAvailable: group.mediaItem.posterUrl != nil,
          mediaStatus: group.mediaItem.status,
          width: .small
        )
        .frame(width: 52, height: 78)
        VStack(alignment: .leading, spacing: 7) {
          HStack {
            Text(group.mediaItem.titleDisplay)
              .font(.headline)
            SemanticStatusBadge(group.mediaItem.mediaType)
            Spacer()
            Text("Heat \(SharedFormatters.numberText(group.mediaItem.heatScore))")
              .font(.caption.monospaced())
              .foregroundStyle(DesignSystem.cueRed)
          }
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 170), alignment: .leading)], alignment: .leading, spacing: 5) {
            ForEach(group.signals) { signal in
              HStack(spacing: 5) {
                Text(signal.source)
                  .font(.caption.weight(.medium))
                if let scope = signal.rankingEntryLabel ?? (signal.rankingScope == "overall" ? nil : signal.rankingScope) {
                  Text(scope)
                    .foregroundStyle(.secondary)
                }
                Text(signal.rank.map { "#\($0)" } ?? "—")
                  .fontWeight(.semibold)
                Text(movementText(signal))
                  .foregroundStyle(movementColor(signal))
              }
              .font(.caption)
            }
          }
        }
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func movementText(_ signal: PopularitySignal) -> String {
    if signal.previousRank == nil, signal.rank != nil { return "新进榜" }
    if let delta = signal.rankDelta, delta > 0 { return "↑\(delta)" }
    if let delta = signal.rankDelta, delta < 0 { return "↓\(abs(delta))" }
    return "稳定"
  }

  private func movementColor(_ signal: PopularitySignal) -> Color {
    if signal.previousRank == nil, signal.rank != nil { return DesignSystem.reelBlue }
    if (signal.rankDelta ?? 0) > 0 { return DesignSystem.archiveOlive }
    if (signal.rankDelta ?? 0) < 0 { return DesignSystem.cueRed }
    return .secondary
  }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
