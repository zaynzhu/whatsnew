import SwiftUI
import WhatsNewCore

private enum NavigationItem: String, CaseIterable, Identifiable {
  case dashboard
  case discover
  case trending
  case preview
  case calendar
  case sources
  case sourceRuns
  case posterHealth
  case settings

  var id: String { rawValue }

  var title: String {
    switch self {
    case .dashboard: return "情报台"
    case .discover: return "发现"
    case .trending: return "热度"
    case .preview: return "前瞻"
    case .calendar: return "日历"
    case .sources: return "数据源"
    case .sourceRuns: return "同步记录"
    case .posterHealth: return "图片健康"
    case .settings: return "设置"
    }
  }

  var icon: String {
    switch self {
    case .dashboard: return "rectangle.3.group"
    case .discover: return "magnifyingglass"
    case .trending: return "chart.line.uptrend.xyaxis"
    case .preview: return "calendar.badge.clock"
    case .calendar: return "calendar"
    case .sources: return "dot.radiowaves.left.and.right"
    case .sourceRuns: return "clock.arrow.circlepath"
    case .posterHealth: return "photo"
    case .settings: return "gearshape"
    }
  }
}

public struct MainShellView: View {
  @Environment(AppState.self) private var appState
  @State private var selection: NavigationItem? = .dashboard
  @State private var searchText = ""
  @State private var selectedMediaID: String?
  @State private var contentRevision = 0

  public init() {}

  public var body: some View {
    NavigationSplitView {
      List(selection: $selection) {
        Section("浏览") {
          navigationRow(.dashboard)
          navigationRow(.discover)
          navigationRow(.trending)
          navigationRow(.preview)
          navigationRow(.calendar)
        }

        Section("控制中心") {
          navigationRow(.sources)
          navigationRow(.sourceRuns)
          navigationRow(.posterHealth)
        }

        Section("系统") {
          navigationRow(.settings)
        }
      }
      .listStyle(.sidebar)
      .safeAreaInset(edge: .bottom) {
        sidebarFooter
      }
    } detail: {
      detailView
    }
    .searchable(text: $searchText, placement: .toolbar, prompt: "搜索标题、来源或平台")
    .onChange(of: searchText) { _, value in
      if !value.isEmpty, selection != .discover {
        selection = .discover
      }
    }
    .onChange(of: selection) { _, _ in
      selectedMediaID = nil
    }
    .toolbar {
      ToolbarItem(placement: .status) {
        connectionStatus
      }
      ToolbarItem(placement: .primaryAction) {
        Button("断开并重新配置") {
          appState.disconnect()
        }
        .help("移除已保存的 NAS 地址")
      }
    }
  }

  @ViewBuilder
  private func navigationRow(_ item: NavigationItem) -> some View {
    Label(item.title, systemImage: item.icon)
      .tag(item)
  }

  @ViewBuilder
  private var detailView: some View {
    if let mediaID = selectedMediaID, let client = appState.apiClient {
      MediaDetailView(client: client, mediaID: mediaID) {
        selectedMediaID = nil
      }
    } else if let client = appState.apiClient {
      switch selection {
      case .dashboard:
        DashboardView(client: client) { selectedMediaID = $0 }
          .id(contentRevision)
      case .discover:
        DiscoverView(client: client, searchText: $searchText) { selectedMediaID = $0 }
          .id(contentRevision)
      case .trending:
        TrendingView(client: client) { selectedMediaID = $0 }
          .id(contentRevision)
      case .preview:
        PreviewView(client: client) { selectedMediaID = $0 }
          .id(contentRevision)
      case .calendar:
        CalendarView(client: client) { selectedMediaID = $0 }
          .id(contentRevision)
      case .sources:
        SourcesView(client: client)
      case .sourceRuns:
        SourceRunsView(client: client)
      case .posterHealth:
        PosterHealthView(client: client)
      case .settings:
        SettingsView(client: client) {
          contentRevision += 1
        }
      case nil:
        ContentUnavailableView("选择一个模块", systemImage: "sidebar.left", description: Text("从左侧边栏开始浏览。"))
      }
    } else {
      ContentUnavailableView("尚未连接 NAS", systemImage: "network.slash", description: Text("返回连接页配置服务地址。"))
    }
  }

  private var connectionStatus: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(appState.connectionState == .connected ? DesignSystem.archiveOlive : DesignSystem.cueRed)
        .frame(width: 7, height: 7)
      Text(appState.connectionState == .connected ? "已连接" : "离线")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private var sidebarFooter: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let profile = appState.profile {
        Text(profile.normalizedAddress)
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      if let lastError = appState.lastError {
        Text(lastError)
          .font(.caption2)
          .foregroundStyle(DesignSystem.cueRed)
          .lineLimit(2)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct FeaturePlaceholderView: View {
  let title: String
  let subtitle: String
  let accent: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(title)
        .font(DesignSystem.sectionTitle)
      Rectangle()
        .fill(accent)
        .frame(width: 52, height: 3)
      ContentUnavailableView("即将接入", systemImage: "film.stack", description: Text(subtitle))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .padding(32)
  }
}
