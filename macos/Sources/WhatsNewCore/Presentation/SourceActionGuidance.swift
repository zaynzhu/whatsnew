import Foundation

public enum SourceActionGuidanceTone: Sendable {
  case neutral
  case warning
  case success
  case error
}

public struct SourceActionGuidance: Sendable {
  public let tone: SourceActionGuidanceTone
  public let title: String
  public let detail: String
  public let command: String?
}

/// 根据服务端返回的本地文件和最近运行状态，给出与 Web 控制台一致的 IMDb 下一步提示。
public func sourceActionGuidance(for source: SourceSettingsView) -> SourceActionGuidance? {
  guard source.id == "imdb", let localState = source.localState else {
    return nil
  }

  let downloadCommand = command(in: source, containing: "download:imdb")
  let syncCommand = command(in: source, containing: "sync:imdb")

  if localState.status == "missing_config" {
    return SourceActionGuidance(
      tone: .warning,
      title: "先配置缓存目录",
      detail: "保存 IMDB_DATASET_CACHE_DIR 后再下载官方数据集",
      command: nil
    )
  }

  if localState.status != "ready" {
    return SourceActionGuidance(
      tone: .warning,
      title: "先刷新 IMDb 缓存",
      detail: "缓存文件未就绪，下载完成后这里会更新状态",
      command: downloadCommand
    )
  }

  guard let latestRun = source.latestRun else {
    return SourceActionGuidance(
      tone: .neutral,
      title: "缓存已就绪，等待同步",
      detail: "运行本地同步后会写入 IMDb ID 和评分",
      command: syncCommand
    )
  }

  if latestRun.status == "running" {
    return SourceActionGuidance(
      tone: .neutral,
      title: "同步运行中",
      detail: "等待当前同步结束后再查看结果",
      command: nil
    )
  }

  if latestRun.status == "failed" {
    return SourceActionGuidance(
      tone: .error,
      title: "最近同步失败",
      detail: latestRun.errorMessage ?? "查看后端日志后重新运行同步命令",
      command: syncCommand
    )
  }

  if cacheIsNewer(localState: localState, than: latestRun.startedAt) {
    return SourceActionGuidance(
      tone: .neutral,
      title: "缓存比同步更新",
      detail: "缓存已经刷新，重新同步后结果会进入最近状态",
      command: syncCommand
    )
  }

  let runSummary = "\(latestRun.itemCount) 条 · \(String(latestRun.startedAt.prefix(10)))"
  if latestRun.status == "success" {
    return SourceActionGuidance(
      tone: .success,
      title: "最近同步完成",
      detail: runSummary,
      command: nil
    )
  }

  return SourceActionGuidance(
    tone: .warning,
    title: "最近同步有警告",
    detail: runSummary,
    command: nil
  )
}

private func command(in source: SourceSettingsView, containing scriptName: String) -> String? {
  source.manualCommands.first { $0.command.contains(scriptName) }?.command
}

private func cacheIsNewer(localState: SourceLocalStateView, than runStartedAt: String) -> Bool {
  guard let runDate = SharedFormatters.date(fromISO8601: runStartedAt) else {
    return false
  }
  let latestCacheDate = localState.files
    .compactMap { $0.downloadedAt }
    .compactMap(SharedFormatters.date(fromISO8601:))
    .max()
  return latestCacheDate.map { $0 > runDate } ?? false
}
