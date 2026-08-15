import Observation
import SwiftUI
import WhatsNewCore

@MainActor
@Observable
final class DashboardViewModel {
  private let client: APIClient
  private(set) var response: DashboardResponse?
  private(set) var state: FeatureLoadState = .idle
  private(set) var isRefreshing = false

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
      let result = try await client.dashboard()
      response = result
      state = result.today.isEmpty && result.week.isEmpty && result.featured.isEmpty && result.trending.isEmpty
        ? .empty
        : .loaded
    } catch {
      if response == nil {
        state = .failed(Self.message(for: error))
      }
    }
  }

  private static func message(for error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? "情报台暂时无法加载"
  }
}

public struct DashboardView: View {
  private let client: APIClient
  private let onSelectMedia: (String) -> Void
  @State private var model: DashboardViewModel

  public init(client: APIClient, onSelectMedia: @escaping (String) -> Void = { _ in }) {
    self.client = client
    self.onSelectMedia = onSelectMedia
    _model = State(initialValue: DashboardViewModel(client: client))
  }

  public var body: some View {
    Group {
      switch model.state {
      case .idle, .loading:
        FeatureLoadingView(title: "加载情报台")
      case let .failed(message):
        FeatureFailureView(message: message) {
          Task { await model.load() }
        }
      case .empty:
        FeatureEmptyView(title: "暂无情报", message: "NAS 还没有可展示的排期或热度数据。")
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
      VStack(alignment: .leading, spacing: 28) {
        masthead
        releaseSection(title: "今日上线", subtitle: "今天值得留意的首发与更新", items: model.response?.today ?? [])
        releaseSection(title: "本周片单", subtitle: "未来七天的完整排期", items: model.response?.week ?? [])
        mediaSection(title: "精选作品", items: model.response?.featured ?? [])
        mediaSection(title: "当前热度", items: model.response?.trending ?? [])
        eventSection
        sourceSection
      }
      .padding(28)
    }
  }

  private var masthead: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("情报台")
        .font(.system(size: 34, weight: .semibold, design: .serif))
        .foregroundStyle(DesignSystem.reelBlue)
      Text("今日上线、本周片单与跨来源热度都在这里。")
        .font(.title3)
        .foregroundStyle(.secondary)
      if let generatedAt = model.response?.sources.first?.startedAt {
        Text("最近来源运行：\(SharedFormatters.relativeText(fromISO8601: generatedAt))")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
  }

  @ViewBuilder
  private func releaseSection(title: String, subtitle: String, items: [ReleaseRow]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: title, subtitle: subtitle)
      if items.isEmpty {
        Text("暂无排期")
          .font(.callout)
          .foregroundStyle(.secondary)
          .padding(.vertical, 12)
      } else {
        LazyVStack(spacing: 0) {
          ForEach(items) { release in
            Button {
              onSelectMedia(release.mediaItem.id)
            } label: {
              ReleaseListRow(client: client, release: release)
            }
            .buttonStyle(.plain)
            Divider()
          }
        }
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      }
    }
  }

  @ViewBuilder
  private func mediaSection(title: String, items: [MediaItem]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: title, subtitle: "按 Heat 排序")
      if items.isEmpty {
        Text("暂无作品")
          .font(.callout)
          .foregroundStyle(.secondary)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(alignment: .top, spacing: 14) {
            ForEach(items) { item in
              Button { onSelectMedia(item.id) } label: {
                MediaSummaryCard(client: client, item: item)
              }
              .buttonStyle(.plain)
            }
          }
          .padding(.vertical, 2)
        }
      }
    }
  }

  private var eventSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "最近事件", subtitle: "服务端变更记录")
      let events = model.response?.events ?? []
      if events.isEmpty {
        Text("暂无最近事件")
          .font(.callout)
          .foregroundStyle(.secondary)
      } else {
        LazyVStack(alignment: .leading, spacing: 10) {
          ForEach(events.prefix(8)) { event in
            HStack(alignment: .top, spacing: 10) {
              Circle()
                .fill(DesignSystem.archiveOlive)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
              VStack(alignment: .leading, spacing: 3) {
                Text(event.title)
                  .font(.callout.weight(.medium))
                Text(event.description)
                  .font(.caption)
                  .foregroundStyle(.secondary)
                  .lineLimit(2)
                Text(SharedFormatters.relativeText(fromISO8601: event.eventAt))
                  .font(.caption2)
                  .foregroundStyle(.tertiary)
              }
            }
          }
        }
      }
    }
  }

  private var sourceSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "最近来源运行", subtitle: "仅显示最新记录")
      let runs = model.response?.sources ?? []
      if runs.isEmpty {
        Text("暂无来源运行记录")
          .font(.callout)
          .foregroundStyle(.secondary)
      } else {
        LazyVStack(spacing: 0) {
          ForEach(runs.prefix(8)) { run in
            HStack(spacing: 12) {
              Text(run.source)
                .font(.callout.weight(.medium))
                .frame(width: 150, alignment: .leading)
              Text(run.scope)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
              SemanticStatusBadge(run.status)
              Spacer()
              Text(SharedFormatters.relativeText(fromISO8601: run.startedAt))
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding(.vertical, 8)
            Divider()
          }
        }
      }
    }
  }
}

private struct ReleaseListRow: View {
  let client: APIClient
  let release: ReleaseRow

  var body: some View {
    HStack(spacing: 12) {
      NASPosterView(
        client: client,
        mediaID: release.mediaItem.id,
        title: release.mediaItem.titleDisplay,
        posterAvailable: release.mediaItem.posterUrl != nil,
        mediaStatus: release.mediaItem.status,
        width: .small
      )
      .frame(width: 38, height: 56)
      VStack(alignment: .leading, spacing: 4) {
        Text(release.mediaItem.titleDisplay)
          .font(.callout.weight(.medium))
          .lineLimit(1)
        HStack(spacing: 8) {
          Text(release.platform == "Unspecified" ? "平台待确认" : release.platform)
          if let episode = release.episodeNumber {
            Text("E\(episode)")
          }
          Text(release.releasePattern.replacingOccurrences(of: "_", with: " "))
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 3) {
        Text(release.releaseDate ?? "日期待定")
          .font(.caption)
        SemanticStatusBadge(release.releaseStatus)
      }
    }
    .padding(.vertical, 9)
    .padding(.horizontal, 12)
    .contentShape(Rectangle())
  }
}

private struct MediaSummaryCard: View {
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
      .frame(width: 112, height: 168)
      Text(item.titleDisplay)
        .font(.callout.weight(.medium))
        .lineLimit(2)
        .frame(width: 112, alignment: .leading)
      HStack(spacing: 5) {
        Text("Heat")
        Text(SharedFormatters.numberText(item.heatScore))
          .fontWeight(.semibold)
      }
      .font(.caption)
      .foregroundStyle(DesignSystem.cueRed)
    }
    .frame(width: 112, alignment: .leading)
  }
}
