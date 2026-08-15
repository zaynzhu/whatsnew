import SwiftUI

/// 页面级的加载状态，保留已加载内容时由具体页面显示刷新指示器。
public enum FeatureLoadState: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case empty
  case failed(String)
}

public struct FeatureLoadingView: View {
  public let title: String
  public let subtitle: String

  public init(title: String = "正在加载", subtitle: String = "正在从 NAS 获取最新内容…") {
    self.title = title
    self.subtitle = subtitle
  }

  public var body: some View {
    VStack(spacing: 12) {
      ProgressView()
        .controlSize(.large)
      Text(title)
        .font(.headline)
      Text(subtitle)
        .font(.callout)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .combine)
  }
}

public struct FeatureEmptyView: View {
  public let title: String
  public let message: String
  public let systemImage: String

  public init(
    title: String,
    message: String,
    systemImage: String = "film.stack"
  ) {
    self.title = title
    self.message = message
    self.systemImage = systemImage
  }

  public var body: some View {
    ContentUnavailableView(title, systemImage: systemImage, description: Text(message))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

public struct FeatureFailureView: View {
  public let title: String
  public let message: String
  public let retry: (() -> Void)?

  public init(
    title: String = "内容加载失败",
    message: String,
    retry: (() -> Void)? = nil
  ) {
    self.title = title
    self.message = message
    self.retry = retry
  }

  public var body: some View {
    VStack(spacing: 14) {
      Image(systemName: "wifi.exclamationmark")
        .font(.system(size: 32))
        .foregroundStyle(DesignSystem.cueRed)
      Text(title)
        .font(.headline)
      Text(message)
        .multilineTextAlignment(.center)
        .foregroundStyle(.secondary)
      if let retry {
        Button("重试", action: retry)
          .buttonStyle(.borderedProminent)
          .tint(DesignSystem.reelBlue)
      }
    }
    .padding(32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

public struct SectionHeader: View {
  public let title: String
  public let subtitle: String?
  public let action: (() -> Void)?

  public init(title: String, subtitle: String? = nil, action: (() -> Void)? = nil) {
    self.title = title
    self.subtitle = subtitle
    self.action = action
  }

  public var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      Text(title)
        .font(DesignSystem.sectionTitle)
      if let subtitle {
        Text(subtitle)
          .font(.callout)
          .foregroundStyle(.secondary)
      }
      Spacer()
      if let action {
        Button("查看全部", action: action)
          .buttonStyle(.link)
          .font(.callout)
      }
    }
  }
}
