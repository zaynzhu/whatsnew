import Observation
import SwiftUI
import WhatsNewCore

private func settingsSourceEnvKey(sourceID: String, suffix: String) -> String {
  "SOURCE_\(sourceID.uppercased())_\(suffix)"
}

@MainActor
@Observable
final class SourceSettingsDraft {
  let source: SourceSettingsView
  private(set) var values: [String: String]
  private(set) var touchedKeys: Set<String> = []
  private(set) var clearKeys: Set<String> = []

  init(source: SourceSettingsView) {
    self.source = source
    var values: [String: String] = [:]
    for field in source.fields {
      // 敏感字段只显示配置状态，绝不把 maskedValue 复制进编辑值。
      values[field.key] = field.sensitive ? "" : (field.value ?? "")
    }
    values[settingsSourceEnvKey(sourceID: source.id, suffix: "ENABLED")] = source.enabled ? "true" : "false"
    values[settingsSourceEnvKey(sourceID: source.id, suffix: "PROXY_MODE")] = source.proxyMode
    self.values = values
  }

  var hasChanges: Bool {
    !touchedKeys.isEmpty || !clearKeys.isEmpty
  }

  func value(for key: String) -> String {
    values[key] ?? ""
  }

  func setValue(_ value: String, for key: String) {
    values[key] = value
    clearKeys.remove(key)
    // 空输入不会自动清除，也不会进入本次保存 payload。
    if value.isEmpty {
      touchedKeys.remove(key)
    } else {
      touchedKeys.insert(key)
    }
  }

  func toggleClear(_ key: String) {
    if clearKeys.contains(key) {
      clearKeys.remove(key)
      if let field = source.fields.first(where: { $0.key == key }) {
        values[key] = field.sensitive ? "" : (field.value ?? "")
      }
      return
    }
    values[key] = ""
    touchedKeys.remove(key)
    clearKeys.insert(key)
  }

  var request: SettingsUpdateRequest {
    SettingsUpdateRequest(
      values: touchedKeys.reduce(into: [:]) { result, key in
        guard let value = values[key], !value.isEmpty else { return }
        result[key] = value
      },
      clearKeys: clearKeys.sorted()
    )
  }
}

enum SettingsSaveScope {
  case global
  case weights
  case scheduler
  case source
}

@MainActor
@Observable
final class SettingsViewModel {
  private let client: APIClient
  private(set) var response: SettingsResponse?
  private(set) var state: FeatureLoadState = .idle
  private(set) var isRefreshing = false
  private(set) var isSaving = false
  private(set) var isTestingProxy = false
  private(set) var saveError: String?
  private(set) var saveMessage: String?
  private(set) var proxyTestResults: [ConnectionTestResult] = []

  private(set) var globalValues: [String: String] = [:]
  private(set) var globalTouchedKeys: Set<String> = []
  private(set) var globalClearKeys: Set<String> = []
  private(set) var weightValues: [String: String] = [:]
  private(set) var weightTouchedKeys: Set<String> = []
  private(set) var schedulerValues: [String: String] = [:]
  private(set) var schedulerTouchedKeys: Set<String> = []

  init(client: APIClient) {
    self.client = client
  }

  func load(refresh: Bool = false, resetDrafts: Bool = false) async {
    if refresh || response != nil {
      isRefreshing = true
    } else {
      state = .loading
    }
    defer { isRefreshing = false }
    do {
      let loaded = try await client.settings()
      response = loaded
      state = .loaded
      if resetDrafts || globalValues.isEmpty || !hasTopLevelChanges {
        resetDraftState(from: loaded)
      }
    } catch {
      if response == nil {
        state = .failed(Self.message(for: error))
      }
    }
  }

  func globalValue(for key: String) -> String {
    globalValues[key] ?? ""
  }

  func setGlobalValue(_ value: String, for key: String) {
    globalValues[key] = value
    globalClearKeys.remove(key)
    if value.isEmpty {
      globalTouchedKeys.remove(key)
    } else {
      globalTouchedKeys.insert(key)
    }
  }

