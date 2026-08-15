import AppKit
import Foundation
import SwiftUI
import WhatsNewCore

/// 统一通过 NAS 的 320/640/960 变体接口加载海报，不直接请求来源原图。
public struct NASPosterView: View {
  public let client: APIClient
  public let mediaID: String
  public let title: String
  public let posterAvailable: Bool
  public let mediaStatus: String
  public let width: PosterWidth

  public init(
    client: APIClient,
    mediaID: String,
    title: String,
    posterAvailable: Bool,
    mediaStatus: String = "",
    width: PosterWidth = .medium
  ) {
    self.client = client
    self.mediaID = mediaID
    self.title = title
    self.posterAvailable = posterAvailable
    self.mediaStatus = mediaStatus
    self.width = width
  }

  public var body: some View {
    Group {
      if posterAvailable, let url = client.posterURL(mediaID: mediaID, width: width) {
        CachedPosterImage(url: url, title: title)
      } else {
        PosterPlaceholder(title: title, label: fallbackLabel, tint: DesignSystem.archiveOlive)
      }
    }
    .aspectRatio(2.0 / 3.0, contentMode: .fit)
    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .strokeBorder(.primary.opacity(0.1), lineWidth: 1)
    }
  }

  private var fallbackLabel: String {
    if !posterAvailable, mediaStatus.lowercased() == "upcoming" {
      return "海报待发布"
    }
    return posterAvailable ? "图片暂不可用" : "暂无海报"
  }
}

private struct CachedPosterImage: View {
  let url: URL
  let title: String
  @State private var image: NSImage?
  @State private var failed = false

  var body: some View {
    Group {
      if let image {
        Image(nsImage: image)
          .resizable()
          .scaledToFill()
      } else if failed {
        PosterPlaceholder(title: title, label: "图片暂不可用", tint: DesignSystem.cueRed)
      } else {
        PosterPlaceholder(title: title, label: "加载海报", tint: DesignSystem.reelBlue, showsProgress: true)
      }
    }
    .task(id: url) {
      image = nil
      failed = false
      do {
        let loaded = try await PosterImagePipeline.shared.image(for: url)
        guard !Task.isCancelled else { return }
        image = loaded.value
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled else { return }
        failed = true
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel)
  }

  private var accessibilityLabel: String {
    if image != nil {
      return "海报：\(title)"
    }
    return failed ? "图片暂不可用：\(title)" : "正在加载海报：\(title)"
  }
}

private final class PosterImageBox: @unchecked Sendable {
  let value: NSImage

  init(_ value: NSImage) {
    self.value = value
  }
}

private actor PosterImagePipeline {
  static let shared = PosterImagePipeline()

  private let memoryCache = NSCache<NSURL, PosterImageBox>()
  private let session: URLSession
  private var inFlight: [URL: Task<PosterImageBox, Error>] = [:]

  private init() {
    let urlCache = URLCache(
      memoryCapacity: 32 * 1_024 * 1_024,
      diskCapacity: 256 * 1_024 * 1_024,
      diskPath: "WhatsNewPosters"
    )
    let configuration = URLSessionConfiguration.default
    configuration.urlCache = urlCache
    configuration.requestCachePolicy = .returnCacheDataElseLoad
    configuration.httpMaximumConnectionsPerHost = 6
    session = URLSession(configuration: configuration)
    memoryCache.countLimit = 240
    memoryCache.totalCostLimit = 64 * 1_024 * 1_024
  }

  func image(for url: URL) async throws -> PosterImageBox {
    if let cached = memoryCache.object(forKey: url as NSURL) {
      return cached
    }
    if let task = inFlight[url] {
      return try await task.value
    }

    let session = session
    let task = Task<PosterImageBox, Error> {
      var request = URLRequest(url: url)
      request.timeoutInterval = 20
      request.cachePolicy = .returnCacheDataElseLoad
      let (data, response) = try await session.data(for: request)
      guard let response = response as? HTTPURLResponse,
            (200...299).contains(response.statusCode),
            let image = NSImage(data: data) else {
        throw URLError(.cannotDecodeContentData)
      }
      return PosterImageBox(image)
    }
    inFlight[url] = task
    defer { inFlight[url] = nil }

    let loaded = try await task.value
    let pixelCost = Int(loaded.value.size.width * loaded.value.size.height * 4)
    memoryCache.setObject(loaded, forKey: url as NSURL, cost: max(pixelCost, 1))
    return loaded
  }
}

private struct PosterPlaceholder: View {
  let title: String
  let label: String
  let tint: Color
  var showsProgress = false

  var body: some View {
    ZStack {
      Rectangle()
        .fill(tint.opacity(0.12))
      VStack(spacing: 8) {
        if showsProgress {
          ProgressView()
            .controlSize(.small)
        } else {
          Image(systemName: "photo")
            .font(.title2)
            .foregroundStyle(tint)
        }
        Text(label)
          .font(.caption2)
          .foregroundStyle(tint)
          .multilineTextAlignment(.center)
        Text(title)
          .font(.caption.weight(.medium))
          .foregroundStyle(.primary.opacity(0.75))
          .lineLimit(2)
          .multilineTextAlignment(.center)
      }
      .padding(10)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(label)：\(title)")
  }
}
