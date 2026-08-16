import Foundation
import Testing
@testable import WhatsNewCore

@Suite("API 模型")
struct APIModelsTests {
  private let decoder = JSONDecoder()

  @Test("未知状态和额外字段不阻断情报台解码")
  func decodesDashboardWithUnknownStringsAndExtraFields() throws {
    let json = """
    {
      "today": [{
        "id": "release-1",
        "mediaItemId": "media-1",
        "platform": "Netflix",
        "region": "global",
        "releaseDate": "2026-08-15",
        "releaseTime": null,
        "releasePattern": "platform_premiere",
        "releaseStatus": "future_server_status",
        "seasonNumber": null,
        "episodeNumber": null,
        "episodeTitle": null,
        "source": "netflix",
        "sourceUrl": null,
        "fetchedAt": "2026-08-15T00:00:00.000Z",
        "mediaItem": {
          "id": "media-1",
          "mediaType": "future_media_type",
          "releaseForm": "future_release_form",
          "titleDisplay": "测试作品",
          "titleOriginal": null,
          "posterUrl": null,
          "firstReleaseDate": "2026-08-15",
          "status": "future_status",
          "heatScore": 12.5,
          "futureField": "ignored"
        }
      }],
      "week": [],
      "featured": [],
      "trending": [],
      "events": [],
      "sources": []
    }
    """

    let response = try decoder.decode(DashboardResponse.self, from: Data(json.utf8))

    #expect(response.today.first?.mediaItem.mediaType == "future_media_type")
    #expect(response.today.first?.releaseStatus == "future_server_status")
  }

  @Test("日历摘要允许顶层 items 为空")
  func decodesCalendarSummaryWithEmptyItems() throws {
    let json = """
    {
      "items": [],
      "days": [{
        "date": "2026-08-15",
        "count": 3,
        "items": []
      }]
    }
    """

    let response = try decoder.decode(CalendarResponse.self, from: Data(json.utf8))

    #expect(response.items.isEmpty)
    #expect(response.days.first?.count == 3)
  }

  @Test("中文标题优先展示并保留原文副标题")
  func prefersChineseTitleWithCanonicalSubtitle() {
    let localized = MediaItem(
      id: "localized",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      titleDisplay: "Dune: Part Three",
      titleChinese: "沙丘3",
      titleOriginal: "Dune: Part Three",
      status: "upcoming",
      heatScore: 80
    )
    let canonical = MediaItem(
      id: "canonical",
      mediaType: "movie",
      releaseForm: "streaming_movie",
      titleDisplay: "沙丘3",
      titleOriginal: "Dune: Part Three",
      status: "upcoming",
      heatScore: 80
    )

    #expect(localized.preferredTitle == "沙丘3")
    #expect(localized.secondaryTitle == "Dune: Part Three")
    #expect(canonical.preferredTitle == "沙丘3")
    #expect(canonical.secondaryTitle == "Dune: Part Three")
  }

  @Test("设置允许运行态字段为空")
  func decodesNullableSettingsFields() throws {
    let json = """
    {
      "proxyFields": [],
      "contentWeights": [],
      "scheduler": {
        "enabled": true,
        "forcedDisabled": false,
        "hourlyIntervalHours": 2,
        "dailyTime": "09:15",
        "timezone": "Asia/Shanghai",
        "nextHourlyRunAt": null,
        "nextDailyRunAt": null
      },
      "sources": [{
        "id": "imdb",
        "name": "IMDb",
        "description": "本地数据集",
        "group": "global_metadata",
        "implementationStatus": "active",
        "enabled": true,
        "runnable": false,
        "proxyMode": "inherit",
        "credentialsComplete": true,
        "missingCredentials": [],
        "supportsSync": false,
        "supportsEnable": true,
        "fields": [],
        "semantics": {
          "signalKinds": ["metadata"],
          "coverage": "全球",
          "cadence": "手动",
          "access": "public_page",
          "freshnessNote": "",
          "riskNote": ""
        },
        "localState": null,
        "manualCommands": [],
        "latestRun": null
      }]
    }
    """

    let response = try decoder.decode(SettingsResponse.self, from: Data(json.utf8))

    #expect(response.scheduler.hourlyIntervalHours == 2)
    #expect(response.sources.first?.latestRun == nil)
    #expect(response.sources.first?.localState == nil)
  }

  @Test("作品详情解码多来源评分并兼容旧接口")
  func decodesMediaRatingsAndLegacyDetails() throws {
    let base = """
      "id": "media-1",
      "mediaType": "movie",
      "releaseForm": "theatrical_movie",
      "titleDisplay": "测试电影",
      "status": "released",
      "heatScore": 42,
      "releases": [],
      "sourceRefs": [],
      "popularitySignals": [],
      "changeEvents": []
    """
    let ratedJSON = """
    {
      \(base),
      "ratings": [
        {
          "id": "rating-1",
          "mediaItemId": "media-1",
          "source": "douban",
          "audience": "users",
          "value": 8.8,
          "scale": 10,
          "voteCount": 123456,
          "sourceUrl": "https://movie.douban.com/subject/1292052/",
          "capturedAt": "2026-08-16T08:00:00.000Z"
        },
        {
          "id": "rating-2",
          "mediaItemId": "media-1",
          "source": "rotten_tomatoes",
          "audience": "critics",
          "value": 91,
          "scale": 100,
          "voteCount": null,
          "sourceUrl": null,
          "capturedAt": "2026-08-16T08:00:00.000Z"
        }
      ]
    }
    """
    let legacyJSON = "{\(base)}"

    let rated = try decoder.decode(MediaDetailResponse.self, from: Data(ratedJSON.utf8))
    let legacy = try decoder.decode(MediaDetailResponse.self, from: Data(legacyJSON.utf8))

    #expect(rated.ratings?.count == 2)
    #expect(rated.ratings?.first?.source == "douban")
    #expect(rated.ratings?.last?.scale == 100)
    #expect(legacy.ratings == nil)
  }

  @Test("来源健康身份包含 scope")
  func sourceHealthIdentityIncludesScope() throws {
    let row = """
    {
      "sourceId": "douban",
      "sourceName": "豆瓣",
      "scope": "%@",
      "scheduleGroup": "daily",
      "group": "china_platform",
      "implementationStatus": "active",
      "enabled": true,
      "runnable": true,
      "credentialsComplete": true,
      "missingCredentials": [],
      "signalKinds": ["release_calendar"],
      "runStatus": "success",
      "acceptanceStatus": "passed",
      "freshnessStatus": "fresh",
      "reasonCode": "passed",
      "reason": "正常",
      "latestRun": null,
      "lastSuccessAt": null,
      "staleAfterHours": 24,
      "itemCount": 10,
      "samples": []
    }
    """
    let json = """
    {
      "generatedAt": "2026-08-15T00:00:00.000Z",
      "summary": {
        "total": 2,
        "passed": 2,
        "degraded": 0,
        "failed": 0,
        "blocked": 0,
        "runnable": 2,
        "stale": 0
      },
      "items": [
        \(String(format: row, "upcoming")),
        \(String(format: row, "popularity"))
      ]
    }
    """

    let response = try decoder.decode(SourceHealthResponse.self, from: Data(json.utf8))

    #expect(Set(response.items.map(\.id)).count == 2)
  }

  @Test("健康响应允许缺少 service 以报告身份错误")
  func healthAllowsMissingService() throws {
    let response = try decoder.decode(
      HealthResponse.self,
      from: Data(#"{"ok":true,"environment":"unknown"}"#.utf8)
    )

    #expect(response.service == nil)
  }
}
