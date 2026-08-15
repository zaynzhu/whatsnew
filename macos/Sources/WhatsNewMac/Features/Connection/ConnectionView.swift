import SwiftUI
import WhatsNewCore

public struct ConnectionView: View {
  @Environment(AppState.self) private var appState

  public init() {}

  public var body: some View {
    @Bindable var appState = appState

    VStack(alignment: .leading, spacing: 24) {
      VStack(alignment: .leading, spacing: 8) {
        Text("WhatsNew")
          .font(.system(size: 38, weight: .semibold, design: .serif))
          .foregroundStyle(DesignSystem.reelBlue)
        Text("私人放映室的影视情报台")
          .font(.title3)
          .foregroundStyle(.secondary)
      }

      Divider()

      VStack(alignment: .leading, spacing: 12) {
        Text("连接 NAS 服务")
          .font(DesignSystem.sectionTitle)
        Text("填写运行 WhatsNew 后端的 NAS 地址。客户端只连接这个地址，不会在 Mac 上启动服务或同步任务。")
          .font(DesignSystem.body)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
        TextField("例如 http://nas.local:19992", text: $appState.addressDraft)
          .textFieldStyle(.roundedBorder)
          .font(.body.monospaced())
          .onSubmit {
            Task { await appState.connect() }
          }
      }

      if case .connecting = appState.connectionState {
        HStack(spacing: 8) {
          ProgressView()
            .controlSize(.small)
          Text("正在验证服务身份…")
            .foregroundStyle(.secondary)
        }
      } else {
        Button("验证并连接") {
          Task { await appState.connect() }
        }
        .buttonStyle(.borderedProminent)
        .tint(DesignSystem.reelBlue)
        .disabled(appState.addressDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }

      if let lastError = appState.lastError {
        Label(lastError, systemImage: "exclamationmark.triangle")
          .foregroundStyle(DesignSystem.cueRed)
          .fixedSize(horizontal: false, vertical: true)
      }

      Text("当前服务没有身份认证，请仅在可信局域网使用。公开域名默认需要 HTTPS。")
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(48)
    .frame(maxWidth: 650)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(.regularMaterial)
  }
}
