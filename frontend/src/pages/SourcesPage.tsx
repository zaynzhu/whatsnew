import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"
import type { SourcesResponse } from "../api/types"
import { StatusBadge } from "../components/StatusBadge"

export function SourcesPage() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => apiGet<SourcesResponse>("/api/sources")
  })

  if (isLoading) return <main className="page">加载中...</main>
  if (isError) return <main className="page">数据源状态加载失败</main>

  const items = data?.items ?? []

  return (
    <main className="page">
      <section className="pageHeader simple" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">采集网络</p>
          <h1 id="page-title">数据源状态</h1>
          <p className="summary">查看最近同步运行、采集数量和失败原因，MVP 阶段仅展示已有后端数据。</p>
        </div>
      </section>

      <div className="list">
        {items.length > 0 ? (
          items.map((run) => (
            <article className="row sourceRow" key={run.id}>
              <strong>{run.source}</strong>
              <StatusBadge>{run.status}</StatusBadge>
              <span>{run.itemCount} 条</span>
              <span>{run.errorMessage ?? "无错误"}</span>
            </article>
          ))
        ) : (
          <p className="emptyText">暂无同步记录</p>
        )}
      </div>
    </main>
  )
}
