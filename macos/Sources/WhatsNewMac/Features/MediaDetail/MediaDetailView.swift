import Charts
import Observation
import SwiftUI
import WhatsNewCore

@MainActor
@Observable
final class MediaDetailViewModel {
  private let client: APIClient
  let mediaID: String
  private(set) var detail: MediaDetailResponse?
  private(set) var history: [PopularitySignal] = []
  private(set) var state: FeatureLoadState = .idle
  private(set) var historyState: FeatureLoadState = .idle
  private(set) var isRefreshing = false

  init(client: APIClient, mediaID: String) {
    self.client = client
    self.mediaID = mediaID
  }

  func load(refresh: Bool = false) async {
    if refresh || detail != nil {
      isRefreshing = true
    } else {
      state = .loading
      historyState = .loading
    }
    defer { isRefreshing = false }
    do {
      detail = try await client.mediaDetail(mediaID: mediaID)
      state = .loaded
    } catch {
      if detail == nil {
        state = .failed((error as? LocalizedError)?.errorDescription ?? "作品详情暂时无法加载")
      }
      return
    }

    do {
      let loadedHistory = try await client.popularityHistory(mediaID: mediaID, days: 30)
      history = loadedHistory.items
      historyState = history.isEmpty ? .empty : .loaded
    } catch {
      if history.isEmpty {
        historyState = .failed((error as? LocalizedError)?.errorDescription ?? "热度历史暂时无法加载")
      }
    }
  }
}

public struct MediaDetailView: View {
  private let client: APIClient
  private let mediaID: String
  private let onBack: () -> Void
  @State private var model: MediaDetailViewModel

  public init(client: APIClient, mediaID: String, onBack: @escaping () -> Void = {}) {
    self.client = client
    self.mediaID = mediaID
    self.onBack = onBack
    _model = State(initialValue: MediaDetailViewModel(client: client, mediaID: mediaID))
  }

  public var body: some View {
    Group {
      switch model.state {
      case .idle, .loading:
        FeatureLoadingView(title: "加载作品详情")
      case let .failed(message):
        FeatureFailureView(title: "作品详情加载失败", message: message) { Task { await model.load() } }
      case .loaded, .empty:
        if let detail = model.detail {
          content(detail)
        } else {
          FeatureEmptyView(title: "作品不存在", message: "服务端没有返回这部作品。", systemImage: "film")
        }
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

  private func content(_ detail: MediaDetailResponse) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 26) {
        HStack {
          Button { onBack() } label: {
            Label("返回", systemImage: "chevron.left")
          }
          .buttonStyle(.bordered)
          Spacer()
        }
        hero(detail)
        ratings(detail)
        releases(detail)
        signals(detail)
        references(detail)
        events(detail)
        historyChart
      }
      .padding(28)
    }
  }

  private func hero(_ detail: MediaDetailResponse) -> some View {
    HStack(alignment: .top, spacing: 22) {
      NASPosterView(
        client: client,
        mediaID: detail.id,
        title: detail.preferredTitle,
        posterAvailable: detail.posterUrl != nil,
        mediaStatus: detail.status,
        width: .medium
      )
      .frame(width: 170, height: 255)
      VStack(alignment: .leading, spacing: 10) {
        Text(detail.preferredTitle)
          .font(.system(size: 30, weight: .semibold, design: .serif))
        if let secondaryTitle = detail.secondaryTitle {
          Text(secondaryTitle)
            .font(.title3)
            .foregroundStyle(.secondary)
        }
        HStack(spacing: 8) {
          SemanticStatusBadge(detail.mediaType)
          SemanticStatusBadge(detail.releaseForm)
          ContentStatusBadge(detail.status)
          Text("Heat \(SharedFormatters.numberText(detail.heatScore))")
            .font(.caption.monospaced())
            .foregroundStyle(DesignSystem.cueRed)
        }
        Text(detail.overview ?? "暂无简介")
          .font(.body)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
        Divider()
        metadata(detail)
      }
    }
  }

