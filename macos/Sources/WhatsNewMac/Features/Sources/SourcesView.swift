import Observation
import SwiftUI
import WhatsNewCore

@MainActor
@Observable
final class SourcesViewModel {
  private let client: APIClient
  private(set) var catalog: [SourceCatalogItem] = []
  private(set) var health: SourceHealthResponse?
  private(set) var state: FeatureLoadState = .idle
  private(set) var isRefreshing = false
  private(set) var busyOperations: Set<String> = []
  private(set) var operationErrors: [String: String] = [:]
  private(set) var testResults: [String: SourceTestResponse] = [:]
  private(set) var previewResult: SourcePreviewResponse?
  private(set) var previewSourceID: String?

  init(client: APIClient) {
    self.client = client
  }

  func load(refresh: Bool = false) async {
    if refresh || !catalog.isEmpty {
      isRefreshing = true
    } else {
      state = .loading
    }
    defer { isRefreshing = false }

    do {
      async let catalogResult = client.sources()
      async let healthResult = client.sourceHealth()
      let (loadedCatalog, loadedHealth) = try await (catalogResult, healthResult)
      catalog = loadedCatalog.items
      health = loadedHealth
      state = catalog.isEmpty ? .empty : .loaded
    } catch {
      if catalog.isEmpty {
        state = .failed(Self.message(for: error))
      }
    }
  }

  func isBusy(source: String, operation: SourceOperation) -> Bool {
    busyOperations.contains(Self.operationKey(source: source, operation: operation))
  }

  func error(for source: String) -> String? {
    operationErrors[source]
  }

  func test(source: String) async {
    guard begin(source: source, operation: .test) else { return }
    defer { end(source: source, operation: .test) }
    do {
      testResults[source] = try await client.testSource(source: source)
      operationErrors[source] = nil
    } catch {
      operationErrors[source] = Self.message(for: error)
    }
  }

  func preview(source: String) async {
    guard begin(source: source, operation: .preview) else { return }
    defer { end(source: source, operation: .preview) }
    do {
      let result = try await client.previewSource(source: source)
      guard !result.persisted else {
        operationErrors[source] = "服务端返回了可写预览，已拒绝展示"
        previewResult = nil
        previewSourceID = nil
        return
      }
      previewResult = result
      previewSourceID = source
      operationErrors[source] = nil
    } catch {
      operationErrors[source] = Self.message(for: error)
    }
  }

  func sync(source: String) async {
    guard begin(source: source, operation: .sync) else { return }
    defer { end(source: source, operation: .sync) }
    do {
      _ = try await client.syncSource(source: source)
      operationErrors[source] = nil
      await load(refresh: true)
    } catch {
      operationErrors[source] = Self.message(for: error)
    }
  }

  func clearPreview() {
    previewResult = nil
    previewSourceID = nil
  }

  var groups: [SourceGroup] {
    let grouped = Dictionary(grouping: catalog, by: \.group)
    return grouped.keys.sorted().map { key in
      SourceGroup(id: key, title: Self.groupLabel(key), items: grouped[key] ?? [])
    }
  }

  func healthRows(for sourceID: String) -> [SourceHealthRow] {
    (health?.items ?? []).filter { $0.sourceId == sourceID }
  }

  private func begin(source: String, operation: SourceOperation) -> Bool {
    let key = Self.operationKey(source: source, operation: operation)
    guard !busyOperations.contains(key) else { return false }
    busyOperations.insert(key)
    operationErrors[source] = nil
    return true
  }

  private func end(source: String, operation: SourceOperation) {
    busyOperations.remove(Self.operationKey(source: source, operation: operation))
  }

  private static func operationKey(source: String, operation: SourceOperation) -> String {
    "\(source)|\(operation.rawValue)"
  }

  private static func groupLabel(_ value: String) -> String {
    switch value {
    case "global_metadata": return "全球元数据"
    case "cross_platform": return "跨平台热度"
    case "international_platform": return "国际流媒体"
    case "china_platform": return "中国平台"
    default: return value.replacingOccurrences(of: "_", with: " ")
    }
  }

