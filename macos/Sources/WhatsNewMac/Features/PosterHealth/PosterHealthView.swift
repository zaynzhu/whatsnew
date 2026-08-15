import Observation
import SwiftUI
import WhatsNewCore

@MainActor
@Observable
final class PosterHealthViewModel {
  private let client: APIClient
  private(set) var response: PosterHealthResponse?
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
      let result = try await client.posterHealth()
      response = result
      state = result.total == 0 ? .empty : .loaded
    } catch {
      if response == nil {
        state = .failed((error as? LocalizedError)?.errorDescription ?? "图片健康暂时无法加载")
      }
    }
  }
}

public struct PosterHealthView: View {
  private let client: APIClient
  @State private var model: PosterHealthViewModel

  public init(client: APIClient) {
    self.client = client
    _model = State(initialValue: PosterHealthViewModel(client: client))
  }

  public var body: some View {
    Group {
      switch model.state {
      case .idle, .loading:
        FeatureLoadingView(title: "加载图片健康")
      case let .failed(message):
        FeatureFailureView(title: "图片健康加载失败", message: message) { Task { await model.load() } }
      case .empty:
        FeatureEmptyView(title: "暂无图片统计", message: "NAS 还没有返回当前作品的图片健康数据。", systemImage: "photo")
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
        if let response = model.response {
          overview(response)
          queueStats(response)
          cacheStats(response)
          sampleSection(title: "损坏海报", samples: response.samples.broken, accent: DesignSystem.cueRed)
          sampleSection(title: "降级海报", samples: response.samples.degraded, accent: DesignSystem.reelBlue)
          sampleSection(title: "缺失海报", samples: response.samples.missing, accent: DesignSystem.archiveOlive)
          sampleSection(title: "低清海报", samples: response.samples.undersized, accent: DesignSystem.cueRed)
        }
      }
      .padding(28)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("图片健康")
        .font(.system(size: 32, weight: .semibold, design: .serif))
        .foregroundStyle(DesignSystem.cueRed)
      Text("覆盖率、可用状态和清晰度分别统计；补图与低清替换队列保持独立。")
        .foregroundStyle(.secondary)
    }
  }

  private func overview(_ response: PosterHealthResponse) -> some View {
    HStack(spacing: 12) {
      PosterHealthMetric(label: "总作品", value: response.total, color: DesignSystem.reelBlue)
      PosterHealthMetric(label: "有海报", value: response.withPoster, color: DesignSystem.archiveOlive)
      PosterHealthMetric(label: "缺失", value: response.missing, color: DesignSystem.cueRed)
      VStack(alignment: .leading, spacing: 4) {
        Text("覆盖率").font(.caption).foregroundStyle(.secondary)
        Text("\(SharedFormatters.numberText(response.coveragePercent))%")
          .font(.title2.weight(.semibold))
          .foregroundStyle(response.coveragePercent >= 90 ? DesignSystem.archiveOlive : DesignSystem.cueRed)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(12)
      .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
  }

  private func queueStats(_ response: PosterHealthResponse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "维护队列", subtitle: "健康统计与设置页使用同一队列语义")
      HStack(spacing: 12) {
        QueueCard(title: "缺图补全", stats: response.lookup, accent: DesignSystem.archiveOlive)
        QueueCard(title: "低清替换", stats: response.replacement, accent: DesignSystem.reelBlue)
      }
      HStack(spacing: 12) {
        StatPill(label: "未验证", value: response.statuses.unverified, color: .secondary)
        StatPill(label: "健康", value: response.statuses.healthy, color: DesignSystem.archiveOlive)
        StatPill(label: "降级", value: response.statuses.degraded, color: DesignSystem.reelBlue)
        StatPill(label: "损坏", value: response.statuses.broken, color: DesignSystem.cueRed)
        StatPill(label: "质量未知", value: response.quality.unknown, color: .secondary)
        StatPill(label: "尺寸合格", value: response.quality.adequate, color: DesignSystem.archiveOlive)
        StatPill(label: "低清", value: response.quality.undersized, color: DesignSystem.cueRed)
      }
    }
  }

