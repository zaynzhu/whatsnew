import Foundation
import Testing
@testable import WhatsNewCore

private final class MockURLProtocol: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool {
    true
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    guard let handler = Self.handler else {
      client?.urlProtocol(self, didFailWithError: URLError(.unknown))
      return
    }
    do {
      let (response, data) = try handler(request)
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

@Suite("API 客户端", .serialized)
struct APIClientTests {
  @Test("健康检查验证服务身份")
  func healthChecksServiceIdentity() async throws {
    let client = try makeClient { request in
      #expect(request.url?.absoluteString == "http://nas:19992/api/health")
      return try response(
        request: request,
        status: 200,
        json: #"{"ok":true,"service":"whatsnew-backend","environment":"main"}"#
      )
    }

    let health = try await client.checkHealth()

    #expect(health.service == "whatsnew-backend")
    MockURLProtocol.handler = nil
  }

  @Test("健康检查拒绝其他服务")
  func healthRejectsAnotherService() async throws {
    let client = try makeClient { request in
      try response(request: request, status: 200, json: #"{"ok":true,"service":"other"}"#)
    }

    do {
      _ = try await client.checkHealth()
      Issue.record("应拒绝非 WhatsNew 服务")
    } catch let error as APIError {
      #expect(error.errorDescription == "未识别的服务（other）")
    }
    MockURLProtocol.handler = nil
  }

  @Test("服务端错误只映射错误代码")
  func mapsServerErrorCode() async throws {
    let client = try makeClient { request in
      try response(request: request, status: 409, json: #"{"error":"source_disabled"}"#)
    }

    do {
      let _: EmptyResponse = try await client.post("/api/sources/douban/sync")
      Issue.record("应抛出 HTTP 错误")
    } catch let error as APIError {
      #expect(error.serverCode == "source_disabled")
      #expect(error.errorDescription == "服务请求失败（source_disabled）")
    }
    MockURLProtocol.handler = nil
  }

  @Test("PUT 以 JSON 编码设置请求")
  func encodesPutBodyAsJSON() async throws {
    let client = try makeClient { request in
      #expect(request.httpMethod == "PUT")
      #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
      let body = try bodyData(from: request)
      let object = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
      #expect((object["values"] as? [String: String])?["SCHEDULER_DAILY_TIME"] == "09:30")
      #expect((object["clearKeys"] as? [String]) == [])
      return try response(
        request: request,
        status: 200,
        json: #"{"success":true,"effectiveImmediately":true}"#
      )
    }

    let result = try await client.updateSettings(
      SettingsUpdateRequest(values: ["SCHEDULER_DAILY_TIME": "09:30"])
    )

    #expect(result.success)
    MockURLProtocol.handler = nil
  }

  @Test("代理测试只编码本次明确提供的值")
  func proxyTestOnlyEncodesProvidedValues() async throws {
    let client = try makeClient { request in
      #expect(request.url?.path == "/api/settings/proxy/test")
      #expect(request.httpMethod == "POST")
      let body = try bodyData(from: request)
      let object = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
      #expect(object == ["HTTPS_PROXY": "http://127.0.0.1:7890"])
      return try response(request: request, status: 200, json: #"{"items":[]}"#)
    }

    _ = try await client.testProxy(httpsProxy: "http://127.0.0.1:7890")
    MockURLProtocol.handler = nil
  }

  @Test("空响应只允许 EmptyResponse")
  func acceptsEmptyResponseType() async throws {
    let client = try makeClient { request in
      try response(request: request, status: 204, json: "")
    }

    let _: EmptyResponse = try await client.post("/api/test")
    MockURLProtocol.handler = nil
  }

  @Test("内容浏览端点使用服务端约定的筛选参数")
  func contentEndpointsUseContractQueries() async throws {
    let client = try makeClient { request in
      let url = try #require(request.url)
      let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
      let values = Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })

      switch url.path {
      case "/api/dashboard":
        return try response(request: request, status: 200, json: #"{"today":[],"week":[],"featured":[],"trending":[],"events":[],"sources":[]}"#)
      case "/api/media":
        #expect(values["q"] == "三体")
        #expect(values["releaseForm"] == "streaming_movie")
        #expect(values["status"] == "ongoing")
        return try response(request: request, status: 200, json: #"{"items":[],"nextCursor":null}"#)
      case "/api/trending":
        #expect(values["region"] == "GLOBAL")
        #expect(values["window"] == "week")
        #expect(values["movement"] == "rising")
        return try response(request: request, status: 200, json: #"{"items":[]}"#)
      case "/api/calendar":
        #expect(values["summary"] == "true")
        #expect(values["mediaType"] == "documentary")
        return try response(request: request, status: 200, json: #"{"items":[],"days":[]}"#)
      case "/api/preview":
        return try response(
          request: request,
          status: 200,
          json: #"{"generatedAt":"2026-08-15T00:00:00Z","today":"2026-08-15","source":{"enabled":true,"runnable":true,"syncing":false,"latestRun":null,"lastSuccessAt":null},"summary":{"total":0,"movies":0,"series":0,"undated":0,"hot":0},"days":[],"undated":[]}"#
        )
      case "/api/preview/sync":
        #expect(request.httpMethod == "POST")
        return try response(request: request, status: 200, json: #"{"syncing":false,"run":null}"#)
      default:
        Issue.record("收到未预期端点：\(url.path)")
        return try response(request: request, status: 404, json: #"{"error":"not_found"}"#)
      }
    }

    _ = try await client.dashboard()
    _ = try await client.mediaList(query: "三体", releaseForm: "streaming_movie", status: "ongoing")
    _ = try await client.trending(region: "GLOBAL", window: "week", movement: .rising)
    _ = try await client.calendar(summary: true, mediaType: "documentary")
    _ = try await client.preview()
    _ = try await client.syncPreview()
    MockURLProtocol.handler = nil
  }

  @Test("控制中心端点使用安全来源路径和筛选参数")
  func controlCenterEndpointsUseSafePathsAndQueries() async throws {
    let client = try makeClient { request in
      let url = try #require(request.url)
      let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
      let values = Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })

      switch url.path {
      case "/api/source-runs":
        #expect(values["source"] == "tmdb")
        #expect(values["status"] == "failed")
        #expect(values["limit"] == "200")
        return try response(
          request: request,
          status: 200,
          json: #"{"generatedAt":"2026-08-15T00:00:00Z","sources":[],"items":[]}"#
        )
      case "/api/sources/tmdb/test":
        #expect(request.httpMethod == "POST")
        return try response(
          request: request,
          status: 200,
          json: #"{"sourceId":"tmdb","implementationStatus":"active","result":{"mode":"direct","success":true,"durationMs":10,"statusCode":200,"errorType":null,"message":"ok"}}"#
        )
      case "/api/sources/tmdb/preview":
        #expect(request.httpMethod == "POST")
        return try response(
          request: request,
          status: 200,
          json: #"{"sourceId":"tmdb","itemCount":0,"withPoster":0,"mediaTypes":{},"releasePatterns":{},"releaseDateStart":null,"releaseDateEnd":null,"scopes":[],"samples":[],"fetchedAt":"2026-08-15T00:00:00Z","persisted":false}"#
        )
      case "/api/sources/tmdb/sync":
        #expect(request.httpMethod == "POST")
        return try response(request: request, status: 200, json: #"{"items":[]}"#)
      default:
        Issue.record("收到未预期端点：\(url.path)")
        return try response(request: request, status: 404, json: #"{"error":"not_found"}"#)
      }
    }

    _ = try await client.sourceRuns(source: "tmdb", status: "failed", limit: 999)
    _ = try await client.testSource(source: "tmdb")
    _ = try await client.previewSource(source: "tmdb")
    _ = try await client.syncSource(source: "tmdb")

    do {
      _ = try await client.syncSource(source: "../tmdb")
      Issue.record("应拒绝不安全的来源路径")
    } catch let error as APIError {
      guard case .invalidURL = error else {
        Issue.record("应返回 invalidURL")
        MockURLProtocol.handler = nil
        return
      }
    }
    MockURLProtocol.handler = nil
  }

  private func makeClient(
    handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
  ) throws -> APIClient {
    MockURLProtocol.handler = handler
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockURLProtocol.self]
    let session = URLSession(configuration: configuration)
    return APIClient(
      profile: try ServerProfile(address: "http://nas:19992"),
      session: session
    )
  }

  private func response(
    request: URLRequest,
    status: Int,
    json: String
  ) throws -> (HTTPURLResponse, Data) {
    let url = try #require(request.url)
    let response = try #require(
      HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)
    )
    return (response, Data(json.utf8))
  }

  private func bodyData(from request: URLRequest) throws -> Data {
    if let body = request.httpBody {
      return body
    }
    let stream = try #require(request.httpBodyStream)
    stream.open()
    defer {
      stream.close()
    }
    var output = Data()
    var buffer = [UInt8](repeating: 0, count: 1_024)
    while stream.hasBytesAvailable {
      let count = stream.read(&buffer, maxLength: buffer.count)
      if count < 0 {
        throw stream.streamError ?? URLError(.cannotDecodeContentData)
      }
      if count == 0 {
        break
      }
      output.append(buffer, count: count)
    }
    return output
  }
}
