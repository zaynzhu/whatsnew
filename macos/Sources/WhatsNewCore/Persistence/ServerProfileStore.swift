import Foundation

/// 仅把最近一次验证成功的 NAS 地址写入 UserDefaults。
public struct ServerProfileStore {
  public static let defaultKey = "whatsnew.nas.address"

  private let defaults: UserDefaults
  private let key: String

  public init(defaults: UserDefaults = .standard, key: String = ServerProfileStore.defaultKey) {
    self.defaults = defaults
    self.key = key
  }

  public func load() -> ServerProfile? {
    guard let address = defaults.string(forKey: key) else {
      return nil
    }
    return ServerProfile(storedAddress: address)
  }

  public func save(_ profile: ServerProfile) {
    defaults.set(profile.normalizedAddress, forKey: key)
  }

  public func remove() {
    defaults.removeObject(forKey: key)
  }
}