  private func cacheStats(_ response: PosterHealthResponse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "缓存", subtitle: "原图与响应式变体分开统计")
      HStack(spacing: 12) {
        CacheCard(title: "原图缓存", stats: response.cache)
        CacheVariantCard(title: "响应式变体", stats: response.cache.variants)
      }
    }
  }

  @ViewBuilder
  private func sampleSection(title: String, samples: [PosterHealthSample], accent: Color) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: title, subtitle: "高优先级样本")
      if samples.isEmpty {
        Text("暂无样本").font(.callout).foregroundStyle(.secondary)
      } else {
        LazyVStack(spacing: 0) {
          ForEach(samples) { sample in
            HStack(spacing: 10) {
              Circle().fill(accent).frame(width: 7, height: 7)
              VStack(alignment: .leading, spacing: 3) {
                Text(sample.title).font(.callout.weight(.medium))
                HStack(spacing: 8) {
                  Text(StatusPresentation.label(sample.attentionCategory))
                  Text("Heat \(SharedFormatters.numberText(sample.heatScore))")
                  Text("优先级 \(SharedFormatters.numberText(sample.priorityScore))")
                  Text(sample.sources.joined(separator: "、"))
                }
                .font(.caption)
                .foregroundStyle(.secondary)
              }
              Spacer()
              if let width = sample.width, let height = sample.height {
                Text("\(width)×\(height)").font(.caption.monospaced()).foregroundStyle(.secondary)
              }
              SemanticStatusBadge(sample.lookupState)
              if let last = sample.lastLookupAt {
                Text(SharedFormatters.relativeText(fromISO8601: last))
                  .font(.caption2)
                  .foregroundStyle(.secondary)
              }
            }
            .padding(.vertical, 9)
            Divider()
          }
        }
      }
    }
  }
}

private struct PosterHealthMetric: View {
  let label: String
  let value: Int
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label).font(.caption).foregroundStyle(.secondary)
      Text(String(value)).font(.title2.weight(.semibold)).foregroundStyle(color)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
  }
}

private struct QueueCard: View {
  let title: String
  let stats: PosterHealthLookupStats
  let accent: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(.callout.weight(.medium))
      HStack(spacing: 16) {
        QueueMetric(label: "未尝试", value: stats.notAttempted)
        QueueMetric(label: "冷却中", value: stats.cooldown)
        QueueMetric(label: "可重试", value: stats.retryEligible)
      }
      Text("冷却窗口：\(stats.retryAfterDays) 天")
        .font(.caption)
        .foregroundStyle(.secondary)
      if let expiry = stats.nextCooldownExpiryAt {
        Text("下次到期：\(SharedFormatters.dateTimeText(fromISO8601: expiry))")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(13)
    .background(accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
  }
}

private struct QueueMetric: View {
  let label: String
  let value: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(label).font(.caption).foregroundStyle(.secondary)
      Text(String(value)).font(.headline)
    }
  }
}

private struct StatPill: View {
  let label: String
  let value: Int
  let color: Color

  var body: some View {
    HStack(spacing: 5) {
      Text(label).font(.caption).foregroundStyle(.secondary)
      Text(String(value)).font(.caption.weight(.semibold)).foregroundStyle(color)
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
    .background(color.opacity(0.08), in: Capsule())
  }
}

private struct CacheCard: View {
  let title: String
  let stats: PosterHealthCacheStats

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title).font(.callout.weight(.medium))
      Text("\(stats.entries) 项 · \(formatBytes(stats.bytes)) / \(formatBytes(stats.maxBytes))")
        .font(.caption.monospaced())
      Text("孤立文件 \(stats.orphanedFiles) · 损坏条目 \(stats.corruptEntries)")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(13)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
  }
}

private struct CacheVariantCard: View {
  let title: String
  let stats: PosterHealthVariantStats

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title).font(.callout.weight(.medium))
      Text("\(stats.entries) 项 · \(formatBytes(stats.bytes)) / \(formatBytes(stats.maxBytes))")
        .font(.caption.monospaced())
      Text("孤立文件 \(stats.orphanedFiles) · 损坏条目 \(stats.corruptEntries)")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(13)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
  }
}

private func formatBytes(_ bytes: Int64) -> String {
  ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
}
