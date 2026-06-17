import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"
import type { TrendingResponse } from "../api/types"

export function TrendingPage() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["trending"],
    queryFn: () => apiGet<TrendingResponse>("/api/trending")
  })

  if (isLoading) return <main className="page">加载中...</main>
  if (isError) return <main className="page">热度榜加载失败</main>

  const items = data?.items ?? []

  return (
    <main className="page">
      <section className="pageHeader simple" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">异动监测</p>
          <h1 id="page-title">热度榜</h1>
          <p className="summary">跨来源信号按排名与抓取窗口聚合，优先呈现可复核的榜单来源。</p>
        </div>
      </section>

      <div className="list">
        {items.length > 0 ? (
          items.map((signal) => (
            <article className="row rankRow" key={signal.id}>
              <strong>{signal.mediaItem.titleDisplay}</strong>
              <span>{signal.source} #{signal.rank ?? "-"}</span>
              <span>{signal.valueLabel ?? `${signal.window} window`}</span>
            </article>
          ))
        ) : (
          <p className="emptyText">暂无热度信号</p>
        )}
      </div>
    </main>
  )
}
