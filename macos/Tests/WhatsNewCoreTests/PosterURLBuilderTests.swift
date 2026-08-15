import Testing
@testable import WhatsNewCore

@Suite("海报代理 URL")
struct PosterURLBuilderTests {
  @Test("只构造响应式 NAS 海报地址")
  func buildsResponsiveNASPosterURLs() throws {
    let profile = try ServerProfile(address: "http://nas:19992")

    #expect(
      PosterURLBuilder.url(profile: profile, mediaID: "media-1", width: .small)?.absoluteString
        == "http://nas:19992/api/media/media-1/poster?width=320"
    )
    #expect(
      PosterURLBuilder.url(profile: profile, mediaID: "media-1", width: .large)?.absoluteString
        == "http://nas:19992/api/media/media-1/poster?width=960"
    )
  }

  @Test("拒绝不安全的作品 ID")
  func rejectsUnsafeMediaIdentifiers() throws {
    let profile = try ServerProfile(address: "http://nas:19992")

    #expect(PosterURLBuilder.url(profile: profile, mediaID: "") == nil)
    #expect(PosterURLBuilder.url(profile: profile, mediaID: "../settings") == nil)
    #expect(PosterURLBuilder.url(profile: profile, mediaID: "id/other") == nil)
  }
}
