import Observation
import SwiftUI
import WhatsNewCore

@MainActor
@Observable
final class DiscoverViewModel {
  private let client: APIClient
  private(set) var response: MediaListResponse?
  private(set) var state: FeatureLoadState = .idle
  private(set) var isRefreshing = false
  var query = ""
  var mediaType = ""
  var releaseForm = ""
  var status = ""
  var sort = "heat"

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
      let result = try await client.mediaList(
        query: query.nilIfEmpty,
        mediaType: mediaType.nilIfEmpty,
        releaseForm: releaseForm.nilIfEmpty,
        status: status.nilIfEmpty,
        sort: sort
      )
      response = result
      state = result.items.isEmpty ? .empty : .loaded
    } catch {
      if response == nil {
        state = .failed((error as? LocalizedError)?.errorDescription ?? "发现列表暂时无法加载")
      }
    }
  }
}

public struct DiscoverView: View {
  private let client: APIClient
  private let onSelectMedia: (String) -> Void
  @Binding private var searchText: String
  @State private var model: DiscoverViewModel

  public init(
    client: APIClient,
    searchText: Binding<String> = .constant(""),
    onSelectMedia: @escaping (String) -> Void = { _ in }
  ) {
    self.client = client
    self._searchText = searchText
    self.onSelectMedia = onSelectMedia
    _model = State(initialValue: DiscoverViewModel(client: client))
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      controls
      Divider()
      resultBody
    }
    .task {
      model.query = searchText
      await model.load()
    }
    .onChange(of: searchText) { _, value in
      guard value != model.query else { return }
      model.query = value
      Task { await model.load(refresh: true) }
    }
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
      Text("发现")
        .font(.system(size: 32, weight: .semibold, design: .serif))
        .foregroundStyle(DesignSystem.reelBlue)
      Text(model.query.isEmpty ? "按 Heat、首发日期或更新时间找到值得继续追踪的作品。" : "搜索标题、别名、来源和平台：\(model.query)")
        .foregroundStyle(.secondary)
    }
    .padding(28)
  }

  private var controls: some View {
    HStack(spacing: 10) {
      TextField("标题、来源或平台", text: $searchText)
        .textFieldStyle(.roundedBorder)
        .frame(maxWidth: 260)
      Picker("作品类型", selection: $model.mediaType) {
        Text("全部类型").tag("")
        Text("电影").tag("movie")
        Text("剧集").tag("series")
        Text("动画").tag("anime")
        Text("综艺").tag("variety")
        Text("短剧").tag("short_drama")
        Text("纪录片").tag("documentary")
      }
      .frame(width: 130)
      Picker("发行形态", selection: $model.releaseForm) {
        Text("全部形态").tag("")
        Text("院线电影").tag("theatrical_movie")
        Text("流媒体电影").tag("streaming_movie")
        Text("动画电影").tag("animated_film")
        Text("电视剧").tag("tv_series")
        Text("网络剧").tag("web_series")
        Text("动画剧集").tag("animated_series")
        Text("番剧季度").tag("anime_season")
        Text("综艺季度").tag("variety_season")
        Text("微短剧").tag("micro_drama")
        Text("纪录电影").tag("documentary_film")
        Text("纪录剧集").tag("documentary_series")
      }
      .frame(width: 150)
      Picker("状态", selection: $model.status) {
        Text("全部状态").tag("")
        Text("待播").tag("upcoming")
        Text("已发行").tag("released")
        Text("连载中").tag("ongoing")
        Text("已完结").tag("ended")
        Text("待回归").tag("returning")
        Text("未知").tag("unknown")
      }
      .frame(width: 120)
      Picker("排序", selection: $model.sort) {
        Text("Heat").tag("heat")
        Text("首发日期").tag("firstReleaseDate")
        Text("更新时间").tag("updatedAt")
      }
      .frame(width: 130)
      Button("应用") {
        Task { await model.load(refresh: true) }
      }
      .buttonStyle(.borderedProminent)
      .tint(DesignSystem.reelBlue)
      Spacer()
    }
    .padding(.horizontal, 28)
    .padding(.bottom, 16)
    .onChange(of: model.mediaType) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.releaseForm) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.status) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.sort) { _, _ in Task { await model.load(refresh: true) } }
  }

  @ViewBuilder
  private var resultBody: some View {
    switch model.state {
    case .idle, .loading:
      FeatureLoadingView(title: "加载发现列表")
    case let .failed(message):
      FeatureFailureView(message: message) {
        Task { await model.load() }
      }
    case .empty:
      FeatureEmptyView(
        title: "没有匹配作品",
        message: model.query.isEmpty ? "当前没有可展示的作品。" : "尝试更换搜索词或清除筛选。",
        systemImage: "magnifyingglass"
      )
    case .loaded:
      ScrollView {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 18)], spacing: 22) {
          ForEach(model.response?.items ?? []) { item in
            Button { onSelectMedia(item.id) } label: {
              DiscoverCard(client: client, item: item)
            }
            .buttonStyle(.plain)
          }
        }
        .padding(28)
      }
    }
  }
}

private struct DiscoverCard: View {
  let client: APIClient
  let item: MediaItem

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      NASPosterView(
        client: client,
        mediaID: item.id,
        title: item.titleDisplay,
        posterAvailable: item.posterUrl != nil,
        mediaStatus: item.status,
        width: .medium
      )
      .frame(maxWidth: .infinity)
      Text(item.titleDisplay)
        .font(.callout.weight(.medium))
        .lineLimit(2)
      HStack {
        SemanticStatusBadge(item.status)
        Spacer()
        Text("Heat \(SharedFormatters.numberText(item.heatScore))")
          .font(.caption.monospaced())
          .foregroundStyle(DesignSystem.cueRed)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(10)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

private extension String {
  var nilIfEmpty: String? {
    isEmpty ? nil : self
  }
}
