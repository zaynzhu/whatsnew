import Foundation

// MARK: - 基础媒体模型

public struct MediaItem: Codable, Identifiable, Sendable {
  public let id: String
  public let mediaType: String
  public let releaseForm: String
  public let sourceContentType: String?
  public let titleDisplay: String
  public let titleChinese: String?
  public let titleOriginal: String?
  public let titleAliases: String?
  public let overview: String?
  public let posterUrl: String?
  public let posterLookupAttemptedAt: String?
  public let posterStatus: String?
  public let posterCheckedAt: String?
  public let posterFailureCount: Int?
  public let posterFailureReason: String?
  public let posterWidth: Int?
  public let posterHeight: Int?
  public let posterQuality: String?
  public let productionCountries: String?
  public let originalLanguage: String?
  public let genres: String?
  public let firstReleaseDate: String?
  public let status: String
  public let heatScore: Double
  public let tmdbId: Int?
  public let tvmazeId: Int?
  public let imdbId: String?
  public let traktId: Int?
  public let tvdbId: Int?
  public let createdAt: String?
  public let updatedAt: String?
  public let dataSources: [String]?

  public init(
    id: String,
    mediaType: String,
    releaseForm: String,
    sourceContentType: String? = nil,
    titleDisplay: String,
    titleChinese: String? = nil,
    titleOriginal: String? = nil,
    titleAliases: String? = nil,
    overview: String? = nil,
    posterUrl: String? = nil,
    posterLookupAttemptedAt: String? = nil,
    posterStatus: String? = nil,
    posterCheckedAt: String? = nil,
    posterFailureCount: Int? = nil,
    posterFailureReason: String? = nil,
    posterWidth: Int? = nil,
    posterHeight: Int? = nil,
    posterQuality: String? = nil,
    productionCountries: String? = nil,
    originalLanguage: String? = nil,
    genres: String? = nil,
    firstReleaseDate: String? = nil,
    status: String,
    heatScore: Double,
    tmdbId: Int? = nil,
    tvmazeId: Int? = nil,
    imdbId: String? = nil,
    traktId: Int? = nil,
    tvdbId: Int? = nil,
    createdAt: String? = nil,
    updatedAt: String? = nil,
    dataSources: [String]? = nil
  ) {
    self.id = id
    self.mediaType = mediaType
    self.releaseForm = releaseForm
    self.sourceContentType = sourceContentType
    self.titleDisplay = titleDisplay
    self.titleChinese = titleChinese
    self.titleOriginal = titleOriginal
    self.titleAliases = titleAliases
    self.overview = overview
    self.posterUrl = posterUrl
    self.posterLookupAttemptedAt = posterLookupAttemptedAt
    self.posterStatus = posterStatus
    self.posterCheckedAt = posterCheckedAt
    self.posterFailureCount = posterFailureCount
    self.posterFailureReason = posterFailureReason
    self.posterWidth = posterWidth
    self.posterHeight = posterHeight
    self.posterQuality = posterQuality
    self.productionCountries = productionCountries
    self.originalLanguage = originalLanguage
    self.genres = genres
    self.firstReleaseDate = firstReleaseDate
    self.status = status
    self.heatScore = heatScore
    self.tmdbId = tmdbId
    self.tvmazeId = tvmazeId
    self.imdbId = imdbId
    self.traktId = traktId
    self.tvdbId = tvdbId
    self.createdAt = createdAt
    self.updatedAt = updatedAt
    self.dataSources = dataSources
  }
}

public extension MediaItem {
  var preferredTitle: String {
    titleChinese?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? titleDisplay
  }

  var secondaryTitle: String? {
    if preferredTitle != titleDisplay { return titleDisplay }
    let original = titleOriginal?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
    return original == preferredTitle ? nil : original
  }
}

public typealias ApiMediaItem = MediaItem
public typealias MediaSummary = MediaItem

public struct ReleaseRow: Codable, Identifiable, Sendable {
  public let id: String
  public let mediaItemId: String
  public let platform: String
  public let region: String
  public let releaseDate: String?
  public let releaseTime: String?
  public let releasePattern: String
  public let releaseStatus: String
  public let seasonNumber: Int?
  public let episodeNumber: Int?
  public let episodeTitle: String?
  public let source: String
  public let sourceUrl: String?
  public let fetchedAt: String
  public let mediaItem: MediaItem
}

