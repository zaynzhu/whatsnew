import Foundation

public enum APIError: Error, LocalizedError {
  case invalidURL
  case invalidResponse
  case transport(Error)
  case encoding(Error)
  case timeout
  case offline
  case httpStatus(status: Int, code: String?, message: String?)
  case emptyResponse
  case decoding(Error)
  case crossHostRedirect
  case invalidHealth(ok: Bool, service: String?)

  public var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "请求地址无效"
    case .invalidResponse:
      return "服务器响应无效"
    case .transport:
      return "无法连接 NAS 服务"
    case .encoding:
      return "请求数据无法编码"
    case .timeout:
      return "连接 NAS 服务超时"
    case .offline:
      return "当前网络不可用"
    case let .httpStatus(status, code, message):
      if let message, !message.isEmpty {
        return message
      }
      if let code, !code.isEmpty {
        return "服务请求失败（\(code)）"
      }
      return "服务请求失败（HTTP \(status)）"
    case .emptyResponse:
      return "服务器返回空响应"
    case .decoding:
      return "服务器数据格式无法识别"
    case .crossHostRedirect:
      return "服务重定向到了未配置的地址"
    case let .invalidHealth(ok, service):
      if !ok {
        return "NAS 健康检查未通过"
      }
      return "未识别的服务（\(service ?? "未知")）"
    }
  }

  public var serverCode: String? {
    guard case let .httpStatus(_, code, _) = self else {
      return nil
    }
    return code
  }
}

private final class RedirectGuardDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let baseURL: URL
  private let lock = NSLock()
  private var rejected = false

  init(baseURL: URL) {
    self.baseURL = baseURL
  }

  var wasRejected: Bool {
    lock.lock()
    defer { lock.unlock() }
    return rejected
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let url = request.url, Self.sameServer(url, as: baseURL) else {
      lock.lock()
      rejected = true
      lock.unlock()
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }

  private static func sameServer(_ left: URL, as right: URL) -> Bool {
    left.scheme?.lowercased() == right.scheme?.lowercased()
      && left.host?.lowercased() == right.host?.lowercased()
      && left.portOrDefault == right.portOrDefault
  }
}

private extension URL {
  var portOrDefault: Int? {
    if let port {
      return port
    }
    guard let scheme = scheme?.lowercased() else {
      return nil
    }
    return scheme == "https" ? 443 : 80
  }
}

/// 统一负责 NAS API 的 URL 构造、JSON 编解码和错误映射。
public final class APIClient: @unchecked Sendable {
  public let profile: ServerProfile

  private let session: URLSession
  private let encoder: JSONEncoder
  private let decoder: JSONDecoder
  private let timeout: TimeInterval

  public init(
    profile: ServerProfile,
    session: URLSession = .shared,
    encoder: JSONEncoder = JSONEncoder(),
    decoder: JSONDecoder = JSONDecoder(),
    timeout: TimeInterval = 30
  ) {
    self.profile = profile
    self.session = session
    self.encoder = encoder
    self.decoder = decoder
    self.timeout = timeout
  }

  public func get<Response: Decodable>(
    _ path: String,
    queryItems: [URLQueryItem] = []
  ) async throws -> Response {
    try await request(.get, path: path, queryItems: queryItems)
  }

  public func post<Response: Decodable>(
    _ path: String,
    queryItems: [URLQueryItem] = [],
    bodyData: Data? = nil
  ) async throws -> Response {
    try await request(.post, path: path, queryItems: queryItems, bodyData: bodyData)
  }

  public func post<Response: Decodable, Body: Encodable>(
    _ path: String,
    queryItems: [URLQueryItem] = [],
    body: Body
  ) async throws -> Response {
    let bodyData = try encode(body)
    return try await post(path, queryItems: queryItems, bodyData: bodyData)
  }

  public func put<Response: Decodable, Body: Encodable>(
    _ path: String,
    queryItems: [URLQueryItem] = [],
    body: Body
  ) async throws -> Response {
    let bodyData = try encode(body)
    return try await request(.put, path: path, queryItems: queryItems, bodyData: bodyData)
  }

  public func put<Response: Decodable>(
    _ path: String,
    queryItems: [URLQueryItem] = [],
    bodyData: Data? = nil
  ) async throws -> Response {
    try await request(.put, path: path, queryItems: queryItems, bodyData: bodyData)
  }

  public func checkHealth() async throws -> HealthResponse {
    let response: HealthResponse = try await get("/api/health")
    guard response.ok, response.service == "whatsnew-backend" else {
      throw APIError.invalidHealth(ok: response.ok, service: response.service)
    }
    return response
  }

  // MARK: - 内容浏览端点

  /// 获取情报台首页数据。
  public func dashboard() async throws -> DashboardResponse {
    try await get("/api/dashboard")
  }

