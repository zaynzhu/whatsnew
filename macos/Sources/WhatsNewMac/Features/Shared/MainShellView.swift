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
    VStack(spacing: 0) {
      topNavigation
      Divider()
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

  private var topNavigation: some View {
    HStack(spacing: 24) {
      HStack(spacing: 10) {
        ZStack {
          RoundedRectangle(cornerRadius: 9, style: .continuous)
            .fill(DesignSystem.cueRed)
          Image(systemName: "play.rectangle.fill")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
        }
        .frame(width: 34, height: 34)

        VStack(alignment: .leading, spacing: 0) {
          Text("WhatsNew")
            .font(.headline.weight(.semibold))
          Text("影视情报站")
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
      }

      HStack(spacing: 4) {
        ForEach(primaryItems) { item in
          navigationButton(item)
        }
      }

      Spacer(minLength: 12)

      Menu {
        Section("控制中心") {
          menuButton(.sources)
          menuButton(.sourceRuns)
          menuButton(.posterHealth)
        }
        Divider()
        menuButton(.settings)
      } label: {
        HStack(spacing: 7) {
          Image(systemName: selectedUtilityItem?.icon ?? "slider.horizontal.3")
          Text(selectedUtilityItem?.title ?? "管理")
          Image(systemName: "chevron.down")
            .font(.caption2.weight(.bold))
        }
        .font(.callout.weight(.medium))
        .foregroundStyle(selectedUtilityItem == nil ? Color.primary : DesignSystem.reelBlue)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.primary.opacity(selectedUtilityItem == nil ? 0.05 : 0.09), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
      }
      .menuStyle(.borderlessButton)
      .fixedSize()
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 10)
    .background(.ultraThinMaterial)
  }

  private var primaryItems: [NavigationItem] {
    [.dashboard, .discover, .trending, .preview, .calendar]
  }

  private var selectedUtilityItem: NavigationItem? {
    guard let selection, !primaryItems.contains(selection) else { return nil }
    return selection
  }

  private func navigationButton(_ item: NavigationItem) -> some View {
    Button {
      withAnimation(.easeOut(duration: 0.18)) {
        selection = item
      }
    } label: {
      Label(item.title, systemImage: item.icon)
        .font(.callout.weight(selection == item ? .semibold : .medium))
        .foregroundStyle(selection == item ? DesignSystem.reelBlue : Color.secondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background {
          RoundedRectangle(cornerRadius: 9, style: .continuous)
            .fill(selection == item ? DesignSystem.reelBlue.opacity(0.12) : .clear)
        }
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selection == item ? .isSelected : [])
  }

  private func menuButton(_ item: NavigationItem) -> some View {
    Button {
      selection = item
    } label: {
      Label(item.title, systemImage: item.icon)
    }
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
        ContentUnavailableView("选择一个模块", systemImage: "rectangle.topthird.inset.filled", description: Text("从顶部导航开始浏览。"))
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

}
