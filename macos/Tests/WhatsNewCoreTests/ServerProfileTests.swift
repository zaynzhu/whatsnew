import Foundation
import Testing
@testable import WhatsNewCore

@Suite("NAS 地址")
struct ServerProfileTests {
  @Test("规范化私有 IPv4 地址")
  func normalizesPrivateIPv4Address() throws {
    let profile = try ServerProfile(address: "  HTTP://192.168.50.20:19992///  ")

    #expect(profile.normalizedAddress == "http://192.168.50.20:19992")
  }

  @Test("允许常见局域网主机形式")
  func allowsLocalNetworkHostForms() throws {
    _ = try ServerProfile(address: "http://nas:19992")
    _ = try ServerProfile(address: "http://whatsnew.local:19992")
    _ = try ServerProfile(address: "http://127.0.0.1:19992")
    _ = try ServerProfile(address: "http://[fd12::1]:19992")
  }

  @Test("公开主机只允许 HTTPS")
  func allowsPublicHostOnlyWithHTTPS() throws {
    do {
      _ = try ServerProfile(address: "http://example.com")
      Issue.record("应拒绝公开 HTTP 主机")
    } catch {
      #expect(error as? ServerProfileError == .publicHTTPHost)
    }
    _ = try ServerProfile(address: "https://example.com")
  }

  @Test("拒绝凭据和不支持的 scheme")
  func rejectsCredentialsAndUnsupportedSchemes() throws {
    do {
      _ = try ServerProfile(address: "http://user:password@nas:19992")
      Issue.record("应拒绝地址中的凭据")
    } catch {
      #expect(error as? ServerProfileError == .credentialsNotAllowed)
    }
    do {
      _ = try ServerProfile(address: "ftp://nas:19992")
      Issue.record("应拒绝 FTP")
    } catch {
      #expect(error as? ServerProfileError == .unsupportedScheme)
    }
  }

  @Test("删除 query 和 fragment 并构造 API URL")
  func removesQueryAndFragmentAndBuildsAPIURL() throws {
    let profile = try ServerProfile(address: "https://example.com/base/?token=secret#fragment")
    let url = profile.url(
      path: "/api/media",
      queryItems: [URLQueryItem(name: "q", value: "三体")]
    )

    #expect(profile.normalizedAddress == "https://example.com/base")
    #expect(url?.absoluteString == "https://example.com/base/api/media?q=%E4%B8%89%E4%BD%93")
  }
}