public struct PopularitySignal: Codable, Identifiable, Sendable {
  public let id: String
  public let mediaItemId: String
  public let sourceSyncRunId: String?
  public let source: String
  public let sourceCategory: String
  public let platform: String?
  public let region: String?
  public let window: String
  public let rankingScope: String
  public let rankingEntryKey: String?
  public let rankingEntryLabel: String?
  public let rank: Int?
  public let previousRank: Int?
  public let rankDelta: Int?
  public let value: Double?
  public let valueLabel: String?
  public let capturedAt: String
  public let isCurrent: Bool
  public let sourceUrl: String?
  public let mediaItem: MediaItem?
}

public enum PopularityMovement: String, Codable, Sendable {
  case new
  case rising
  case falling
  case stable
}

public struct MediaSourceRef: Codable, Identifiable, Sendable {
  public let id: String
  public let source: String
  public let sourceId: String
  public let isActive: Bool
  public let createdAt: String
  public let updatedAt: String
}

public struct ChangeEvent: Codable, Identifiable, Sendable {
  public let id: String
  public let mediaItemId: String?
  public let eventType: String
  public let title: String
  public let description: String
  public let source: String
  public let sourceUrl: String?
  public let eventAt: String
  public let payload: String
  public let mediaItem: EventMediaItem?

  public struct EventMediaItem: Codable, Sendable {
    public let id: String
    public let titleDisplay: String
  }
}

public struct MediaRating: Codable, Identifiable, Sendable {
  public let id: String
  public let mediaItemId: String
  public let source: String
  public let audience: String
  public let value: Double
  public let scale: Int
  public let voteCount: Int?
  public let sourceUrl: String?
  public let capturedAt: String
}

public struct SourceSyncRun: Codable, Identifiable, Sendable {
  public let id: String
  public let source: String
  public let scope: String
  public let status: String
  public let startedAt: String
  public let finishedAt: String?
  public let durationMs: Int?
  public let itemCount: Int
  public let errorMessage: String?
  public let nextRunAt: String?
}

// MARK: - 情报台、发现、热度、日历和前瞻

public struct DashboardResponse: Codable, Sendable {
  public let today: [ReleaseRow]
  public let week: [ReleaseRow]
  public let featured: [MediaItem]
  public let trending: [MediaItem]
  public let events: [ChangeEvent]
  public let sources: [SourceSyncRun]
}

public struct MediaListResponse: Codable, Sendable {
  public let items: [MediaItem]
  public let nextCursor: String?
}

public struct TrendingResponse: Codable, Sendable {
  public let items: [PopularitySignal]
}

public struct PopularityHistoryResponse: Codable, Sendable {
  public let items: [PopularitySignal]
}

public struct CalendarDay: Codable, Sendable {
  public let date: String
  public let count: Int
  public let items: [ReleaseRow]
}

public struct CalendarResponse: Codable, Sendable {
  public let items: [ReleaseRow]
  public let days: [CalendarDay]
}

public struct PreviewSourceStatus: Codable, Sendable {
  public let enabled: Bool
  public let runnable: Bool
  public let syncing: Bool
  public let latestRun: PreviewLatestRun?
  public let lastSuccessAt: String?
}

public struct PreviewLatestRun: Codable, Sendable {
  public let status: String
  public let startedAt: String
  public let finishedAt: String?
  public let itemCount: Int
  public let errorMessage: String?
}

public struct PreviewSummary: Codable, Sendable {
  public let total: Int
  public let movies: Int
  public let series: Int
  public let undated: Int
  public let hot: Int
}

public struct PreviewReleaseRow: Codable, Identifiable, Sendable {
  public let id: String
  public let mediaItemId: String
  public let platform: String
  public let region: String
  public let releaseDate: String?
  public let releaseTime: String?
  public let releasePattern: String
  public let releaseStatus: String
  public let seasonNumber: Int?
  public let episodeNumber: Int?
  public let episodeTitle: String?
  public let source: String
  public let sourceUrl: String?
  public let fetchedAt: String
  public let mediaItem: MediaItem
  public let doubanHotRank: Int?
  public let doubanHotKind: String?
  public let doubanWishCount: Double?
}

