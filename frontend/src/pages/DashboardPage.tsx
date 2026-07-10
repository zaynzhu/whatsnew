import { CalendarClock, Database, Flame, Globe2, RadioTower, SignalHigh } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"
import type { DashboardResponse } from "../api/types"
import { MediaCard } from "../components/MediaCard"
import { MediaPoster } from "../components/MediaPoster"
import { StatusBadge } from "../components/StatusBadge"
import { sourceLabel } from "../utils/sourceLabel"
import { eventStyle } from "../utils/eventStyle"

type MetricPanelProps = {
  icon: LucideIcon
  label: string
  value: string
  tone: "heat" | "date" | "data" | "source"
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
  const featured = data?.featured ?? []
  const trending = data?.trending ?? []
  const events = data?.events ?? []
  const sources = data?.sources ?? []
  const showcaseItems = featured.length > 0
    ? featured
    : [...today.map((release) => release.mediaItem), ...week.map((release) => release.mediaItem), ...trending]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, 5)
  const heroItem = showcaseItems[0]
  const posterStripItems = showcaseItems.slice(1)
  const freshSignals = events.filter((event) => event.eventType === "release_date_added").length
  const activeSourceCount = new Set(sources.map((source) => source.source)).size
  const alertSourceCount = sources.filter((source) => source.status === "failed" || source.status === "partial").length

  return (
    <main className="page">
      <section className="pageHeader dashboardHeader" aria-labelledby="page-title">
        {heroItem ? (
          <div className="dashboardBackdrop" aria-hidden="true">
            <MediaPoster
              mediaId={heroItem.id}
              posterUrl={heroItem.posterUrl}
              title={heroItem.titleDisplay}
              fallbackLabel={heroItem.titleDisplay}
              priority
              proxyFirst
            />
          </div>
        ) : null}

        <div className="dashboardIntro">
          <p className="eyebrow">全球档期</p>
          <h1 id="page-title">新片新剧雷达</h1>
          <p className="summary">今日值守院线、流媒体、剧集档期与热度异动，优先看可行动的数据。</p>

          <div className="signalStack">
            <div className="signalStrip signalStripFresh">
              <SignalHigh aria-hidden="true" size={16} />
              <span>{freshSignals} 条新信号</span>
            </div>
            <div className="signalStrip signalStripGlobal">
              <Globe2 aria-hidden="true" size={16} />
              <span>{activeSourceCount} 个平台在线</span>
            </div>
          </div>
        </div>

        <div className="dashboardHeroMedia">
          {heroItem ? (
            <Link className="heroPosterFeature" to={`/media/${heroItem.id}`}>
              <div className="poster heroPoster">
                <MediaPoster
                  mediaId={heroItem.id}
                  posterUrl={heroItem.posterUrl}
                  title={heroItem.titleDisplay}
                  fallbackLabel={heroItem.titleDisplay}
                  priority
                  proxyFirst
                />
              </div>
              <div className="heroPosterCaption">
                <span>{heroItem.mediaType}</span>
                <strong>{heroItem.titleDisplay}</strong>
              </div>
            </Link>
          ) : (
            <div className="heroPosterFeature heroPosterEmpty">
              <span>等待新片新剧</span>
            </div>
          )}

          <div className="dashboardPosterStack" aria-label="新作品海报">
            {posterStripItems.map((item, index) => (
              <Link
                className={`dashboardPosterCard posterSlot-${index}`}
                key={item.id}
                to={`/media/${item.id}`}
              >
                <div className="poster">
                  <MediaPoster
                    mediaId={item.id}
                    posterUrl={item.posterUrl}
                    title={item.titleDisplay}
                    fallbackLabel={item.titleDisplay}
                  />
                </div>
              </Link>
            ))}
          </div>

          <div className="signalPanel fresh" aria-label="监控状态">
            <span>ON AIR</span>
            <strong>{sources.length} 源</strong>
          </div>
        </div>
      </section>

      <section className="dashboardGrid" aria-label="情报概览">
        <MetricPanel icon={CalendarClock} label="今日上线" value={`${today.length} 条`} tone="date" />
        <MetricPanel icon={RadioTower} label="未来 14 天" value={`${week.length} 条`} tone="source" />
        <MetricPanel icon={Flame} label="热度上升" value={`${trending.length} 条`} tone="heat" />
        <MetricPanel
          icon={Database}
          label="数据源状态"
          value={alertSourceCount > 0 ? `${alertSourceCount} 个需关注` : `${sources.length} 条`}
          tone="data"
        />
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
              events.slice(0, 5).map((event) => {
                const style = eventStyle(event.eventType)
                return (
                  <article className={`row eventRow event-${style.tone}`} key={event.id}>
                    <span className="eventTag">{style.label}</span>
                    <strong>{event.title}</strong>
                    <span>{event.description}</span>
                    <span>{event.source}</span>
                  </article>
                )
              })
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
                <span>来源 {sourceLabel(release.source)}</span>
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

function MetricPanel({ icon: Icon, label, value, tone }: MetricPanelProps) {
  return (
    <article className={`panel metricPanel metricPanel-${tone}`}>
      <Icon aria-hidden="true" size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
