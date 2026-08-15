import Foundation
import Testing
@testable import WhatsNewCore

@Suite("来源下一步提示")
struct SourceActionGuidanceTests {
  private let decoder = JSONDecoder()

  @Test("缓存目录未配置时先提示配置")
  func asksForCacheDirectoryFirst() throws {
    let source = try makeSource(localStatus: "missing_config", latestRun: "null")

    let guidance = sourceActionGuidance(for: source)

    #expect(guidance?.title == "先配置缓存目录")
    #expect(guidance?.command == nil)
  }

  @Test("缓存就绪但没有运行记录时提示同步")
  func asksForSyncWhenCacheIsReady() throws {
    let source = try makeSource(localStatus: "ready", latestRun: "null")

    let guidance = sourceActionGuidance(for: source)

    #expect(guidance?.title == "缓存已就绪，等待同步")
    #expect(guidance?.command?.contains("sync:imdb") == true)
  }

  @Test("缓存晚于最近运行时提示重新同步")
  func detectsNewerCache() throws {
    let latestRun = #"{"status":"success","startedAt":"2026-08-14T00:00:00Z","finishedAt":"2026-08-14T00:01:00Z","itemCount":804,"durationMs":60000,"errorMessage":null}"#
    let source = try makeSource(localStatus: "ready", latestRun: latestRun)

    let guidance = sourceActionGuidance(for: source)

    #expect(guidance?.title == "缓存比同步更新")
    #expect(guidance?.command?.contains("sync:imdb") == true)
  }

  @Test("非 IMDb 来源不生成专属提示")
  func ignoresOtherSources() throws {
    let source = try makeSource(id: "tmdb", localStatus: "ready", latestRun: "null")

    #expect(sourceActionGuidance(for: source) == nil)
  }

  private func makeSource(
    id: String = "imdb",
    localStatus: String,
    latestRun: String
  ) throws -> SourceSettingsView {
    let json = """
    {
      "id": "\(id)",
      "name": "IMDb",
      "description": "本地数据集",
      "group": "global_metadata",
      "implementationStatus": "active",
      "enabled": true,
      "runnable": true,
      "proxyMode": "direct",
      "credentialsComplete": true,
      "missingCredentials": [],
      "supportsSync": false,
      "supportsEnable": true,
      "fields": [],
      "semantics": {
        "signalKinds": ["rating"],
        "coverage": "全球",
        "cadence": "manual",
        "access": "public_api",
        "freshnessNote": "本地缓存",
        "riskNote": ""
      },
      "localState": {
        "kind": "imdb_datasets",
        "status": "\(localStatus)",
        "configured": true,
        "readyFiles": 1,
        "totalFiles": 1,
        "files": [{
          "fileName": "title.basics.tsv.gz",
          "exists": true,
          "sizeBytes": 100,
          "expectedBytes": null,
          "downloadedAt": "2026-08-15T00:00:00Z",
          "lastModified": null,
          "etag": null,
          "issue": null
        }]
      },
      "manualCommands": [
        {
          "label": "下载缓存",
          "command": "npm run download:imdb --workspace backend",
          "description": "下载官方数据集"
        },
        {
          "label": "同步缓存",
          "command": "npm run sync:imdb --workspace backend",
          "description": "同步到资料库"
        }
      ],
      "latestRun": \(latestRun)
    }
    """
    return try decoder.decode(SourceSettingsView.self, from: Data(json.utf8))
  }
}