public struct PreviewDay: Codable, Sendable {
  public let date: String
  public let items: [PreviewReleaseRow]
}

public struct PreviewResponse: Codable, Sendable {
  public let generatedAt: String
  public let today: String
  public let source: PreviewSourceStatus
  public let summary: PreviewSummary
  public let days: [PreviewDay]
  public let undated: [PreviewReleaseRow]
}

public struct MediaDetailResponse: Codable, Sendable {
  public let id: String
  public let mediaType: String
  public let releaseForm: String
  public let sourceContentType: String?
  public let titleDisplay: String
  public let titleChinese: String?
  public let titleOriginal: String?
  public let titleAliases: String?
  public let overview: String?
  public let posterUrl: String?
  public let posterLookupAttemptedAt: String?
  public let posterStatus: String?
  public let posterCheckedAt: String?
  public let posterFailureCount: Int?
  public let posterFailureReason: String?
  public let posterWidth: Int?
  public let posterHeight: Int?
  public let posterQuality: String?
  public let productionCountries: String?
  public let originalLanguage: String?
  public let genres: String?
  public let firstReleaseDate: String?
  public let status: String
  public let heatScore: Double
  public let tmdbId: Int?
  public let tvmazeId: Int?
  public let imdbId: String?
  public let traktId: Int?
  public let tvdbId: Int?
  public let createdAt: String?
  public let updatedAt: String?
  public let releases: [ReleaseDetail]
  public let sourceRefs: [MediaSourceRef]
  public let popularitySignals: [PopularitySignal]
  public let ratings: [MediaRating]?
  public let changeEvents: [ChangeEvent]

  public struct ReleaseDetail: Codable, Identifiable, Sendable {
    public let id: String
    public let mediaItemId: String
    public let platform: String
    public let region: String
    public let releaseDate: String?
    public let releaseTime: String?
    public let releasePattern: String
    public let releaseStatus: String
    public let seasonNumber: Int?
    public let episodeNumber: Int?
    public let episodeTitle: String?
    public let source: String
    public let sourceUrl: String?
    public let fetchedAt: String
  }
}

public extension MediaDetailResponse {
  var preferredTitle: String {
    titleChinese?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? titleDisplay
  }

  var secondaryTitle: String? {
    if preferredTitle != titleDisplay { return titleDisplay }
    let original = titleOriginal?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
    return original == preferredTitle ? nil : original
  }
}

private extension String {
  var nonEmpty: String? { isEmpty ? nil : self }
}

// MARK: - 图片健康

public struct PosterHealthSample: Codable, Identifiable, Sendable {
  public let id: String
  public let title: String
  public let heatScore: Double
  public let attentionCategory: String
  public let priorityScore: Double
  public let sources: [String]
  public let width: Int?
  public let height: Int?
  public let lookupState: String
  public let lastLookupAt: String?
}

public struct PosterHealthCacheStats: Codable, Sendable {
  public let entries: Int
  public let bytes: Int64
  public let maxBytes: Int64
  public let orphanedFiles: Int
  public let corruptEntries: Int
  public let variants: PosterHealthVariantStats
}

public struct PosterHealthVariantStats: Codable, Sendable {
  public let entries: Int
  public let bytes: Int64
  public let orphanedFiles: Int
  public let corruptEntries: Int
  public let maxBytes: Int64
}

public struct PosterHealthLookupStats: Codable, Sendable {
  public let notAttempted: Int
  public let cooldown: Int
  public let retryEligible: Int
  public let retryAfterDays: Int
  public let nextCooldownExpiryAt: String?
}

public struct PosterHealthStatusStats: Codable, Sendable {
  public let unverified: Int
  public let healthy: Int
  public let degraded: Int
  public let broken: Int
}

public struct PosterHealthQualityStats: Codable, Sendable {
  public let unknown: Int
  public let adequate: Int
  public let undersized: Int
}