  private static func message(for error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? "来源数据暂时无法加载"
  }
}

enum SourceOperation: String {
  case test
  case preview
  case sync
}

struct SourceGroup: Identifiable {
  let id: String
  let title: String
  let items: [SourceCatalogItem]
}

public struct SourcesView: View {
  private let client: APIClient
  @State private var model: SourcesViewModel

  public init(client: APIClient) {
    self.client = client
    _model = State(initialValue: SourcesViewModel(client: client))
  }

  public var body: some View {
    Group {
      switch model.state {
      case .idle, .loading:
        FeatureLoadingView(title: "加载数据源目录")
      case let .failed(message):
        FeatureFailureView(title: "数据源目录加载失败", message: message) { Task { await model.load() } }
      case .empty:
        FeatureEmptyView(title: "暂无数据源", message: "NAS 没有返回可展示的来源目录。", systemImage: "dot.radiowaves.left.and.right")
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
    .sheet(isPresented: Binding(
      get: { model.previewResult != nil },
      set: { if !$0 { model.clearPreview() } }
    )) {
      if let preview = model.previewResult {
        SourcePreviewSheet(preview: preview, sourceID: model.previewSourceID ?? "") {
          model.clearPreview()
        }
      }
    }
  }

  private var content: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        header
        if let summary = model.health?.summary {
          healthSummary(summary)
        }
        ForEach(model.groups) { group in
          VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: group.title, subtitle: "\(group.items.count) 个来源")
            LazyVStack(spacing: 10) {
              ForEach(group.items) { source in
                SourceCatalogRow(
                  source: source,
                  healthRows: model.healthRows(for: source.id),
                  isTesting: model.isBusy(source: source.id, operation: .test),
                  isPreviewing: model.isBusy(source: source.id, operation: .preview),
                  isSyncing: model.isBusy(source: source.id, operation: .sync),
                  errorMessage: model.error(for: source.id),
                  testResult: model.testResults[source.id],
                  onTest: { Task { await model.test(source: source.id) } },
                  onPreview: { Task { await model.preview(source: source.id) } },
                  onSync: { Task { await model.sync(source: source.id) } }
                )
              }
            }
          }
        }
      }
      .padding(28)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("数据源")
        .font(.system(size: 32, weight: .semibold, design: .serif))
        .foregroundStyle(DesignSystem.reelBlue)
      Text("查看来源覆盖、运行能力和 scope 健康；所有同步仍由 NAS 服务端执行。")
        .foregroundStyle(.secondary)
    }
  }

  private func healthSummary(_ summary: SourceHealthSummary) -> some View {
    HStack(spacing: 12) {
      HealthMetric(label: "通过", value: summary.passed, color: DesignSystem.archiveOlive)
      HealthMetric(label: "降级", value: summary.degraded, color: DesignSystem.reelBlue)
      HealthMetric(label: "失败", value: summary.failed, color: DesignSystem.cueRed)
      HealthMetric(label: "阻断", value: summary.blocked, color: DesignSystem.cueRed)
      HealthMetric(label: "可运行", value: summary.runnable, color: DesignSystem.reelBlue)
      HealthMetric(label: "过期", value: summary.stale, color: DesignSystem.cueRed)
    }
  }
}

private struct HealthMetric: View {
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

private struct SourceCatalogRow: View {
  let source: SourceCatalogItem
  let healthRows: [SourceHealthRow]
  let isTesting: Bool
  let isPreviewing: Bool
  let isSyncing: Bool
  let errorMessage: String?
  let testResult: SourceTestResponse?
  let onTest: () -> Void
  let onPreview: () -> Void
  let onSync: () -> Void

