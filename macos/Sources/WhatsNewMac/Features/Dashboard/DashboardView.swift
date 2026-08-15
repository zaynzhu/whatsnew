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
      VStack(alignment: .leading, spacing: 34) {
        masthead
        releaseSection(
          title: "今天看什么",
          subtitle: "首发、上架与剧集更新",
          items: model.response?.today ?? [],
          accent: DesignSystem.cueRed
        )
        mediaSection(
          title: "热度正在发生",
          subtitle: "Heat 用于辅助发现，具体名次仍按来源分开",
          items: model.response?.trending ?? [],
          accent: DesignSystem.cueRed
        )
        releaseSection(
          title: "接下来七天",
          subtitle: "按日期展开本周值得留意的排期",
          items: model.response?.week ?? [],
          accent: DesignSystem.reelBlue
        )
        mediaSection(
          title: "编辑精选",
          subtitle: "从近期作品里挑出的重点内容",
          items: model.response?.featured ?? [],
          accent: DesignSystem.cinemaGold
        )
        operationsSection
      }
      .padding(.horizontal, 30)
      .padding(.top, 26)
      .padding(.bottom, 42)
      .frame(maxWidth: 1_480, alignment: .leading)
      .frame(maxWidth: .infinity)
    }
  }

  private var masthead: some View {
    HStack(alignment: .center, spacing: 34) {
      VStack(alignment: .leading, spacing: 16) {
        Text("今日速览")
          .font(.callout.weight(.semibold))
          .foregroundStyle(DesignSystem.cueRed)
        Text("今天，先看\n这几件事")
          .font(.system(size: 44, weight: .bold, design: .serif))
          .tracking(-1.2)
          .lineSpacing(-2)
        Text("把今天上线、近期热度和未来排期放在同一个视野里。")
          .font(.title3)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)

        HStack(spacing: 10) {
          DashboardMetric(value: model.response?.today.count ?? 0, label: "今日上线", tint: DesignSystem.cueRed)
          DashboardMetric(value: model.response?.week.count ?? 0, label: "本周排期", tint: DesignSystem.reelBlue)
          DashboardMetric(value: model.response?.trending.count ?? 0, label: "热度作品", tint: DesignSystem.cinemaGold)
        }

        if let generatedAt = model.response?.sources.first?.startedAt {
          Label("数据更新于 \(SharedFormatters.relativeText(fromISO8601: generatedAt))", systemImage: "clock")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      .frame(maxWidth: 540, alignment: .leading)

      Spacer(minLength: 10)

      HStack(alignment: .bottom, spacing: -24) {
        ForEach(Array(heroItems.enumerated()), id: \.element.id) { index, item in
          Button {
            onSelectMedia(item.id)
          } label: {
            NASPosterView(
              client: client,
              mediaID: item.id,
              title: item.preferredTitle,
              posterAvailable: item.posterUrl != nil,
              mediaStatus: item.status,
              width: .medium
            )
            .frame(width: index == 1 ? 142 : 122, height: index == 1 ? 213 : 183)
            .shadow(color: DesignSystem.reelBlue.opacity(0.2), radius: 18, y: 10)
            .rotationEffect(.degrees(index == 0 ? -5 : index == 2 ? 5 : 0))
            .offset(y: index == 1 ? -10 : 8)
          }
          .buttonStyle(.plain)
          .zIndex(index == 1 ? 2 : 1)
        }
      }
      .frame(minWidth: 360, minHeight: 230)
    }
    .padding(30)
    .background {
      ZStack {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .fill(.regularMaterial)
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .fill(
            LinearGradient(
              colors: [
                DesignSystem.cueRed.opacity(0.13),
                DesignSystem.cinemaGold.opacity(0.07),
                .clear
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          )
      }
    }
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .strokeBorder(.white.opacity(0.16), lineWidth: 1)
    }
  }

  private var heroItems: [MediaItem] {
    let candidates = (model.response?.trending ?? []) + (model.response?.featured ?? [])
    var seen = Set<String>()
    return Array(candidates.filter { seen.insert($0.id).inserted }.prefix(3))
  }

  @ViewBuilder
  private func releaseSection(
    title: String,
    subtitle: String,
    items: [ReleaseRow],
    accent: Color
  ) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      SectionHeader(title: title, subtitle: subtitle)
      if items.isEmpty {
        Text("暂无排期")
          .font(.callout)
          .foregroundStyle(.secondary)
          .padding(.vertical, 18)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(spacing: 14) {
            ForEach(items) { release in
              DashboardReleaseCard(client: client, release: release, accent: accent) {
                onSelectMedia(release.mediaItem.id)
              }
            }
          }
          .padding(.vertical, 3)
        }
      }
    }
  }

  @ViewBuilder
  private func mediaSection(
    title: String,
    subtitle: String,
    items: [MediaItem],
    accent: Color
  ) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      SectionHeader(title: title, subtitle: subtitle)
      if items.isEmpty {
        Text("暂无作品")
          .font(.callout)
          .foregroundStyle(.secondary)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(alignment: .top, spacing: 16) {
            ForEach(items) { item in
              DashboardMediaCard(client: client, item: item, accent: accent) {
                onSelectMedia(item.id)
              }
            }
          }
          .padding(.vertical, 3)
        }
      }
    }
  }

  private var operationsSection: some View {
    HStack(alignment: .top, spacing: 18) {
      DashboardEventPanel(events: Array((model.response?.events ?? []).prefix(7)))
      DashboardSourcePanel(runs: Array((model.response?.sources ?? []).prefix(7)))
    }
  }
}