public struct PosterHealthSamples: Codable, Sendable {
  public let broken: [PosterHealthSample]
  public let degraded: [PosterHealthSample]
  public let missing: [PosterHealthSample]
  public let undersized: [PosterHealthSample]
}

public struct PosterHealthResponse: Codable, Sendable {
  public let total: Int
  public let withPoster: Int
  public let missing: Int
  public let coveragePercent: Double
  public let missingBySource: [MissingPosterBySource]
  public let statuses: PosterHealthStatusStats
  public let quality: PosterHealthQualityStats
  public let lookup: PosterHealthLookupStats
  public let replacement: PosterHealthLookupStats
  public let cache: PosterHealthCacheStats
  public let samples: PosterHealthSamples

  public struct MissingPosterBySource: Codable, Sendable {
    public let source: String
    public let count: Int
  }
}

// MARK: - 数据源和设置模型

public struct SettingsFieldView: Codable, Sendable {
  public let key: String
  public let label: String
  public let type: String
  public let sensitive: Bool
  public let configured: Bool
  public let maskedValue: String?
  public let value: String?
  public let options: [String]?
}

public struct ContentWeightView: Codable, Sendable {
  public let category: String
  public let key: String
  public let label: String
  public let description: String
  public let value: Double
  public let defaultValue: Double
}

public struct SchedulerSettingsView: Codable, Sendable {
  public let enabled: Bool
  public let forcedDisabled: Bool
  public let hourlyIntervalHours: Double
  public let dailyTime: String
  public let timezone: String
  public let nextHourlyRunAt: String?
  public let nextDailyRunAt: String?
}

public struct SourceSemanticsView: Codable, Sendable {
  public let signalKinds: [String]
  public let coverage: String
  public let cadence: String
  public let access: String
  public let freshnessNote: String
  public let riskNote: String
}

public struct SourceLocalFileState: Codable, Sendable {
  public let fileName: String
  public let exists: Bool
  public let sizeBytes: Int64?
  public let expectedBytes: Int64?
  public let downloadedAt: String?
  public let lastModified: String?
  public let etag: String?
  public let issue: String?
}

public struct SourceLocalStateView: Codable, Sendable {
  public let kind: String
  public let status: String
  public let configured: Bool
  public let readyFiles: Int
  public let totalFiles: Int
  public let files: [SourceLocalFileState]
}

public struct SourceManualCommandView: Codable, Sendable {
  public let label: String
  public let command: String
  public let description: String
}

public struct SourceLatestRunView: Codable, Sendable {
  public let status: String
  public let startedAt: String
  public let finishedAt: String?
  public let itemCount: Int
  public let durationMs: Int?
  public let errorMessage: String?
}

public struct SourceSettingsView: Codable, Identifiable, Sendable {
  public let id: String
  public let name: String
  public let description: String
  public let group: String
  public let implementationStatus: String
  public let enabled: Bool
  public let runnable: Bool
  public let proxyMode: String
  public let credentialsComplete: Bool
  public let missingCredentials: [String]
  public let supportsSync: Bool
  public let supportsEnable: Bool
  public let fields: [SettingsFieldView]
  public let semantics: SourceSemanticsView
  public let localState: SourceLocalStateView?
  public let manualCommands: [SourceManualCommandView]
  public let latestRun: SourceLatestRunView?
}

public typealias SourceCatalogItem = SourceSettingsView

public struct SettingsResponse: Codable, Sendable {
  public let proxyFields: [SettingsFieldView]
  public let contentWeights: [ContentWeightView]
  public let scheduler: SchedulerSettingsView
  public let sources: [SourceSettingsView]
}

public struct SourcesResponse: Codable, Sendable {
  public let items: [SourceCatalogItem]
}

public struct SourceRunLogItem: Codable, Identifiable, Sendable {
  public let id: String
  public let sourceId: String
  public let sourceName: String
  public let scope: String
  public let status: String
  public let startedAt: String
  public let finishedAt: String?
  public let durationMs: Int?
  public let itemCount: Int
  public let errorMessage: String?
  public let retryable: Bool
}

public struct SourceRunLogsResponse: Codable, Sendable {
  public let generatedAt: String
  public let sources: [SourceReference]
  public let items: [SourceRunLogItem]