  var body: some View {
    DisclosureGroup {
      details
    } label: {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 8) {
            Text(source.name).font(.headline)
            SemanticStatusBadge(source.implementationStatus)
            SemanticStatusBadge(source.enabled ? "success" : "blocked")
          }
          Text(source.description)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 4) {
          Text(source.id).font(.caption.monospaced()).foregroundStyle(.secondary)
          HStack(spacing: 5) {
            Circle()
              .fill(source.runnable ? DesignSystem.archiveOlive : DesignSystem.cueRed)
              .frame(width: 7, height: 7)
            Text(source.runnable ? "可运行" : "不可运行")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
      }
    }
    .padding(13)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 8) {
        Button {
          onTest()
        } label: {
          Label(isTesting ? "测试中" : "连通性测试", systemImage: "bolt.horizontal")
        }
        .buttonStyle(.bordered)
        .disabled(isTesting || isPreviewing || isSyncing)
        Button {
          onPreview()
        } label: {
          Label(isPreviewing ? "预览中" : "只读预览", systemImage: "eye")
        }
        .buttonStyle(.bordered)
        .disabled(
          isTesting
            || isPreviewing
            || isSyncing
            || source.implementationStatus != "active"
            || !source.supportsSync
            || !source.credentialsComplete
        )
        Button {
          onSync()
        } label: {
          Label(isSyncing ? "同步中" : "立即同步", systemImage: "arrow.triangle.2.circlepath")
        }
        .buttonStyle(.borderedProminent)
        .tint(DesignSystem.reelBlue)
        .disabled(isTesting || isPreviewing || isSyncing || !source.supportsSync || !source.enabled || !source.runnable)
      }

      if let errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle")
          .font(.caption)
          .foregroundStyle(DesignSystem.cueRed)
      }
      if let testResult {
        HStack(spacing: 8) {
          SemanticStatusBadge(testResult.result.success ? "success" : "failed")
          Text(testResult.result.message)
          Text(SharedFormatters.durationText(milliseconds: testResult.result.durationMs))
            .foregroundStyle(.secondary)
        }
        .font(.caption)
      }
      sourceOverview
      healthOverview
    }
    .padding(.top, 12)
  }

  private var sourceOverview: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("能力与语义").font(.callout.weight(.medium))
        Spacer()
        Text("代理：\(source.proxyMode)").font(.caption.monospaced()).foregroundStyle(.secondary)
      }
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), alignment: .leading)], alignment: .leading, spacing: 7) {
        SourceFact(label: "凭据", value: source.credentialsComplete ? "完整" : "缺少 \(source.missingCredentials.joined(separator: "、"))")
        SourceFact(label: "支持同步", value: source.supportsSync ? "支持" : "不支持")
        SourceFact(label: "信号", value: source.semantics.signalKinds.map(sourceSignalLabel).joined(separator: "、"))
        SourceFact(label: "覆盖", value: source.semantics.coverage)
        SourceFact(label: "频率", value: source.semantics.cadence)
        SourceFact(label: "访问", value: sourceAccessLabel(source.semantics.access))
      }
      Text(source.semantics.freshnessNote)
        .font(.caption)
        .foregroundStyle(.secondary)
      if !source.semantics.riskNote.isEmpty {
        Text("风险：\(source.semantics.riskNote)")
          .font(.caption)
          .foregroundStyle(DesignSystem.cueRed)
      }
    }
  }

  private var healthOverview: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("scope 健康").font(.callout.weight(.medium))
      if healthRows.isEmpty {
        Text("暂无 scope 健康记录").font(.caption).foregroundStyle(.secondary)
      } else {
        LazyVStack(spacing: 6) {
          ForEach(healthRows) { row in
            HStack(spacing: 8) {
              Text(row.scope).font(.caption.monospaced()).frame(width: 120, alignment: .leading)
              SemanticStatusBadge(row.acceptanceStatus)
              SemanticStatusBadge(row.freshnessStatus)
              Text(row.reason).font(.caption).foregroundStyle(.secondary).lineLimit(1)
              Spacer()
              Text("\(row.itemCount) 条").font(.caption2).foregroundStyle(.secondary)
            }
          }
        }
      }
      if let latestRun = source.latestRun {
        HStack {
          Text("最近运行").font(.caption.weight(.medium))
          SemanticStatusBadge(latestRun.status)
          Text(SharedFormatters.relativeText(fromISO8601: latestRun.startedAt))
          Text("\(latestRun.itemCount) 条")
          if let duration = latestRun.durationMs {
            Text(SharedFormatters.durationText(milliseconds: duration))
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        if let error = latestRun.errorMessage, !error.isEmpty {
          Text("最近错误：\(error)")
            .font(.caption)
            .foregroundStyle(DesignSystem.cueRed)
            .lineLimit(2)
        }
      }
      if let local = source.localState {
        HStack {
          Text("本地文件").font(.caption.weight(.medium))
          SemanticStatusBadge(local.status)
          Text("\(local.readyFiles)/\(local.totalFiles) 就绪")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        if !local.files.isEmpty {
          LazyVStack(alignment: .leading, spacing: 4) {
            ForEach(local.files, id: \.fileName) { file in
              HStack(spacing: 7) {
                Image(systemName: file.exists ? "checkmark.circle" : "xmark.circle")
                  .foregroundStyle(file.exists ? DesignSystem.archiveOlive : DesignSystem.cueRed)
                Text(file.fileName).font(.caption.monospaced())
                if let size = file.sizeBytes {
                  Text(ByteCountFormatter.string(fromByteCount: size, countStyle: .file))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
                if let issue = file.issue, !issue.isEmpty {
                  Text(issue).font(.caption2).foregroundStyle(DesignSystem.cueRed).lineLimit(1)
                }
              }
            }
          }
        }
      }
    }
  }
}

private struct SourceFact: View {
  let label: String
  let value: String

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 7) {
      Text(label).font(.caption).foregroundStyle(.secondary)
      Text(value).font(.caption.weight(.medium)).lineLimit(2)
    }
  }
}

