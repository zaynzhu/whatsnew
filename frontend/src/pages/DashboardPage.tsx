import { CalendarClock, Database, Flame, RadioTower } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"
import type { DashboardResponse } from "../api/types"
import { MediaCard } from "../components/MediaCard"
import { StatusBadge } from "../components/StatusBadge"

type MetricPanelProps = {
  icon: LucideIcon
  label: string
  value: string
}

export function DashboardPage() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardResponse>("/api/dashboard")
  })

  if (isLoading) return <main className="page">加载中...</main>
  if (isError) return <main className="page">情报台数据加载失败</main>

  const today = data?.today ?? []
  const week = data?.week ?? []
  const trending = data?.trending ?? []
  const events = data?.events ?? []
  const sources = data?.sources ?? []

  return (
    <main className="page">
      <section className="pageHeader" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">全球档期</p>
          <h1 id="page-title">新片新剧雷达</h1>
          <p className="summary">今日值守院线、流媒体、剧集档期与热度异动，优先看可行动的数据。</p>
        </div>
        <div className="signalPanel fresh" aria-label="监控状态">
          <span>ON AIR</span>
          <strong>{sources.length} 源</strong>
        </div>
      </section>

      <section className="dashboardGrid" aria-label="情报概览">
        <MetricPanel icon={CalendarClock} label="今日上线" value={`${today.length} 条`} />
        <MetricPanel icon={RadioTower} label="本周新片新剧" value={`${week.length} 条`} />
        <MetricPanel icon={Flame} label="热度上升" value={`${trending.length} 条`} />
        <MetricPanel icon={Database} label="数据源状态" value={`${sources.length} 条`} />
      </section>

      <section className="contentSplit">
        <div className="sectionBlock">
          <div className="sectionTitle">
            <h2>热度雷达</h2>
            <Link to="/trending">查看榜单</Link>
          </div>
          <div className="mediaGrid compact">
            {trending.length > 0 ? (
              trending.slice(0, 4).map((item) => <MediaCard key={item.id} item={item} />)
            ) : (
              <p className="emptyText">暂无热度数据</p>
            )}
          </div>
        </div>

        <div className="sectionBlock">
          <div className="sectionTitle">
            <h2>事件流</h2>
          </div>
          <div className="list">
            {events.length > 0 ? (
              events.slice(0, 5).map((event) => (
                <article className="row eventRow" key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{event.description}</span>
                  <span>{event.source}</span>
                </article>
              ))
            ) : (
              <p className="emptyText">暂无事件</p>
            )}
          </div>
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionTitle">
          <h2>今日上线</h2>
          <Link to="/calendar">查看日历</Link>
        </div>
        <div className="list">
          {today.length > 0 ? (
            today.map((release) => (
              <article className="row" key={release.id}>
                <strong>{release.mediaItem.titleDisplay}</strong>
                <span>{release.platform} · {release.region}</span>
                <StatusBadge>{release.releaseStatus}</StatusBadge>
              </article>
            ))
          ) : (
            <p className="emptyText">今日暂无上线记录</p>
          )}
        </div>
      </section>
    </main>
  )
}

function MetricPanel({ icon: Icon, label, value }: MetricPanelProps) {
  return (
    <article className="panel">
      <Icon aria-hidden="true" size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