  public struct SourceReference: Codable, Sendable {
    public let id: String
    public let name: String
  }
}

public struct SourceHealthLatestRun: Codable, Sendable {
  public let status: String
  public let startedAt: String
  public let finishedAt: String?
  public let itemCount: Int
  public let durationMs: Int?
  public let errorMessage: String?
}

public struct SourceHealthSample: Codable, Sendable {
  public let title: String
  public let mediaType: String
  public let signalKind: String
  public let source: String
  public let platform: String?
  public let region: String?
  public let sourceUrl: String?
  public let capturedAtOrFetchedAt: String
}

public struct SourceHealthRow: Codable, Identifiable, Sendable {
  public let sourceId: String
  public var id: String { "\(sourceId)|\(scope)" }
  public let sourceName: String
  public let scope: String
  public let scheduleGroup: String
  public let group: String
  public let implementationStatus: String
  public let enabled: Bool
  public let runnable: Bool
  public let credentialsComplete: Bool
  public let missingCredentials: [String]
  public let signalKinds: [String]
  public let runStatus: String
  public let acceptanceStatus: String
  public let freshnessStatus: String
  public let reasonCode: String
  public let reason: String
  public let latestRun: SourceHealthLatestRun?
  public let lastSuccessAt: String?
  public let staleAfterHours: Double?
  public let itemCount: Int
  public let samples: [SourceHealthSample]
}

public struct SourceHealthSummary: Codable, Sendable {
  public let total: Int
  public let passed: Int
  public let degraded: Int
  public let failed: Int
  public let blocked: Int
  public let runnable: Int
  public let stale: Int
}

public struct SourceHealthResponse: Codable, Sendable {
  public let generatedAt: String
  public let summary: SourceHealthSummary
  public let items: [SourceHealthRow]
}

// MARK: - 来源操作、健康和设置写入

public struct ConnectionTestResult: Codable, Sendable {
  public let mode: String
  public let success: Bool
  public let durationMs: Int
  public let statusCode: Int?
  public let errorType: String?
  public let message: String
}

public struct ProxyTestResponse: Codable, Sendable {
  public let items: [ConnectionTestResult]
}

public struct SourceTestResponse: Codable, Sendable {
  public let sourceId: String
  public let implementationStatus: String
  public let result: ConnectionTestResult
}

public struct SourcePreviewScope: Codable, Sendable {
  public let scope: String
  public let itemCount: Int
}

public struct SourcePreviewSample: Codable, Sendable {
  public let scope: String
  public let title: String
  public let mediaType: String
  public let releaseForm: String
  public let posterUrl: String?
  public let firstReleaseDate: String?
  public let releaseDate: String?
  public let releasePattern: String?
  public let platform: String?
  public let region: String?
  public let sourceUrl: String?
}

public struct SourcePreviewResponse: Codable, Sendable {
  public let sourceId: String
  public let itemCount: Int
  public let withPoster: Int
  public let mediaTypes: [String: Int]
  public let releasePatterns: [String: Int]
  public let releaseDateStart: String?
  public let releaseDateEnd: String?
  public let scopes: [SourcePreviewScope]
  public let samples: [SourcePreviewSample]
  public let fetchedAt: String
  public let persisted: Bool
}

public struct SettingsUpdateRequest: Encodable, Sendable {
  public let values: [String: String]
  public let clearKeys: [String]

  public init(values: [String: String] = [:], clearKeys: [String] = []) {
    self.values = values
    self.clearKeys = clearKeys
  }
}

public struct SettingsUpdateResponse: Codable, Sendable {
  public let success: Bool
  public let effectiveImmediately: Bool
}

public struct PreviewSyncResponse: Codable, Sendable {
  public let syncing: Bool
  public let run: SourceSyncRun?
}

public struct SourceSyncResponse: Codable, Sendable {
  public let items: [SourceSyncRun]
}

public struct HealthResponse: Codable, Sendable {
  public let ok: Bool
  public let service: String?
  public let environment: String?
}

public struct EmptyResponse: Codable, Sendable {
  public init() {}
}