  /// 获取发现列表。搜索会同时匹配作品标题、来源和平台。
  public func mediaList(
    query: String? = nil,
    mediaType: String? = nil,
    releaseForm: String? = nil,
    status: String? = nil,
    sort: String = "heat",
    limit: Int = 50
  ) async throws -> MediaListResponse {
    try await get(
      "/api/media",
      queryItems: queryItems(
        ("q", query),
        ("mediaType", mediaType),
        ("releaseForm", releaseForm),
        ("status", status),
        ("sort", sort),
        ("limit", String(max(1, min(limit, 100))))
      )
    )
  }

  /// 获取作品详情及其当前发行、热度、来源引用和事件。
  public func mediaDetail(mediaID: String) async throws -> MediaDetailResponse {
    guard Self.isSafePathComponent(mediaID) else {
      throw APIError.invalidURL
    }
    return try await get("/api/media/\(mediaID)")
  }

  /// 获取作品最近一段时间的热度历史。
  public func popularityHistory(
    mediaID: String,
    source: String? = nil,
    days: Int = 30,
    limit: Int = 300
  ) async throws -> PopularityHistoryResponse {
    guard Self.isSafePathComponent(mediaID) else {
      throw APIError.invalidURL
    }
    return try await get(
      "/api/media/\(mediaID)/popularity-history",
      queryItems: queryItems(
        ("source", source),
        ("days", String(max(1, min(days, 90)))),
        ("limit", String(max(1, min(limit, 1_000))))
      )
    )
  }

  /// 获取当前热度信号。没有信号筛选时服务端按作品 Heat 聚合返回全部当前信号。
  public func trending(
    source: String? = nil,
    platform: String? = nil,
    region: String? = nil,
    mediaType: String? = nil,
    releaseForm: String? = nil,
    window: String? = nil,
    rankingScope: String? = nil,
    movement: PopularityMovement? = nil
  ) async throws -> TrendingResponse {
    try await get(
      "/api/trending",
      queryItems: queryItems(
        ("source", source),
        ("platform", platform),
        ("region", region),
        ("mediaType", mediaType),
        ("releaseForm", releaseForm),
        ("window", window),
        ("rankingScope", rankingScope),
        ("movement", movement?.rawValue)
      )
    )
  }

  /// 获取日历月摘要或某一天的完整排期。
  public func calendar(
    from: String? = nil,
    to: String? = nil,
    summary: Bool = false,
    platform: String? = nil,
    region: String? = nil,
    mediaType: String? = nil,
    releaseForm: String? = nil
  ) async throws -> CalendarResponse {
    try await get(
      "/api/calendar",
      queryItems: queryItems(
        ("from", from),
        ("to", to),
        ("summary", summary ? "true" : nil),
        ("platform", platform),
        ("region", region),
        ("mediaType", mediaType),
        ("releaseForm", releaseForm)
      )
    )
  }

  /// 获取豆瓣前瞻时间线。
  public func preview() async throws -> PreviewResponse {
    try await get("/api/preview")
  }

  /// 请求豆瓣前瞻同步。同步由 NAS 后端执行，Mac 客户端不会启动 scheduler。
  public func syncPreview() async throws -> PreviewSyncResponse {
    try await post("/api/preview/sync", bodyData: nil)
  }

  // MARK: - 控制中心端点

  /// 获取来源目录以及每个来源的最新运行摘要。
  public func sources() async throws -> SourcesResponse {
    try await get("/api/sources")
  }

  /// 获取按 scope 聚合的来源健康状态。
  public func sourceHealth() async throws -> SourceHealthResponse {
    try await get("/api/source-health")
  }

  /// 获取来源同步记录，可按来源、状态和数量筛选。
  public func sourceRuns(
    source: String? = nil,
    status: String? = nil,
    limit: Int = 100
  ) async throws -> SourceRunLogsResponse {
    try await get(
      "/api/source-runs",
      queryItems: queryItems(
        ("source", source),
        ("status", status),
        ("limit", String(max(1, min(limit, 200))))
      )
    )
  }

  /// 获取图片覆盖率、质量、队列和缓存健康信息。
  public func posterHealth() async throws -> PosterHealthResponse {
    try await get("/api/poster-health")
  }

  /// 测试单个来源的连接，不会写入来源数据。
  public func testSource(source: String) async throws -> SourceTestResponse {
    guard Self.isSafePathComponent(source) else {
      throw APIError.invalidURL
    }
    return try await post("/api/sources/\(source)/test", bodyData: nil)
  }

  /// 读取单个来源的只读采集预览，服务端响应中的 persisted 必须保持 false。
  public func previewSource(source: String) async throws -> SourcePreviewResponse {
    guard Self.isSafePathComponent(source) else {
      throw APIError.invalidURL
    }
    return try await post("/api/sources/\(source)/preview", bodyData: nil)
  }

