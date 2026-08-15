import Foundation
import Testing
@testable import WhatsNewCore

@Suite("NAS 地址持久化")
struct ServerProfileStoreTests {
  @Test("保存、读取和移除已验证地址")
  func savesLoadsAndRemovesProfileAddress() throws {
    let suiteName = "WhatsNewCoreTests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suiteName))
    defer {
      defaults.removePersistentDomain(forName: suiteName)
    }
    let store = ServerProfileStore(defaults: defaults)
    let profile = try ServerProfile(address: "http://nas:19992/")

    #expect(store.load() == nil)
    store.save(profile)
    #expect(store.load()?.normalizedAddress == "http://nas:19992")
    store.remove()
    #expect(store.load() == nil)
  }
}
