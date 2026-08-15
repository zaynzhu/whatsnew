import Foundation
import Testing
@testable import WhatsNewCore

@Suite("当前服务只读契约")
struct LiveAPIContractTests {
  @Test("全部读取接口可由 Swift 模型解码")
  func decodesCurrentReadEndpoints() async throws {
    guard let address = ProcessInfo.processInfo.environment["WHATSNEW_LIVE_BASE_URL"] else {
      return
    }
    let client = APIClient(profile: try ServerProfile(address: address))

    _ = try await client.checkHealth()
    let _: DashboardResponse = try await client.get("/api/dashboard")
    let media: MediaListResponse = try await client.get(
      "/api/media",
      queryItems: [URLQueryItem(name: "limit", value: "1")]
    )
    let _: TrendingResponse = try await client.get("/api/trending")
    let _: CalendarResponse = try await client.get("/api/calendar")
    let _: PreviewResponse = try await client.get("/api/preview")
    let _: SourcesResponse = try await client.get("/api/sources")
    let _: SourceHealthResponse = try await client.get("/api/source-health")
    let _: SourceRunLogsResponse = try await client.get(
      "/api/source-runs",
      queryItems: [URLQueryItem(name: "limit", value: "1")]
    )
    let _: PosterHealthResponse = try await client.get("/api/poster-health")
    let _: SettingsResponse = try await client.get("/api/settings")

    if let id = media.items.first?.id {
      let _: MediaDetailResponse = try await client.get("/api/media/\(id)")
      let _: PopularityHistoryResponse = try await client.get(
        "/api/media/\(id)/popularity-history",
        queryItems: [URLQueryItem(name: "days", value: "30")]
      )
    }
  }
}
