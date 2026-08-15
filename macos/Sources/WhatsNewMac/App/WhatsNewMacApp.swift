import SwiftUI
import WhatsNewCore

@main
struct WhatsNewMacApp: App {
  @State private var appState = AppState()

  var body: some Scene {
    WindowGroup("WhatsNew") {
      RootView()
        .environment(appState)
        .task {
          await appState.bootstrap()
        }
    }
    .defaultSize(width: 1_180, height: 760)
  }
}

private struct RootView: View {
  @Environment(AppState.self) private var appState

  var body: some View {
    Group {
      if appState.isConnected {
        MainShellView()
      } else {
        ConnectionView()
      }
    }
    .frame(minWidth: 900, minHeight: 620)
  }
}