  /// 请求单个来源同步；实际写入由 NAS 服务端执行。
  public func syncSource(source: String) async throws -> SourceSyncResponse {
    guard Self.isSafePathComponent(source) else {
      throw APIError.invalidURL
    }
    return try await post("/api/sources/\(source)/sync", bodyData: nil)
  }

  // MARK: - 设置端点

  /// 获取代理、内容权重、调度和来源设置视图。
  public func settings() async throws -> SettingsResponse {
    try await get("/api/settings")
  }

  /// 原子更新用户明确修改的配置，并返回服务端是否立即生效。
  public func updateSettings(_ request: SettingsUpdateRequest) async throws -> SettingsUpdateResponse {
    try await put("/api/settings", body: request)
  }

  /// 使用本次请求中明确提供的代理值测试直连、HTTP 和 HTTPS 路径。
  public func testProxy(
    httpProxy: String? = nil,
    httpsProxy: String? = nil
  ) async throws -> ProxyTestResponse {
    struct ProxyTestRequest: Encodable {
      let HTTP_PROXY: String?
      let HTTPS_PROXY: String?

      enum CodingKeys: String, CodingKey {
        case HTTP_PROXY
        case HTTPS_PROXY
      }

      func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let HTTP_PROXY {
          try container.encode(HTTP_PROXY, forKey: .HTTP_PROXY)
        }
        if let HTTPS_PROXY {
          try container.encode(HTTPS_PROXY, forKey: .HTTPS_PROXY)
        }
      }
    }

    return try await post(
      "/api/settings/proxy/test",
      body: ProxyTestRequest(HTTP_PROXY: httpProxy, HTTPS_PROXY: httpsProxy)
    )
  }

  private enum Method: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
  }

  private func queryItems(_ values: (String, String?)...) -> [URLQueryItem] {
    values.compactMap { key, value in
      guard let value, !value.isEmpty else {
        return nil
      }
      return URLQueryItem(name: key, value: value)
    }
  }

  private static func isSafePathComponent(_ value: String) -> Bool {
    guard !value.isEmpty else {
      return false
    }
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
    return value.unicodeScalars.allSatisfy { allowed.contains($0) }
  }

  private func encode<Body: Encodable>(_ body: Body) throws -> Data {
    do {
      return try encoder.encode(body)
    } catch {
      throw APIError.encoding(error)
    }
  }

  private func request<Response: Decodable>(
    _ method: Method,
    path: String,
    queryItems: [URLQueryItem],
    bodyData: Data? = nil
  ) async throws -> Response {
    guard let url = profile.url(path: path, queryItems: queryItems) else {
      throw APIError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = method.rawValue
    request.timeoutInterval = timeout
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if method != .get {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = bodyData
    }

    let redirectDelegate = RedirectGuardDelegate(baseURL: profile.baseURL)
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await session.data(for: request, delegate: redirectDelegate)
    } catch {
      if redirectDelegate.wasRejected {
        throw APIError.crossHostRedirect
      }
      throw mapTransportError(error)
    }
    if redirectDelegate.wasRejected {
      throw APIError.crossHostRedirect
    }
    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIError.invalidResponse
    }
    guard Self.sameServer(httpResponse.url, as: profile.baseURL) else {
      throw APIError.crossHostRedirect
    }

    guard (200...299).contains(httpResponse.statusCode) else {
      throw makeHTTPError(statusCode: httpResponse.statusCode, data: data)
    }
    guard !data.isEmpty else {
      guard Response.self == EmptyResponse.self else {
        throw APIError.emptyResponse
      }
      return EmptyResponse() as! Response
    }
    do {
      return try decoder.decode(Response.self, from: data)
    } catch {
      throw APIError.decoding(error)
    }
  }

  private func makeHTTPError(statusCode: Int, data: Data) -> APIError {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return .httpStatus(status: statusCode, code: nil, message: nil)
    }
    let code = object["error"] as? String
    let message = object["message"] as? String
    return .httpStatus(status: statusCode, code: code, message: message)
  }

  private func mapTransportError(_ error: Error) -> APIError {
    let nsError = error as NSError
    guard nsError.domain == NSURLErrorDomain else {
      return .transport(error)
    }
    switch nsError.code {
    case NSURLErrorTimedOut:
      return .timeout
    case NSURLErrorNotConnectedToInternet,
      NSURLErrorNetworkConnectionLost,
      NSURLErrorCannotConnectToHost,
      NSURLErrorCannotFindHost:
      return .offline
    default:
      return .transport(error)
    }
  }

  private static func sameServer(_ left: URL?, as right: URL) -> Bool {
    guard let left else {
      return false
    }
    return left.scheme?.lowercased() == right.scheme?.lowercased()
      && left.host?.lowercased() == right.host?.lowercased()
      && left.portOrDefault == right.portOrDefault
  }
}