  private func metadata(_ detail: MediaDetailResponse) -> some View {
    Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 7) {
      if let date = detail.firstReleaseDate {
        GridRow { Text("首发日期").foregroundStyle(.secondary); Text(date) }
      }
      if let countries = detail.productionCountries, !countries.isEmpty {
        GridRow { Text("制片国家").foregroundStyle(.secondary); Text(SharedFormatters.listText(countries)) }
      }
      if let language = detail.originalLanguage, !language.isEmpty {
        GridRow { Text("原始语言").foregroundStyle(.secondary); Text(language) }
      }
      if let genres = detail.genres, !genres.isEmpty {
        GridRow { Text("类型标签").foregroundStyle(.secondary); Text(SharedFormatters.listText(genres)) }
      }
    }
    .font(.callout)
  }

  @ViewBuilder
  private func ratings(_ detail: MediaDetailResponse) -> some View {
    let values = detail.ratings ?? []
    if ["released", "ongoing", "returning", "ended"].contains(detail.status), !values.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeader(title: "口碑评分", subtitle: "各来源保留原始量表")
        LazyVGrid(
          columns: [GridItem(.adaptive(minimum: 180), alignment: .leading)],
          alignment: .leading,
          spacing: 9
        ) {
          ForEach(values) { rating in
            ratingCard(rating)
          }
        }
      }
    }
  }

  @ViewBuilder
  private func ratingCard(_ rating: MediaRating) -> some View {
    let card = VStack(alignment: .leading, spacing: 7) {
      HStack(alignment: .firstTextBaseline) {
        Text(ratingSourceName(rating.source))
          .font(.callout.weight(.medium))
        Spacer()
        Text(ratingAudienceName(rating.audience))
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Text(rating.scale == 100
        ? "\(SharedFormatters.numberText(rating.value))%"
        : "\(SharedFormatters.numberText(rating.value))/\(rating.scale)")
        .font(.title2.weight(.semibold).monospacedDigit())
        .foregroundStyle(DesignSystem.reelBlue)
      if let voteCount = rating.voteCount {
        Text("\(SharedFormatters.numberText(Double(voteCount)))人评价")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))

    if let url = safeExternalURL(rating.sourceUrl) {
      Link(destination: url) {
        card
      }
      .buttonStyle(.plain)
      .help("在默认浏览器打开评分来源")
    } else {
      card
    }
  }

  private func ratingSourceName(_ source: String) -> String {
    switch source {
    case "douban": return "豆瓣"
    case "imdb": return "IMDb"
    case "tmdb": return "TMDb"
    case "rotten_tomatoes": return "烂番茄"
    default: return source
    }
  }

  private func ratingAudienceName(_ audience: String) -> String {
    switch audience {
    case "users": return "用户评分"
    case "critics": return "影评人"
    case "audience": return "观众"
    default: return audience
    }
  }

  private func releases(_ detail: MediaDetailResponse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "发行记录", subtitle: "多平台和多集排期完整保留")
      if detail.releases.isEmpty {
        Text("暂无发行记录").foregroundStyle(.secondary)
      } else {
        LazyVStack(spacing: 0) {
          ForEach(detail.releases) { release in
            HStack(spacing: 10) {
              VStack(alignment: .leading, spacing: 4) {
                Text(release.platform == "Unspecified" ? "平台待确认" : release.platform)
                  .font(.callout.weight(.medium))
                if let season = release.seasonNumber, let episode = release.episodeNumber {
                  Text("S\(season) E\(episode)\(release.episodeTitle.map { " · \($0)" } ?? "")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
              }
              Spacer()
              Text(release.releaseDate ?? "日期待定")
                .font(.caption)
              ContentStatusBadge(release.releaseStatus)
              Text(release.source)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
              if let url = safeExternalURL(release.sourceUrl) {
                Link(destination: url) {
                  Image(systemName: "arrow.up.right.square")
                }
                .help("在默认浏览器打开来源")
              }
            }
            .padding(.vertical, 9)
            Divider()
          }
        }
      }
    }
  }

  private func signals(_ detail: MediaDetailResponse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "当前热度信号", subtitle: "按来源保留榜单范围")
      if detail.popularitySignals.isEmpty {
        Text("暂无当前热度信号").foregroundStyle(.secondary)
      } else {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 250), alignment: .leading)], alignment: .leading, spacing: 9) {
          ForEach(detail.popularitySignals) { signal in
            VStack(alignment: .leading, spacing: 5) {
              HStack {
                Text(signal.source).font(.callout.weight(.medium))
                Spacer()
                Text(signal.rank.map { "#\($0)" } ?? "—")
                  .font(.headline.monospaced())
              }
              Text([signal.rankingEntryLabel, signal.rankingScope, signal.window].compactMap { $0 }.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(.secondary)
              if let valueLabel = signal.valueLabel {
                Text(valueLabel).font(.caption)
              }
              HStack {
                Text(signal.platform ?? "平台未知")
                Text(signal.region ?? "地区未知")
                Text(SharedFormatters.relativeText(fromISO8601: signal.capturedAt))
              }
              .font(.caption2)
              .foregroundStyle(.secondary)
            }
            .padding(11)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
          }
        }
      }
    }
  }

  private func references(_ detail: MediaDetailResponse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "来源引用", subtitle: "当前与历史身份都保留")
      if detail.sourceRefs.isEmpty {
        Text("暂无来源引用").foregroundStyle(.secondary)
      } else {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), alignment: .leading)], alignment: .leading, spacing: 7) {
          ForEach(detail.sourceRefs) { ref in
            HStack {
              Text(ref.source).font(.callout.weight(.medium))
              Text(ref.sourceId).font(.caption.monospaced()).foregroundStyle(.secondary)
              Spacer()
              SemanticStatusBadge(ref.isActive ? "success" : "ended")
            }
            .padding(9)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
          }
        }
      }
    }
  }

  private func events(_ detail: MediaDetailResponse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "变更事件", subtitle: "服务端原始事件历史")
      if detail.changeEvents.isEmpty {
        Text("暂无变更事件").foregroundStyle(.secondary)
      } else {
        LazyVStack(alignment: .leading, spacing: 10) {
          ForEach(detail.changeEvents) { event in
            HStack(alignment: .top, spacing: 10) {
              Circle().fill(StatusPresentation.color(event.eventType)).frame(width: 7, height: 7).padding(.top, 6)
              VStack(alignment: .leading, spacing: 4) {
                HStack {
                  Text(event.title).font(.callout.weight(.medium))
                  Spacer()
                  Text(SharedFormatters.dateTimeText(fromISO8601: event.eventAt)).font(.caption).foregroundStyle(.secondary)
                }
                Text(event.description).font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                  Text(event.source).font(.caption2.monospaced()).foregroundStyle(.tertiary)
                  if let url = safeExternalURL(event.sourceUrl) {
                    Link("打开来源", destination: url)
                      .font(.caption2)
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  @ViewBuilder
  private var historyChart: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "热度历史", subtitle: "最近 30 天")
      switch model.historyState {
      case .idle, .loading:
        ProgressView("加载热度历史…")
      case let .failed(message):
        Text(message).foregroundStyle(DesignSystem.cueRed)
      case .empty:
        FeatureEmptyView(title: "暂无热度历史", message: "后端还没有记录这部作品的历史信号。", systemImage: "chart.line.uptrend.xyaxis")
          .frame(minHeight: 180)
      case .loaded:
        Chart(model.history.filter { $0.rank != nil }) { signal in
          if let rank = signal.rank, let date = SharedFormatters.date(fromISO8601: signal.capturedAt) {
            LineMark(
              x: .value("时间", date),
              y: .value("名次", rank)
            )
            .foregroundStyle(by: .value("来源", signal.source))
            PointMark(
              x: .value("时间", date),
              y: .value("名次", rank)
            )
            .foregroundStyle(by: .value("来源", signal.source))
          }
        }
        .chartYScale(domain: .automatic(includesZero: false, reversed: true))
        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 6)) }
        .frame(minHeight: 260)
      }
    }
  }

  private func safeExternalURL(_ value: String?) -> URL? {
    guard let value, let url = URL(string: value), let scheme = url.scheme?.lowercased(),
          (scheme == "http" || scheme == "https"), url.host != nil else {
      return nil
    }
    return url
  }
}
