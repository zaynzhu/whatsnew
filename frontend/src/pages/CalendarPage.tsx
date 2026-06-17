import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"
import type { CalendarResponse } from "../api/types"
import { StatusBadge } from "../components/StatusBadge"

const CALENDAR_PATH = "/api/calendar?from=2026-06-17&to=2026-06-30"

export function CalendarPage() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["calendar"],
    queryFn: () => apiGet<CalendarResponse>(CALENDAR_PATH)
  })

  if (isLoading) return <main className="page">加载中...</main>
  if (isError) return <main className="page">播出日历加载失败</main>

  const items = data?.items ?? []

  return (
    <main className="page">
      <section className="pageHeader simple" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">排期视图</p>
          <h1 id="page-title">播出日历</h1>
          <p className="summary">默认展示 2026-06-17 至 2026-06-30 的上线窗口。</p>
        </div>
      </section>

      <div className="list">
        {items.length > 0 ? (
          items.map((release) => (
            <article className="row calendarRow" key={release.id}>
              <strong>{release.releaseDate ?? "日期待定"}</strong>
              <span>{release.mediaItem.titleDisplay}</span>
              <span>{release.platform} · {release.region}</span>
              <StatusBadge>{release.releaseStatus}</StatusBadge>
            </article>
          ))
        ) : (
          <p className="emptyText">暂无日历记录</p>
        )}
      </div>
    </main>
  )
}
