import type { SourceLocalStateView } from "@whatsnew/shared/settings"

export const SOURCE_LOCAL_STATE_LABELS: Record<SourceLocalStateView["status"], string> = {
  missing_config: "缺少缓存目录",
  missing_files: "缺少缓存文件",
  partial: "缓存需检查",
  ready: "缓存就绪"
}

export function sourceLocalStateDetail(localState: SourceLocalStateView): string {
  const latestDownloadedAt = localState.files
    .map((file) => file.downloadedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  const date = latestDownloadedAt ? ` · ${latestDownloadedAt.slice(0, 10)}` : ""

  return `${localState.readyFiles}/${localState.totalFiles} 文件${date}`
}