  func toggleGlobalClear(_ key: String) {
    if globalClearKeys.contains(key) {
      globalClearKeys.remove(key)
      return
    }
    globalValues[key] = ""
    globalTouchedKeys.remove(key)
    globalClearKeys.insert(key)
  }

  func weightValue(for key: String) -> String {
    weightValues[key] ?? ""
  }

  func setWeightValue(_ value: String, for key: String) {
    weightValues[key] = value
    if value.isEmpty {
      weightTouchedKeys.remove(key)
    } else {
      weightTouchedKeys.insert(key)
    }
  }

  func restoreWeight(_ weight: ContentWeightView) {
    setWeightValue(String(Int(weight.defaultValue)), for: weight.key)
  }

  func schedulerValue(for key: String) -> String {
    schedulerValues[key] ?? ""
  }

  func setSchedulerValue(_ value: String, for key: String) {
    schedulerValues[key] = value
    if value.isEmpty {
      schedulerTouchedKeys.remove(key)
    } else {
      schedulerTouchedKeys.insert(key)
    }
  }

  var globalRequest: SettingsUpdateRequest {
    makeRequest(values: globalValues, touched: globalTouchedKeys, clearKeys: globalClearKeys)
  }

  var weightRequest: SettingsUpdateRequest {
    makeRequest(values: weightValues, touched: weightTouchedKeys, clearKeys: [])
  }

  var schedulerRequest: SettingsUpdateRequest {
    makeRequest(values: schedulerValues, touched: schedulerTouchedKeys, clearKeys: [])
  }

  private var hasTopLevelChanges: Bool {
    !globalTouchedKeys.isEmpty
      || !globalClearKeys.isEmpty
      || !weightTouchedKeys.isEmpty
      || !schedulerTouchedKeys.isEmpty
  }

  @discardableResult
  func save(_ request: SettingsUpdateRequest, scope: SettingsSaveScope) async -> Bool {
    guard !isSaving, !request.values.isEmpty || !request.clearKeys.isEmpty else {
      return false
    }
    isSaving = true
    saveError = nil
    saveMessage = nil
    defer { isSaving = false }
    do {
      _ = try await client.updateSettings(request)
      // 只有 PUT 成功且 GET readback 成功后，才清理内存中的敏感编辑值。
      let loaded = try await client.settings()
      response = loaded
      state = .loaded
      switch scope {
      case .global:
        resetGlobalDraft(from: loaded)
      case .weights:
        resetWeightDraft(from: loaded)
      case .scheduler:
        resetSchedulerDraft(from: loaded)
      case .source:
        break
      }
      saveMessage = "已保存并完成服务端读取确认"
      return true
    } catch {
      saveError = Self.message(for: error)
      return false
    }
  }

  func testProxy() async {
    guard !isTestingProxy else { return }
    isTestingProxy = true
    saveError = nil
    defer { isTestingProxy = false }
    do {
      let httpProxy = nonEmpty(globalValues["HTTP_PROXY"])
      let httpsProxy = nonEmpty(globalValues["HTTPS_PROXY"])
      proxyTestResults = try await client.testProxy(httpProxy: httpProxy, httpsProxy: httpsProxy).items
    } catch {
      saveError = Self.message(for: error)
    }
  }

  private func resetDraftState(from settings: SettingsResponse) {
    resetGlobalDraft(from: settings)
    resetWeightDraft(from: settings)
    resetSchedulerDraft(from: settings)
  }

  private func resetGlobalDraft(from settings: SettingsResponse) {
    globalValues = Dictionary(uniqueKeysWithValues: settings.proxyFields.map { field in
      (field.key, field.sensitive ? "" : (field.value ?? ""))
    })
    globalTouchedKeys = []
    globalClearKeys = []
  }

