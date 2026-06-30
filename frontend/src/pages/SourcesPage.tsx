import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"
import type { SourcesResponse } from "../api/types"
import { StatusBadge } from "../components/StatusBadge"
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

export function SourcesPage() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => apiGet<SourcesResponse>("/api/sources")
  })

  if (isLoading) return <main className="page">加载中...</main>
  if (isError) return <main className="page">数据源状态加载失败</main>

  const items = data?.items ?? []
  const activeCount = items.filter((source) => source.implementationStatus === "active").length
  const plannedCount = items.filter((source) => source.implementationStatus === "planned").length
  const limitedCount = items.filter((source) => (
    source.implementationStatus === "commercial" || source.implementationStatus === "blocked"
  )).length

  return (
    <main className="page">
      <section className="pageHeader simple" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">采集网络</p>
          <h1 id="page-title">数据源状态</h1>
          <p className="summary">查看来源能力、访问方式、最新同步和不能同步的真实原因。</p>
        </div>
      </section>

      <section className="sourceStats" aria-label="数据源数量">
        <div>
          <span>已接入</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <span>规划中</span>
          <strong>{plannedCount}</strong>
        </div>
        <div>
          <span>受限/商业</span>
          <strong>{limitedCount}</strong>
        </div>
      </section>

      <div className="sourceCatalogList">
        {items.length > 0 ? (
          items.map((source) => (
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
                {source.latestRun ? (
                  <>
                    <StatusBadge>{source.latestRun.status}</StatusBadge>
                    <span>{source.latestRun.itemCount} 条</span>
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
                {source.implementationStatus === "active" && source.runnable
                  ? source.semantics.freshnessNote
                  : source.semantics.riskNote}
              </p>
            </article>
          ))
        ) : (
          <p className="emptyText">暂无同步记录</p>
        )}
      </div>
    </main>
  )
}
