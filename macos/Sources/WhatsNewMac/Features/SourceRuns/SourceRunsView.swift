import Observation
import SwiftUI
import WhatsNewCore

@MainActor
@Observable
final class SourceRunsViewModel {
  private let client: APIClient
  private(set) var response: SourceRunLogsResponse?
  private(set) var state: FeatureLoadState = .idle
  private(set) var isRefreshing = false
  private(set) var busySources: Set<String> = []
  private(set) var operationErrors: [String: String] = [:]
  var source = ""
  var status = ""
  var limit = 100

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
      let result = try await client.sourceRuns(
        source: source.nilIfEmpty,
        status: status.nilIfEmpty,
        limit: limit
      )
      response = result
      state = result.items.isEmpty ? .empty : .loaded
    } catch {
      if response == nil {
        state = .failed((error as? LocalizedError)?.errorDescription ?? "同步记录暂时无法加载")
      }
    }
  }

  func retry(_ item: SourceRunLogItem) async {
    guard item.status == "failed", item.retryable, !busySources.contains(item.sourceId) else { return }
    busySources.insert(item.sourceId)
    operationErrors[item.sourceId] = nil
    defer { busySources.remove(item.sourceId) }
    do {
      _ = try await client.syncSource(source: item.sourceId)
      await load(refresh: true)
    } catch {
      operationErrors[item.sourceId] = (error as? LocalizedError)?.errorDescription ?? "重试请求失败"
    }
  }
}

public struct SourceRunsView: View {
  private let client: APIClient
  @State private var model: SourceRunsViewModel

  public init(client: APIClient) {
    self.client = client
    _model = State(initialValue: SourceRunsViewModel(client: client))
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
      Text("同步记录")
        .font(.system(size: 32, weight: .semibold, design: .serif))
        .foregroundStyle(DesignSystem.archiveOlive)
      Text("按来源和状态查看 scope、耗时、条目数及服务端脱敏错误。")
        .foregroundStyle(.secondary)
    }
    .padding(28)
  }

  private var controls: some View {
    HStack(spacing: 12) {
      Picker("来源", selection: $model.source) {
        Text("全部来源").tag("")
        ForEach(model.response?.sources ?? [], id: \.id) { source in
          Text(source.name).tag(source.id)
        }
      }
      .frame(width: 190)
      Picker("状态", selection: $model.status) {
        Text("全部状态").tag("")
        Text("运行中").tag("running")
        Text("成功").tag("success")
        Text("有警告").tag("warning")
        Text("失败").tag("failed")
      }
      .frame(width: 130)
      Button("应用筛选") { Task { await model.load(refresh: true) } }
        .buttonStyle(.borderedProminent)
        .tint(DesignSystem.archiveOlive)
      Spacer()
      if let generatedAt = model.response?.generatedAt {
        Text("更新于 \(SharedFormatters.relativeText(fromISO8601: generatedAt))")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 28)
    .padding(.bottom, 16)
    .onChange(of: model.source) { _, _ in Task { await model.load(refresh: true) } }
    .onChange(of: model.status) { _, _ in Task { await model.load(refresh: true) } }
  }

  @ViewBuilder
  private var resultBody: some View {
    switch model.state {
    case .idle, .loading:
      FeatureLoadingView(title: "加载同步记录")
    case let .failed(message):
      FeatureFailureView(title: "同步记录加载失败", message: message) { Task { await model.load() } }
    case .empty:
      FeatureEmptyView(title: "暂无同步记录", message: "当前筛选没有匹配的来源运行。", systemImage: "clock.arrow.circlepath")
    case .loaded:
      ScrollView {
        LazyVStack(spacing: 0) {
          ForEach(model.response?.items ?? []) { item in
            SourceRunRow(
              item: item,
              isRetrying: model.busySources.contains(item.sourceId),
              errorMessage: model.operationErrors[item.sourceId],
              onRetry: { Task { await model.retry(item) } }
            )
            Divider()
          }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 14)
      }
    }
  }
}

private struct SourceRunRow: View {
  let item: SourceRunLogItem
  let isRetrying: Bool
  let errorMessage: String?
  let onRetry: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 8) {
          Text(item.sourceName).font(.callout.weight(.medium))
          Text(item.sourceId).font(.caption.monospaced()).foregroundStyle(.secondary)
          SemanticStatusBadge(item.status)
        }
        HStack(spacing: 12) {
          Text("scope \(item.scope)")
          Text("开始 \(SharedFormatters.dateTimeText(fromISO8601: item.startedAt))")
          if let finishedAt = item.finishedAt {
            Text("结束 \(SharedFormatters.dateTimeText(fromISO8601: finishedAt))")
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 5) {
        Text("\(item.itemCount) 条")
          .font(.callout.monospaced())
        Text(SharedFormatters.durationText(milliseconds: item.durationMs))
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      if item.status == "failed", item.retryable {
        Button {
          onRetry()
        } label: {
          Label(isRetrying ? "重试中" : "重试", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.bordered)
        .disabled(isRetrying)
      }
    }
    .padding(.vertical, 11)
    .overlay(alignment: .bottomLeading) {
      if let errorMessage = errorMessage ?? item.errorMessage, !errorMessage.isEmpty {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(DesignSystem.cueRed)
          .lineLimit(2)
          .offset(y: 29)
      }
    }
    .padding(.bottom, errorMessage == nil && item.errorMessage == nil ? 0 : 24)
  }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