  private func resetWeightDraft(from settings: SettingsResponse) {
    weightValues = Dictionary(uniqueKeysWithValues: settings.contentWeights.map { weight in
      (weight.key, String(Int(weight.value)))
    })
    weightTouchedKeys = []
  }

  private func resetSchedulerDraft(from settings: SettingsResponse) {
    schedulerValues = [
      "SCHEDULER_HOURLY_INTERVAL_HOURS": String(Int(settings.scheduler.hourlyIntervalHours)),
      "SCHEDULER_DAILY_TIME": settings.scheduler.dailyTime
    ]
    schedulerTouchedKeys = []
  }

  private func makeRequest(
    values: [String: String],
    touched: Set<String>,
    clearKeys: Set<String>
  ) -> SettingsUpdateRequest {
    SettingsUpdateRequest(
      values: touched.reduce(into: [:]) { result, key in
        guard let value = values[key], !value.isEmpty else { return }
        result[key] = value
      },
      clearKeys: clearKeys.sorted()
    )
  }

  private static func message(for error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? "设置请求失败"
  }
}

private func nonEmpty(_ value: String?) -> String? {
  guard let value, !value.isEmpty else { return nil }
  return value
}

public struct SettingsView: View {
  private let client: APIClient
  private let onContentWeightsSaved: () -> Void
  @State private var model: SettingsViewModel
  @State private var selectedSource: SourceSettingsView?

  public init(client: APIClient, onContentWeightsSaved: @escaping () -> Void = {}) {
    self.client = client
    self.onContentWeightsSaved = onContentWeightsSaved
    _model = State(initialValue: SettingsViewModel(client: client))
  }

  public var body: some View {
    Group {
      switch model.state {
      case .idle, .loading:
        FeatureLoadingView(title: "加载设置")
      case let .failed(message):
        FeatureFailureView(title: "设置加载失败", message: message) { Task { await model.load() } }
      case .empty, .loaded:
        content
      }
    }
    .task { await model.load() }
    .refreshable { await model.load(refresh: true) }
    .overlay(alignment: .topTrailing) {
      if model.isRefreshing || model.isSaving {
        ProgressView()
          .controlSize(.small)
          .padding(16)
      }
    }
    .sheet(item: $selectedSource) { source in
      SourceSettingsEditorView(
        source: source,
        isSaving: model.isSaving,
        errorMessage: model.saveError,
        onSave: { request in
          let success = await model.save(request, scope: .source)
          if success { selectedSource = nil }
          return success
        }
      )
    }
  }

