import Foundation
import Observation
import WhatsNewCore

public enum ConnectionState: Equatable, Sendable {
  case disconnected
  case connecting
  case connected
  case failed(String)
}

@MainActor
@Observable
public final class AppState {
  public private(set) var profile: ServerProfile?
  public private(set) var apiClient: APIClient?
  public private(set) var health: HealthResponse?
  public private(set) var connectionState: ConnectionState = .disconnected
  public var addressDraft: String
  public private(set) var lastError: String?

  private let profileStore: ServerProfileStore

  public init(profileStore: ServerProfileStore = ServerProfileStore()) {
    self.profileStore = profileStore
    let storedProfile = profileStore.load()
    self.profile = storedProfile
    self.addressDraft = storedProfile?.normalizedAddress ?? ""
    if let storedProfile {
      self.apiClient = APIClient(profile: storedProfile)
      self.connectionState = .connected
    }
  }

  public var isConnected: Bool {
    profile != nil && apiClient != nil
  }

  public func bootstrap() async {
    guard let apiClient else {
      return
    }
    do {
      health = try await apiClient.checkHealth()
      connectionState = .connected
      lastError = nil
    } catch {
      connectionState = .failed(Self.message(for: error))
      lastError = Self.message(for: error)
    }
  }

  public func connect() async {
    let previousProfile = profile
    let previousClient = apiClient
    connectionState = .connecting
    lastError = nil

    do {
      let newProfile = try ServerProfile(address: addressDraft)
      let newClient = APIClient(profile: newProfile)
      let verifiedHealth = try await newClient.checkHealth()
      profileStore.save(newProfile)
      profile = newProfile
      apiClient = newClient
      health = verifiedHealth
      addressDraft = newProfile.normalizedAddress
      connectionState = .connected
    } catch {
      profile = previousProfile
      apiClient = previousClient
      connectionState = .failed(Self.message(for: error))
      lastError = Self.message(for: error)
    }
  }

  public func disconnect() {
    profileStore.remove()
    profile = nil
    apiClient = nil
    health = nil
    addressDraft = ""
    connectionState = .disconnected
    lastError = nil
  }

  public func refreshConnection() async {
    guard let apiClient else {
      return
    }
    connectionState = .connecting
    do {
      health = try await apiClient.checkHealth()
      connectionState = .connected
      lastError = nil
    } catch {
      connectionState = .failed(Self.message(for: error))
      lastError = Self.message(for: error)
    }
  }

  private static func message(for error: Error) -> String {
    if let localized = error as? LocalizedError, let description = localized.errorDescription {
      return description
    }
    return "无法连接 NAS 服务"
  }
}
