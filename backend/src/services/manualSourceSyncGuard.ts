type SourceEnablement = {
  sourceEnabled(sourceId: string): boolean
}

export function assertManualSourceEnabled(settings: SourceEnablement, sourceId: string): void {
  if (settings.sourceEnabled(sourceId)) return
  throw new Error(`来源 ${sourceId} 已关闭；请先启用，国内源验证请使用 sandbox:sync`)
}