  private var content: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 26) {
        header
        if let error = model.saveError {
          Label(error, systemImage: "exclamationmark.triangle")
            .font(.callout)
            .foregroundStyle(DesignSystem.cueRed)
        }
        if let message = model.saveMessage {
          Label(message, systemImage: "checkmark.circle")
            .font(.callout)
            .foregroundStyle(DesignSystem.archiveOlive)
        }
        if let response = model.response {
          proxySection(response)
          weightsSection(response)
          schedulerSection(response)
          sourcesSection(response)
        }
      }
      .padding(28)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("设置")
        .font(.system(size: 32, weight: .semibold, design: .serif))
        .foregroundStyle(DesignSystem.archiveOlive)
      Text("设置只写入 NAS 服务端；Mac 不保存凭据、不启动 scheduler，也不访问 NAS 文件系统。")
        .foregroundStyle(.secondary)
      Label("当前服务没有身份认证，请仅在可信局域网使用。", systemImage: "lock.shield")
        .font(.callout)
        .foregroundStyle(DesignSystem.cueRed)
    }
  }

  private func proxySection(_ response: SettingsResponse) -> some View {
    VStack(alignment: .leading, spacing: 13) {
      SectionHeader(title: "全局网络", subtitle: "HTTP / HTTPS 代理")
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), alignment: .leading)], alignment: .leading, spacing: 12) {
        ForEach(response.proxyFields, id: \.key) { field in
          VStack(alignment: .leading, spacing: 7) {
            HStack {
              Text(field.label).font(.callout.weight(.medium))
              Spacer()
              Text(field.configured ? (field.maskedValue ?? "已配置") : "未配置")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            SecureField("输入新值（留空不会清除）", text: binding(for: field.key))
              .textFieldStyle(.roundedBorder)
            HStack {
              Button(model.globalClearKeys.contains(field.key) ? "取消清除" : "明确清除") {
                model.toggleGlobalClear(field.key)
              }
                .buttonStyle(.bordered)
                .disabled(
                  !model.globalClearKeys.contains(field.key)
                    && !field.configured
                    && model.globalValue(for: field.key).isEmpty
                )
              if model.globalClearKeys.contains(field.key) {
                Text("保存后清除")
                  .font(.caption)
                  .foregroundStyle(DesignSystem.cueRed)
              }
            }
          }
          .padding(12)
          .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
      }
      HStack(spacing: 10) {
        Button {
          Task { await model.testProxy() }
        } label: {
          Label(model.isTestingProxy ? "测试中" : "测试代理", systemImage: "network")
        }
        .buttonStyle(.bordered)
        .disabled(model.isTestingProxy)
        Button("保存全局代理") {
          Task { await model.save(model.globalRequest, scope: .global) }
        }
        .buttonStyle(.borderedProminent)
        .tint(DesignSystem.archiveOlive)
        .disabled(model.isSaving || !hasChanges(model.globalRequest))
      }
      proxyResults
    }
  }

  @ViewBuilder
  private var proxyResults: some View {
    if !model.proxyTestResults.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        Text("代理测试结果").font(.callout.weight(.medium))
        ForEach(Array(model.proxyTestResults.enumerated()), id: \.offset) { _, result in
          HStack(spacing: 8) {
            SemanticStatusBadge(result.success ? "success" : "failed")
            Text(proxyModeLabel(result.mode))
            Text(result.message)
            Text(SharedFormatters.durationText(milliseconds: result.durationMs))
              .foregroundStyle(.secondary)
          }
          .font(.caption)
        }
      }
    }
  }

  private func weightsSection(_ response: SettingsResponse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "内容关注权重", subtitle: "用于首页和图片维护优先级；范围 0–100")
      LazyVStack(spacing: 0) {
        ForEach(response.contentWeights, id: \.key) { weight in
          HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
              Text(weight.label).font(.callout.weight(.medium))
              Text(weight.description).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            TextField("权重", text: bindingForWeight(weight.key))
              .textFieldStyle(.roundedBorder)
              .frame(width: 70)
            Text("默认 \(Int(weight.defaultValue))")
              .font(.caption)
              .foregroundStyle(.secondary)
            Button("恢复默认") { model.restoreWeight(weight) }
              .buttonStyle(.bordered)
          }
          .padding(.vertical, 9)
          Divider()
        }
      }
      HStack(spacing: 10) {
        Button("保存关注权重") {
          Task {
            if await model.save(model.weightRequest, scope: .weights) {
              onContentWeightsSaved()
            }
          }
        }
        .buttonStyle(.borderedProminent)
        .tint(DesignSystem.archiveOlive)
        .disabled(model.isSaving || !hasChanges(model.weightRequest))
        if let message = model.saveMessage {
          Text(message).font(.caption).foregroundStyle(DesignSystem.archiveOlive)
        }
      }
    }
  }

  private func schedulerSection(_ response: SettingsResponse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "调度", subtitle: "Mac 只编辑服务端调度参数")
      VStack(alignment: .leading, spacing: 9) {
        HStack(spacing: 16) {
          SchedulerFact(label: "启用", value: response.scheduler.enabled ? "已启用" : "未启用")
          SchedulerFact(label: "强制禁用", value: response.scheduler.forcedDisabled ? "是" : "否")
          SchedulerFact(label: "时区", value: response.scheduler.timezone)
          SchedulerFact(label: "下次小时组", value: response.scheduler.nextHourlyRunAt.map { SharedFormatters.dateTimeText(fromISO8601: $0) } ?? "—")
          SchedulerFact(label: "下次日组", value: response.scheduler.nextDailyRunAt.map { SharedFormatters.dateTimeText(fromISO8601: $0) } ?? "—")
        }
        HStack(spacing: 12) {
          Picker("小时组间隔", selection: Binding(
            get: { model.schedulerValue(for: "SCHEDULER_HOURLY_INTERVAL_HOURS") },
            set: { model.setSchedulerValue($0, for: "SCHEDULER_HOURLY_INTERVAL_HOURS") }
          )) {
            ForEach([1, 2, 3, 4, 6, 12], id: \.self) { interval in
              Text("每 \(interval) 小时").tag(String(interval))
            }
          }
          .frame(width: 170)
          TextField("日组时间 HH:mm", text: Binding(
            get: { model.schedulerValue(for: "SCHEDULER_DAILY_TIME") },
            set: { model.setSchedulerValue($0, for: "SCHEDULER_DAILY_TIME") }
          ))
          .textFieldStyle(.roundedBorder)
          .frame(width: 150)
          Button("保存调度") {
            Task { await model.save(model.schedulerRequest, scope: .scheduler) }
          }
          .buttonStyle(.borderedProminent)
          .tint(DesignSystem.archiveOlive)
          .disabled(model.isSaving || !hasChanges(model.schedulerRequest))
        }
        Text("调度启用状态和强制禁用状态只读展示，不生成虚构的 scheduler enable 写键。")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding(13)
      .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
  }

  private func sourcesSection(_ response: SettingsResponse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeader(title: "单来源配置", subtitle: "每次只编辑一个来源")
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), alignment: .leading)], alignment: .leading, spacing: 10) {
        ForEach(response.sources) { source in
          Button { selectedSource = source } label: {
            VStack(alignment: .leading, spacing: 7) {
              HStack {
                Text(source.name).font(.headline)
                Spacer()
                SemanticStatusBadge(source.implementationStatus)
              }
              Text(source.description)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
              HStack(spacing: 8) {
                Text(source.enabled ? "已启用" : "未启用")
                Text(source.runnable ? "可运行" : "不可运行")
                Text(source.credentialsComplete ? "凭据完整" : "凭据缺失")
              }
              .font(.caption)
              .foregroundStyle(source.runnable ? DesignSystem.archiveOlive : DesignSystem.cueRed)
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func binding(for key: String) -> Binding<String> {
    Binding(
      get: { model.globalValue(for: key) },
      set: { model.setGlobalValue($0, for: key) }
    )
  }

  private func bindingForWeight(_ key: String) -> Binding<String> {
    Binding(
      get: { model.weightValue(for: key) },
      set: { model.setWeightValue($0, for: key) }
    )
  }
}

private struct SchedulerFact: View {
  let label: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(label).font(.caption).foregroundStyle(.secondary)
      Text(value).font(.caption.weight(.medium))
    }
  }
}

private func hasChanges(_ request: SettingsUpdateRequest) -> Bool {
  !request.values.isEmpty || !request.clearKeys.isEmpty
}

private func proxyModeLabel(_ mode: String) -> String {
  switch mode {
  case "direct": return "直连"
  case "http_proxy": return "HTTP 代理"
  case "https_proxy": return "HTTPS 代理"
  case "source": return "来源"
  default: return mode
  }
}

private struct SourceSettingsEditorView: View {
  @Environment(\.dismiss) private var dismiss
  let source: SourceSettingsView
  let isSaving: Bool
  let errorMessage: String?
  let onSave: (SettingsUpdateRequest) async -> Bool
  @State private var draft: SourceSettingsDraft

  init(
    source: SourceSettingsView,
    isSaving: Bool,
    errorMessage: String?,
    onSave: @escaping (SettingsUpdateRequest) async -> Bool
  ) {
    self.source = source
    self.isSaving = isSaving
    self.errorMessage = errorMessage
    self.onSave = onSave
    _draft = State(initialValue: SourceSettingsDraft(source: source))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text("配置来源 · \(source.name)").font(.title2.weight(.semibold))
          Text("敏感值只在本窗口内存中存在，关闭或保存确认后清除。")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Button("取消") { dismiss() }
      }
      Divider()
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          sourcePolicy
          ForEach(editableFields, id: \.key) { field in
            fieldEditor(field)
          }
        }
      }
      if let errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle")
          .font(.caption)
          .foregroundStyle(DesignSystem.cueRed)
      }
      HStack {
        Spacer()
        Button(isSaving ? "保存中" : "保存来源配置") {
          Task {
            if await onSave(draft.request) {
              dismiss()
            }
          }
        }
        .buttonStyle(.borderedProminent)
        .tint(DesignSystem.archiveOlive)
        .disabled(isSaving || !draft.hasChanges)
      }
    }
    .padding(24)
    .frame(minWidth: 720, minHeight: 560)
  }

  private var sourcePolicy: some View {
    VStack(alignment: .leading, spacing: 10) {
      if source.supportsEnable {
        Toggle("启用来源", isOn: Binding(
          get: { draft.value(for: settingsSourceEnvKey(sourceID: source.id, suffix: "ENABLED")) == "true" },
          set: { draft.setValue($0 ? "true" : "false", for: settingsSourceEnvKey(sourceID: source.id, suffix: "ENABLED")) }
        ))
      }
      Picker("代理模式", selection: Binding(
        get: { draft.value(for: settingsSourceEnvKey(sourceID: source.id, suffix: "PROXY_MODE")) },
        set: { draft.setValue($0, for: settingsSourceEnvKey(sourceID: source.id, suffix: "PROXY_MODE")) }
      )) {
        Text("跟随全局").tag("inherit")
        Text("直连").tag("direct")
        Text("自定义").tag("custom")
      }
      .frame(width: 180)
      Text("启用键和代理模式键沿用服务端 sourceEnvKey 契约。")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .padding(12)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
  }

  private var editableFields: [SettingsFieldView] {
    source.fields.filter { field in
      draft.value(for: settingsSourceEnvKey(sourceID: source.id, suffix: "PROXY_MODE")) == "custom"
        || (!field.key.hasSuffix("_HTTP_PROXY") && !field.key.hasSuffix("_HTTPS_PROXY"))
    }
  }

  @ViewBuilder
  private func fieldEditor(_ field: SettingsFieldView) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack {
        Text(field.label).font(.callout.weight(.medium))
        Spacer()
        Text(field.sensitive ? (field.configured ? "已配置（不回显）" : "未配置") : (field.value ?? "未配置"))
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      if field.type == "select" {
        Picker(field.label, selection: binding(for: field.key)) {
          ForEach(field.options ?? [], id: \.self) { option in
            Text(option).tag(option)
          }
        }
        .labelsHidden()
        .frame(width: 180)
      } else if field.sensitive {
        SecureField("输入新值（留空不会清除）", text: binding(for: field.key))
          .textFieldStyle(.roundedBorder)
      } else {
        TextField("输入值", text: binding(for: field.key))
          .textFieldStyle(.roundedBorder)
      }
      HStack {
        Button(draft.clearKeys.contains(field.key) ? "取消清除" : "明确清除") {
          draft.toggleClear(field.key)
        }
          .buttonStyle(.bordered)
          .disabled(
            !draft.clearKeys.contains(field.key)
              && !field.configured
              && draft.value(for: field.key).isEmpty
          )
        if draft.clearKeys.contains(field.key) {
          Text("保存后清除").font(.caption).foregroundStyle(DesignSystem.cueRed)
        }
      }
    }
    .padding(12)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
  }

  private func binding(for key: String) -> Binding<String> {
    Binding(
      get: { draft.value(for: key) },
      set: { draft.setValue($0, for: key) }
    )
  }
}