private struct DashboardMetric: View {
  let value: Int
  let label: String
  let tint: Color

  var body: some View {
    HStack(spacing: 8) {
      Text(String(value))
        .font(.title2.weight(.bold))
        .monospacedDigit()
        .foregroundStyle(tint)
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 9)
    .background(tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

private struct DashboardReleaseCard: View {
  let client: APIClient
  let release: ReleaseRow
  let accent: Color
  let onSelect: () -> Void
  @State private var isHovering = false

  var body: some View {
    Button(action: onSelect) {
      HStack(spacing: 14) {
        NASPosterView(
          client: client,
          mediaID: release.mediaItem.id,
          title: release.mediaItem.preferredTitle,
          posterAvailable: release.mediaItem.posterUrl != nil,
          mediaStatus: release.mediaItem.status,
          width: .medium
        )
        .frame(width: 78, height: 117)

        VStack(alignment: .leading, spacing: 7) {
          Text(release.mediaItem.preferredTitle)
            .font(.headline)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
          if let secondaryTitle = release.mediaItem.secondaryTitle {
            Text(secondaryTitle)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          Text(release.platform == "Unspecified" ? "平台待确认" : release.platform)
            .font(.callout)
            .foregroundStyle(.secondary)
            .lineLimit(1)
          Spacer(minLength: 0)
          HStack(spacing: 7) {
            SemanticStatusBadge(release.releaseStatus)
            if let episode = release.episodeNumber {
              Text("E\(episode)")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
            }
          }
          Text(release.releaseDate ?? "日期待定")
            .font(.caption.monospaced())
            .foregroundStyle(accent)
        }
        .padding(.vertical, 4)
      }
      .padding(12)
      .frame(width: 282, height: 142, alignment: .leading)
      .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .strokeBorder(accent.opacity(isHovering ? 0.5 : 0.12), lineWidth: 1)
      }
      .contentShape(Rectangle())
      .scaleEffect(isHovering ? 1.012 : 1)
    }
    .buttonStyle(.plain)
    .onHover { hovering in
      withAnimation(.easeOut(duration: 0.18)) {
        isHovering = hovering
      }
    }
  }
}

private struct DashboardMediaCard: View {
  let client: APIClient
  let item: MediaItem
  let accent: Color
  let onSelect: () -> Void
  @State private var isHovering = false

  var body: some View {
    Button(action: onSelect) {
      VStack(alignment: .leading, spacing: 9) {
        ZStack(alignment: .bottomTrailing) {
          NASPosterView(
            client: client,
            mediaID: item.id,
            title: item.preferredTitle,
            posterAvailable: item.posterUrl != nil,
            mediaStatus: item.status,
            width: .medium
          )
          .frame(width: 144, height: 216)

          Text("Heat \(SharedFormatters.numberText(item.heatScore))")
            .font(.caption.monospaced().weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(accent.opacity(0.9), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .padding(8)
        }
        .shadow(color: accent.opacity(isHovering ? 0.24 : 0.12), radius: isHovering ? 16 : 8, y: 8)

        Text(item.preferredTitle)
          .font(.callout.weight(.semibold))
          .lineLimit(2)
          .frame(width: 144, alignment: .leading)
        if let secondaryTitle = item.secondaryTitle {
          Text(secondaryTitle)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .frame(width: 144, alignment: .leading)
        }
        Text(StatusPresentation.label(item.mediaType))
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .frame(width: 144, alignment: .leading)
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

private struct DashboardEventPanel: View {
  let events: [ChangeEvent]

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      SectionHeader(title: "最近事件", subtitle: "服务端变更记录")
      if events.isEmpty {
        Text("暂无最近事件")
          .font(.callout)
          .foregroundStyle(.secondary)
      } else {
        ForEach(events) { event in
          HStack(alignment: .top, spacing: 10) {
            Circle()
              .fill(DesignSystem.cinemaGold)
              .frame(width: 8, height: 8)
              .padding(.top, 5)
            VStack(alignment: .leading, spacing: 3) {
              Text(event.title)
                .font(.callout.weight(.medium))
                .lineLimit(1)
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
    .padding(20)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

private struct DashboardSourcePanel: View {
  let runs: [SourceSyncRun]

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      SectionHeader(title: "来源脉搏", subtitle: "最近同步状态")
      if runs.isEmpty {
        Text("暂无来源运行记录")
          .font(.callout)
          .foregroundStyle(.secondary)
      } else {
        ForEach(runs) { run in
          HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
              Text(run.source)
                .font(.callout.weight(.medium))
                .lineLimit(1)
              Text(run.scope)
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
            Spacer()
            SemanticStatusBadge(run.status)
            Text(SharedFormatters.relativeText(fromISO8601: run.startedAt))
              .font(.caption2)
              .foregroundStyle(.secondary)
              .frame(width: 58, alignment: .trailing)
          }
        }
      }
    }
    .padding(20)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}
