import type { SourceSettingsView } from "../api/types"

export type SourceActionGuidance = {
  tone: "neutral" | "warning" | "success" | "error"
  title: string
  detail: string
  command: string | null
}

function commandByScript(source: SourceSettingsView, scriptName: string): string | null {
  return source.manualCommands.find((command) => (
    command.command.includes(scriptName)
  ))?.command ?? null
}

function latestDownloadedAt(source: SourceSettingsView): string | null {
  return source.localState?.files
    .map((file) => file.downloadedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null
}

function timestamp(value: string | null): number | null {
  if (!value) return null

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function sourceActionGuidance(source: SourceSettingsView): SourceActionGuidance | null {
  if (source.id !== "imdb" || !source.localState) return null

  const downloadCommand = commandByScript(source, "download:imdb")
  const syncCommand = commandByScript(source, "sync:imdb")

  if (source.localState.status === "missing_config") {
    return {
      tone: "warning",
      title: "先配置缓存目录",
      detail: "保存 IMDB_DATASET_CACHE_DIR 后再下载官方数据集",
      command: null
    }
  }

  if (source.localState.status !== "ready") {
    return {
      tone: "warning",
      title: "先刷新 IMDb 缓存",
      detail: "缓存文件未就绪，下载完成后这里会更新状态",
      command: downloadCommand
    }
  }

  if (!source.latestRun) {
    return {
      tone: "neutral",
      title: "缓存已就绪，等待同步",
      detail: "运行本地同步后会写入 IMDb ID 和评分",
      command: syncCommand
    }
  }

  if (source.latestRun.status === "running") {
    return {
      tone: "neutral",
      title: "同步运行中",
      detail: "等待当前同步结束后再查看结果",
      command: null
    }
  }

  if (source.latestRun.status === "failed") {
    return {
      tone: "error",
      title: "最近同步失败",
      detail: source.latestRun.errorMessage ?? "查看后端日志后重新运行同步命令",
      command: syncCommand
    }
  }

  const downloadedAt = latestDownloadedAt(source)
  const downloadedTime = timestamp(downloadedAt)
  const syncedTime = timestamp(source.latestRun.startedAt)
  if (downloadedAt && downloadedTime && syncedTime && downloadedTime > syncedTime) {
    return {
      tone: "neutral",
      title: "缓存比同步更新",
      detail: `缓存刷新于 ${downloadedAt.slice(0, 10)}，重新同步后结果会进入最近状态`,
      command: syncCommand
    }
  }

  if (source.latestRun.status === "success") {
    return {
      tone: "success",
      title: "最近同步完成",
      detail: `${source.latestRun.itemCount} 条 · ${source.latestRun.startedAt.slice(0, 10)}`,
      command: null
    }
  }

  return {
    tone: "warning",
    title: "最近同步有警告",
    detail: `${source.latestRun.itemCount} 条 · ${source.latestRun.startedAt.slice(0, 10)}`,
    command: null
  }
}
