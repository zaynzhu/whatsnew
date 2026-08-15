import SwiftUI

public enum DesignSystem {
  public static let reelBlue = Color(hex: 0x315A70)
  public static let cueRed = Color(hex: 0xC8553D)
  public static let archiveOlive = Color(hex: 0x7A8062)

  public static let sectionTitle = Font.system(.title2, design: .serif).weight(.semibold)
  public static let body = Font.system(.body, design: .default)
  public static let mono = Font.system(.body, design: .monospaced)
}

private extension Color {
  init(hex: UInt, opacity: Double = 1) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: opacity
    )
  }
}

public struct StatusBadge: View {
  public let text: String
  public let color: Color

  public init(text: String, color: Color) {
    self.text = text
    self.color = color
  }

  public var body: some View {
    Text(text)
      .font(.caption.monospaced())
      .foregroundStyle(color)
      .padding(.horizontal, 6)
      .padding(.vertical, 3)
      .overlay {
        RoundedRectangle(cornerRadius: 4)
          .stroke(color.opacity(0.65), lineWidth: 1)
      }
  }
}
