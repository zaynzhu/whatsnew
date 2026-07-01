type SourceRunInput = {
  source: string
  scope: string | null
  status: string
  startedAt: Date
  finishedAt: Date | null
  itemCount: number
  durationMs: number | null
  errorMessage: string | null
}

export type AggregatedSourceRun = {
  status: string
  startedAt: Date
  finishedAt: Date | null
  itemCount: number
  durationMs: number | null
  errorMessage: string | null
}

const STATUS_PRIORITY = new Map([
  ["success", 1],
  ["warning", 2],
  ["failed", 3],
  ["running", 4]
])

function aggregateSourceRuns(sourceRuns: SourceRunInput[]): AggregatedSourceRun | null {
  if (sourceRuns.length === 0) return null

  return {
    status: sourceRuns.reduce((selected, run) => (
      (STATUS_PRIORITY.get(run.status) ?? 0) > (STATUS_PRIORITY.get(selected) ?? 0)
        ? run.status
        : selected
    ), "success"),
    startedAt: new Date(Math.max(...sourceRuns.map((run) => run.startedAt.getTime()))),
    finishedAt: sourceRuns.some((run) => run.finishedAt == null)
      ? null
      : new Date(Math.max(...sourceRuns.map((run) => run.finishedAt?.getTime() ?? 0))),
    itemCount: sourceRuns.reduce((total, run) => total + run.itemCount, 0),
    durationMs: sourceRuns.every((run) => run.durationMs == null)
      ? null
      : sourceRuns.reduce((total, run) => total + (run.durationMs ?? 0), 0),
    errorMessage: sourceRuns
      .filter((run) => run.errorMessage)
      .map((run) => `[${run.scope ?? "all"}] ${run.errorMessage}`)
      .join("；") || null
  }
}

export function aggregateLatestSourceRuns(runs: SourceRunInput[]): Map<string, AggregatedSourceRun> {
  const latestScopeRuns = new Map<string, SourceRunInput>()
  for (const run of runs) {
    const key = `${run.source}:${run.scope ?? "all"}`
    if (!latestScopeRuns.has(key)) latestScopeRuns.set(key, run)
  }

  const runsBySource = new Map<string, SourceRunInput[]>()
  for (const run of latestScopeRuns.values()) {
    const sourceRuns = runsBySource.get(run.source) ?? []
    sourceRuns.push(run)
    runsBySource.set(run.source, sourceRuns)
  }

  return new Map(
    [...runsBySource.entries()]
      .map(([source, sourceRuns]) => [source, aggregateSourceRuns(sourceRuns)] as const)
      .filter((entry): entry is [string, AggregatedSourceRun] => entry[1] != null)
  )
}
