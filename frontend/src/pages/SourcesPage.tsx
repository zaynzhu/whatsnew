import { useQuery } from "@tanstack/react-query"
import { ScrollText } from "lucide-react"
import { Link } from "react-router-dom"
import { apiGet } from "../api/client"
import type { SourceHealthResponse, SourceHealthRow, SourcesResponse } from "../api/types"
import { StatusBadge } from "../components/StatusBadge"
import {
  SOURCE_LOCAL_STATE_LABELS,
  sourceLocalStateDetail
} from "../utils/sourceLocalState"
import { sourceActionGuidance } from "../utils/sourceActionGuidance"
import {
  SOURCE_ACCESS_LABELS,
  SOURCE_GROUP_LABELS,
  SOURCE_SIGNAL_LABELS
} from "../utils/sourceSemantics"

const SOURCE_STATUS_LABELS = {
  active: "已接入",
  blocked: "接入受限",
  planned: "规划中",
  commercial: "商业接口"
}
const SOURCE_STATUS_REFETCH_MS = 5000
const HEALTH_PRIORITY: Record<SourceHealthRow["acceptanceStatus"], number> = {
  failed: 4,
  degraded: 3,
  blocked: 2,
  passed: 1
}

function primaryHealth(rows: SourceHealthRow[]): SourceHealthRow | null {
  return [...rows].sort((left, right) => (
    HEALTH_PRIORITY[right.acceptanceStatus] - HEALTH_PRIORITY[left.acceptanceStatus]
  ))[0] ?? null
}

export function SourcesPage() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => apiGet<SourcesResponse>("/api/sources"),
    refetchInterval: SOURCE_STATUS_REFETCH_MS
  })
  const healthQuery = useQuery({
    queryKey: ["source-health"],
    queryFn: () => apiGet<SourceHealthResponse>("/api/source-health"),
    refetchInterval: SOURCE_STATUS_REFETCH_MS
  })

  if (isLoading) return <main className="page">加载中...</main>
  if (isError) return <main className="page">数据源状态加载失败</main>

  const items = data?.items ?? []
  const healthBySource = new Map<string, SourceHealthRow[]>()
  for (const row of healthQuery.data?.items ?? []) {
    const rows = healthBySource.get(row.sourceId) ?? []
    rows.push(row)
    healthBySource.set(row.sourceId, rows)
  }
  const enabledSources = items.filter((source) => source.enabled)
  const enabledHealth = enabledSources
    .map((source) => primaryHealth(healthBySource.get(source.id) ?? []))
    .filter((health): health is SourceHealthRow => health !== null)
  const healthyCount = enabledHealth.filter((health) => health.acceptanceStatus === "passed").length
  const attentionCount = enabledSources.length - healthyCount
  const healthSummaryAvailable = healthQuery.data !== undefined

  return (
    <main className="page">
      <section className="pageHeader simple" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">采集网络</p>
          <h1 id="page-title">数据源状态</h1>
          <p className="summary">查看来源能力、访问方式、最新同步和不能同步的真实原因。</p>
        </div>
        <div className="pageHeaderActions">
          <Link className="secondaryButton" to="/sources/runs">
            <ScrollText aria-hidden="true" size={17} />
            运行日志
          </Link>
        </div>
      </section>

      <section className="sourceStats" aria-label="数据源概览">
        <div>
          <span>已启用</span>
          <strong>{enabledSources.length}</strong>
        </div>
        <div>
          <span>健康来源</span>
          <strong>{healthSummaryAvailable ? healthyCount : "-"}</strong>
        </div>
        <div>
          <span>需处理</span>
          <strong>{healthSummaryAvailable ? attentionCount : "-"}</strong>
        </div>
      </section>

      <div className="sourceCatalogList">
        {items.length > 0 ? (
          items.map((source) => {
            const guidance = sourceActionGuidance(source)
            const healthRows = healthBySource.get(source.id) ?? []
            const health = primaryHealth(healthRows)
            const passedScopes = healthRows.filter((row) => row.acceptanceStatus === "passed").length

            return (
              <article className="sourceCatalogRow" key={source.id}>
                <div className="sourceCatalogIdentity">
                  <span>{SOURCE_GROUP_LABELS[source.group]}</span>
                  <strong>{source.name}</strong>
                  <p>{source.description}</p>
                </div>
                <div className="semanticTags" aria-label={`${source.name} 信号类型`}>
                  {source.semantics.signalKinds.map((kind) => (
                    <span className="semanticTag" key={kind}>
                      {SOURCE_SIGNAL_LABELS[kind]}
                    </span>
                  ))}
                </div>
                <div className="sourceCatalogMeta">
                  <span>{source.semantics.coverage} · {source.semantics.cadence}</span>
                  <strong>{SOURCE_ACCESS_LABELS[source.semantics.access]}</strong>
                </div>
                <div className="sourceRuntimeState">
                  {health ? (
                    <>
                      <StatusBadge>{health.acceptanceStatus}</StatusBadge>
                      <span>
                        {healthRows.length > 1
                          ? `${passedScopes}/${healthRows.length} 范围通过`
                          : `${health.itemCount} 条`}
                      </span>
                    </>
                  ) : source.latestRun ? (
                    <>
                      <StatusBadge>{source.latestRun.status}</StatusBadge>
                      <span>{source.latestRun.itemCount} 条</span>
                    </>
                  ) : source.localState ? (
                    <>
                      <strong className={`localStateLabel ${source.localState.status}`}>
                        {SOURCE_LOCAL_STATE_LABELS[source.localState.status]}
                      </strong>
                      <span>{sourceLocalStateDetail(source.localState)}</span>
                    </>
                  ) : (
                    <>
                      <span className={`sourceStatus ${source.implementationStatus}`}>
                        {SOURCE_STATUS_LABELS[source.implementationStatus]}
                      </span>
                      <span>暂无同步</span>
                    </>
                  )}
                </div>
                <p className="sourceRiskNote">
                  {health
                    ? health.reason
                    : source.implementationStatus === "active" && source.runnable
                    ? source.semantics.freshnessNote
                    : source.semantics.riskNote}
                </p>
                {guidance ? (
                  <div className={`sourceGuidance ${guidance.tone}`}>
                    <strong>{guidance.title}</strong>
                    <span>{guidance.detail}</span>
                    {guidance.command && <code>{guidance.command}</code>}
                  </div>
                ) : source.manualCommands[0] && (
                  <p className="sourceCommandHint">
                    <code>{source.manualCommands[0].command}</code>
                  </p>
                )}
              </article>
            )
          })
        ) : (
          <p className="emptyText">暂无同步记录</p>
        )}
      </div>
    </main>
  )
}
