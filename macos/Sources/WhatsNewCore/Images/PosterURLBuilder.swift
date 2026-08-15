import Foundation

public enum PosterWidth: Int, CaseIterable, Sendable {
  case small = 320
  case medium = 640
  case large = 960
}

public enum PosterURLBuilder {
  public static func url(
    profile: ServerProfile,
    mediaID: String,
    width: PosterWidth = .medium
  ) -> URL? {
    guard !mediaID.isEmpty else {
      return nil
    }
    let allowedCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
    guard mediaID.unicodeScalars.allSatisfy({ allowedCharacters.contains($0) }) else {
      return nil
    }
    return profile.url(
      path: "/api/media/\(mediaID)/poster",
      queryItems: [URLQueryItem(name: "width", value: String(width.rawValue))]
    )
  }
}

public extension APIClient {
  func posterURL(mediaID: String, width: PosterWidth = .medium) -> URL? {
    PosterURLBuilder.url(profile: profile, mediaID: mediaID, width: width)
  }
}