private func sourceSignalLabel(_ value: String) -> String {
  switch value {
  case "release_calendar": return "排期"
  case "platform_catalog": return "片库"
  case "platform_rank": return "平台榜"
  case "community_trend": return "社区热度"
  case "metadata": return "元数据"
  case "availability": return "可看性"
  case "box_office": return "票房"
  case "rating": return "口碑"
  case "news_signal": return "资讯"
  default: return value.replacingOccurrences(of: "_", with: " ")
  }
}

private func sourceAccessLabel(_ value: String) -> String {
  switch value {
  case "public_api": return "公开 API"
  case "free_key": return "免费 Key"
  case "application": return "申请制"
  case "commercial": return "商业授权"
  case "public_page": return "公开页面"
  case "restricted_page": return "页面受限"
  default: return value.replacingOccurrences(of: "_", with: " ")
  }
}

private struct SourcePreviewSheet: View {
  let preview: SourcePreviewResponse
  let sourceID: String
  let onClose: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text("只读预览 · \(sourceID)")
            .font(.title2.weight(.semibold))
          Text("服务端返回 persisted=false，本次预览没有写入数据。")
            .font(.callout)
            .foregroundStyle(DesignSystem.archiveOlive)
        }
        Spacer()
        Button("关闭", action: onClose)
      }
      HStack(spacing: 18) {
        PreviewMetric(label: "条目", value: String(preview.itemCount))
        PreviewMetric(label: "含海报", value: String(preview.withPoster))
        PreviewMetric(label: "scope", value: String(preview.scopes.count))
        if let start = preview.releaseDateStart {
          PreviewMetric(label: "起始日期", value: start)
        }
      }
      Divider()
      if preview.samples.isEmpty {
        FeatureEmptyView(title: "预览没有样本", message: "来源返回了空样本，但没有写入数据库。", systemImage: "eye.slash")
      } else {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(Array(preview.samples.enumerated()), id: \.offset) { _, sample in
              HStack(spacing: 10) {
                Text(sample.title).font(.callout.weight(.medium)).lineLimit(1)
                SemanticStatusBadge(sample.mediaType)
                Text(sample.scope).font(.caption.monospaced()).foregroundStyle(.secondary)
                Spacer()
                Text(sample.releaseDate ?? "日期待定").font(.caption).foregroundStyle(.secondary)
              }
              .padding(.vertical, 8)
              Divider()
            }
          }
        }
      }
    }
    .padding(24)
    .frame(minWidth: 720, minHeight: 480)
  }
}

private struct PreviewMetric: View {
  let label: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(label).font(.caption).foregroundStyle(.secondary)
      Text(value).font(.headline)
    }
  }
}
