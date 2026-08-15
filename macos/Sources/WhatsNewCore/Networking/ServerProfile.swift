import Foundation

public enum ServerProfileError: Error, LocalizedError, Sendable, Equatable {
  case emptyAddress
  case invalidURL
  case unsupportedScheme
  case missingHost
  case invalidPort
  case credentialsNotAllowed
  case publicHTTPHost

  public var errorDescription: String? {
    switch self {
    case .emptyAddress:
      return "请输入 NAS 地址"
    case .invalidURL:
      return "NAS 地址格式无效"
    case .unsupportedScheme:
      return "只支持 HTTP 或 HTTPS 地址"
    case .missingHost:
      return "NAS 地址缺少主机名"
    case .invalidPort:
      return "NAS 地址端口无效"
    case .credentialsNotAllowed:
      return "NAS 地址不能包含账号或密码"
    case .publicHTTPHost:
      return "HTTP 只允许局域网地址"
    }
  }
}

/// 用户配置的单一 NAS 地址。所有 API URL 都必须从此对象生成。
public struct ServerProfile: Codable, Equatable, Sendable {
  public let inputAddress: String
  public let baseURL: URL

  public var normalizedAddress: String {
    baseURL.absoluteString
  }

  public init(address: String) throws {
    let trimmedAddress = address.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedAddress.isEmpty else {
      throw ServerProfileError.emptyAddress
    }

    guard var components = URLComponents(string: trimmedAddress) else {
      throw ServerProfileError.invalidURL
    }
    guard let scheme = components.scheme?.lowercased() else {
      throw ServerProfileError.unsupportedScheme
    }
    guard scheme == "http" || scheme == "https" else {
      throw ServerProfileError.unsupportedScheme
    }
    guard let host = components.host, !host.isEmpty else {
      throw ServerProfileError.missingHost
    }
    if components.user != nil || components.password != nil {
      throw ServerProfileError.credentialsNotAllowed
    }
    if let port = components.port, !(1...65_535).contains(port) {
      throw ServerProfileError.invalidPort
    }

    components.scheme = scheme
    components.query = nil
    components.fragment = nil
    var path = components.path
    while path.count > 1 && path.hasSuffix("/") {
      path.removeLast()
    }
    if path == "/" {
      path = ""
    }
    components.path = path

    guard let normalizedURL = components.url else {
      throw ServerProfileError.invalidURL
    }
    if scheme == "http" && !Self.isAllowedHTTPHost(host) {
      throw ServerProfileError.publicHTTPHost
    }

    self.inputAddress = trimmedAddress
    self.baseURL = normalizedURL
  }

  public init?(storedAddress: String) {
    guard let profile = try? ServerProfile(address: storedAddress) else {
      return nil
    }
    self = profile
  }

  public func url(path: String, queryItems: [URLQueryItem] = []) -> URL? {
    let url = baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    guard !queryItems.isEmpty else {
      return url
    }
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return nil
    }
    components.queryItems = queryItems
    return components.url
  }

  public static func isAllowedHTTPHost(_ host: String) -> Bool {
    let normalizedHost = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
    if normalizedHost == "localhost" || normalizedHost.hasSuffix(".local") {
      return true
    }
    if normalizedHost.contains(":" ) {
      return isPrivateIPv6(normalizedHost)
    }
    if let octets = ipv4Octets(normalizedHost) {
      return isPrivateIPv4(octets)
    }
    // 无点短主机名由局域网解析，只在可信家庭网络边界内允许 HTTP。
    return !normalizedHost.contains(".") && !normalizedHost.isEmpty
  }

  private static func ipv4Octets(_ host: String) -> [Int]? {
    let pieces = host.split(separator: ".", omittingEmptySubsequences: false)
    guard pieces.count == 4 else {
      return nil
    }
    let octets = pieces.compactMap { Int($0) }
    guard octets.count == 4, octets.allSatisfy({ (0...255).contains($0) }) else {
      return nil
    }
    return octets
  }

  private static func isPrivateIPv4(_ octets: [Int]) -> Bool {
    guard octets.count == 4 else {
      return false
    }
    if octets[0] == 10 || octets[0] == 127 {
      return true
    }
    if octets[0] == 192 && octets[1] == 168 {
      return true
    }
    if octets[0] == 172 && (16...31).contains(octets[1]) {
      return true
    }
    return octets[0] == 169 && octets[1] == 254
  }

  private static func isPrivateIPv6(_ host: String) -> Bool {
    let value = host.lowercased()
    return value == "::1"
      || value.hasPrefix("fe80:")
      || value.hasPrefix("fc")
      || value.hasPrefix("fd")
  }
}
