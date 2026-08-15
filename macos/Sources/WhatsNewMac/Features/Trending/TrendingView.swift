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
  @State private var showsAdvancedFilters = false

  public init(client: APIClient, onSelectMedia: @escaping (String) -> Void = { _ in }) {
    self.client = client
    self.onSelectMedia = onSelectMedia
    _model = State(initialValue: TrendingViewModel(client: client))
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      filterBar
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
    HStack(alignment: .bottom, spacing: 28) {
      VStack(alignment: .leading, spacing: 8) {
        Text("热度雷达")
          .font(DesignSystem.pageTitle)
          .tracking(-0.8)
          .foregroundStyle(DesignSystem.cueRed)
        Text("先看哪些作品正在升温，再展开每个来源的真实名次。")
          .font(.title3)
          .foregroundStyle(.secondary)
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 2) {
        Text(String(groupedItems.count))
          .font(DesignSystem.displayNumber)
          .monospacedDigit()
          .foregroundStyle(DesignSystem.cueRed)
        Text(activeFilterCount == 0 ? "当前作品" : "筛选结果")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 30)
    .padding(.top, 24)
    .padding(.bottom, 18)
  }

  private var filterBar: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        Picker("类型", selection: $model.mediaType) {
          Text("全部").tag("")
          Text("电影").tag("movie")
          Text("剧集").tag("series")
          Text("动画").tag("anime")
          Text("综艺").tag("variety")
          Text("短剧").tag("short_drama")
          Text("纪录片").tag("documentary")
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 460)

        Button {
          withAnimation(.easeOut(duration: 0.2)) {
            showsAdvancedFilters.toggle()
          }
        } label: {
          Label(
            activeFilterCount == 0 ? "更多筛选" : "更多筛选 · \(activeFilterCount)",
            systemImage: showsAdvancedFilters ? "slider.horizontal.3" : "line.3.horizontal.decrease"
          )
        }
        .buttonStyle(.bordered)

        Spacer()

        Button {
          Task { await model.load(refresh: true) }
        } label: {
          Label("刷新", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.borderedProminent)
        .tint(DesignSystem.cueRed)
      }

      if showsAdvancedFilters {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 170), spacing: 12)], alignment: .leading, spacing: 10) {
          sourcePicker
          rankingScopePicker
          platformPicker
          regionPicker
          windowPicker
          movementPicker
        }
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .transition(.move(edge: .top).combined(with: .opacity))
      }
    }
    .padding(.horizontal, 30)
    .padding(.bottom, 18)
    .onChange(of: model.source) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.rankingScope) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.platform) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.region) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.window) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.mediaType) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.movement) { _, _ in Task { await model.load(refresh: true) } }
  }

  private var sourcePicker: some View {
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
  }

  private var rankingScopePicker: some View {
    Picker("榜单范围", selection: $model.rankingScope) {
      Text("全部范围").tag("")
      Text("电影榜").tag("movie")
      Text("剧集榜").tag("series")
      Text("英语电影榜").tag("films_english")
      Text("非英语电影榜").tag("films_non_english")
      Text("英语剧集榜").tag("tv_english")
      Text("非英语剧集榜").tag("tv_non_english")
    }
  }

  private var platformPicker: some View {
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
  }

  private var regionPicker: some View {
    Picker("地区", selection: $model.region) {
      Text("全部地区").tag("")
      Text("全球").tag("GLOBAL")
      Text("中国大陆").tag("CN")
      Text("美国").tag("US")
    }
  }

  private var windowPicker: some View {
    Picker("窗口", selection: $model.window) {
      Text("全部窗口").tag("")
      Text("当前").tag("current")
      Text("本周").tag("week")
      Text("即将上线").tag("upcoming")
      Text("累计").tag("lifetime")
    }
  }

  private var movementPicker: some View {
    Picker("走势", selection: $model.movement) {
      Text("全部走势").tag("")
      Text("新进榜").tag("new")
      Text("上升").tag("rising")
      Text("下降").tag("falling")
      Text("稳定").tag("stable")
    }
  }

  @ViewBuilder
  private var resultBody: some View {
    switch model.state {
    case .idle, .loading:
      FeatureLoadingView(title: "加载热度雷达")
    case let .failed(message):
      FeatureFailureView(message: message) { Task { await model.load() } }
    case .empty:
      FeatureEmptyView(title: "暂无热度信号", message: "当前筛选没有匹配的榜单信号。", systemImage: "chart.line.uptrend.xyaxis")
    case .loaded:
      ScrollView {
        VStack(alignment: .leading, spacing: 30) {
          if !spotlightItems.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
              SectionHeader(
                title: activeFilterCount == 0 ? "正在升温" : "筛选聚光",
                subtitle: "每张卡片保留独立来源、范围与名次"
              )
              ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 16) {
                  ForEach(spotlightItems) { group in
                    TrendingSpotlightCard(client: client, group: group) {
                      onSelectMedia(group.mediaItem.id)
                    }
                  }
                }
                .padding(.vertical, 3)
              }
            }
          }

          if !remainingItems.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
              SectionHeader(title: "全部信号", subtitle: "\(remainingItems.count) 部作品")
              LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 14)], alignment: .leading, spacing: 14) {
                ForEach(remainingItems) { group in
                  TrendingWorkCard(client: client, group: group) {
                    onSelectMedia(group.mediaItem.id)
                  }
                }
              }
            }
          }
        }
        .padding(.horizontal, 30)
        .padding(.vertical, 26)
        .frame(maxWidth: 1_480, alignment: .leading)
        .frame(maxWidth: .infinity)
      }
    }
  }

  private var activeFilterCount: Int {
    [model.source, model.platform, model.region, model.window, model.mediaType, model.rankingScope, model.movement]
      .filter { !$0.isEmpty }
      .count
  }

  private var spotlightItems: [TrendingGroup] {
    Array(groupedItems.prefix(3))
  }

  private var remainingItems: [TrendingGroup] {
    Array(groupedItems.dropFirst(3))
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

private struct TrendingSpotlightCard: View {
  let client: APIClient
  let group: TrendingGroup
  let onSelect: () -> Void
  @State private var isHovering = false

  var body: some View {
    Button(action: onSelect) {
      HStack(alignment: .top, spacing: 16) {
        NASPosterView(
          client: client,
          mediaID: group.mediaItem.id,
          title: group.mediaItem.titleDisplay,
          posterAvailable: group.mediaItem.posterUrl != nil,
          mediaStatus: group.mediaItem.status,
          width: .medium
        )
        .frame(width: 126, height: 189)
        .shadow(color: DesignSystem.cueRed.opacity(0.16), radius: 12, y: 7)

        VStack(alignment: .leading, spacing: 10) {
          Text("Heat")
            .font(.caption.weight(.semibold))
            .foregroundStyle(DesignSystem.cueRed)
          Text(SharedFormatters.numberText(group.mediaItem.heatScore))
            .font(.system(size: 36, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(DesignSystem.cueRed)
          Text(group.mediaItem.titleDisplay)
            .font(.title3.weight(.semibold))
            .lineLimit(2)
            .multilineTextAlignment(.leading)
          SemanticStatusBadge(group.mediaItem.mediaType)
          Spacer(minLength: 0)
          ForEach(group.signals.prefix(3)) { signal in
            TrendSignalLine(signal: signal)
          }
        }
        .frame(width: 190, alignment: .leading)
      }
      .padding(16)
      .frame(width: 370, height: 222, alignment: .leading)
      .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .strokeBorder(DesignSystem.cueRed.opacity(isHovering ? 0.45 : 0.12), lineWidth: 1)
      }
      .scaleEffect(isHovering ? 1.01 : 1)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering in
      withAnimation(.easeOut(duration: 0.18)) {
        isHovering = hovering
      }
    }
  }
}

private struct TrendingWorkCard: View {
  let client: APIClient
  let group: TrendingGroup
  let onSelect: () -> Void
  @State private var isHovering = false

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
        .frame(width: 68, height: 102)

        VStack(alignment: .leading, spacing: 7) {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(group.mediaItem.titleDisplay)
              .font(.headline)
              .lineLimit(1)
            Spacer()
            Text("Heat \(SharedFormatters.numberText(group.mediaItem.heatScore))")
              .font(.caption.monospaced().weight(.semibold))
              .foregroundStyle(DesignSystem.cueRed)
          }
          Text(StatusPresentation.label(group.mediaItem.mediaType))
            .font(.caption)
            .foregroundStyle(.secondary)
          Spacer(minLength: 0)
          ForEach(group.signals.prefix(2)) { signal in
            TrendSignalLine(signal: signal)
          }
        }
      }
      .padding(14)
      .frame(maxWidth: .infinity, minHeight: 130, alignment: .leading)
      .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .strokeBorder(DesignSystem.reelBlue.opacity(isHovering ? 0.35 : 0.08), lineWidth: 1)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering in
      withAnimation(.easeOut(duration: 0.18)) {
        isHovering = hovering
      }
    }
  }
}

private struct TrendSignalLine: View {
  let signal: PopularitySignal

  var body: some View {
    HStack(spacing: 6) {
      Text(signal.source)
        .fontWeight(.medium)
        .lineLimit(1)
      if let scope = signal.rankingEntryLabel ?? (signal.rankingScope == "overall" ? nil : signal.rankingScope) {
        Text(scope)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      Text(signal.rank.map { "#\($0)" } ?? signal.valueLabel ?? "—")
        .fontWeight(.semibold)
      Text(movementText(signal))
        .foregroundStyle(movementColor(signal))
    }
    .font(.caption)
  }
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

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
