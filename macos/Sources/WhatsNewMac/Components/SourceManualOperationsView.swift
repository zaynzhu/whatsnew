import SwiftUI
import WhatsNewCore

struct SourceManualOperationsView: View {
  let source: SourceSettingsView

  var body: some View {
    if !source.manualCommands.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        Text("本地操作")
          .font(.callout.weight(.medium))
        if let guidance = sourceActionGuidance(for: source) {
          guidanceCard(guidance)
        }
        ForEach(source.manualCommands, id: \.command) { command in
          VStack(alignment: .leading, spacing: 4) {
            Text(command.label)
              .font(.caption.weight(.medium))
            Text(command.command)
              .font(.caption.monospaced())
              .textSelection(.enabled)
            Text(command.description)
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
          .padding(10)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        }
        Text("这些命令仅供在 NAS 项目目录中手动执行，Mac 客户端不会执行本地脚本。")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
      .padding(12)
      .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
  }

  private func guidanceCard(_ guidance: SourceActionGuidance) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(guidance.title)
        .font(.caption.weight(.semibold))
      Text(guidance.detail)
        .font(.caption2)
      if let command = guidance.command {
        Text(command)
          .font(.caption2.monospaced())
          .textSelection(.enabled)
      }
    }
    .foregroundStyle(guidanceColor(guidance.tone))
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(guidanceColor(guidance.tone).opacity(0.1), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
  }

  private func guidanceColor(_ tone: SourceActionGuidanceTone) -> Color {
    switch tone {
    case .neutral: return DesignSystem.reelBlue
    case .warning: return .orange
    case .success: return DesignSystem.archiveOlive
    case .error: return DesignSystem.cueRed
    }
  }
}
