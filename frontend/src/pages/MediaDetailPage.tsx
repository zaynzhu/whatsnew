import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { apiGet } from "../api/client"
import type {
  MediaDetailResponse,
  PopularityHistoryResponse,
  PopularitySignal
} from "../api/types"
import { StatusBadge } from "../components/StatusBadge"
import { sourceLabel } from "../utils/sourceLabel"

function timelineMovement(signal: Omit<PopularitySignal, "mediaItem">): string {
  if (signal.previousRank == null && signal.rank != null) return "新进榜"
  if ((signal.rankDelta ?? 0) > 0) return `上升 ${signal.rankDelta} 位`
  if ((signal.rankDelta ?? 0) < 0) return `下降 ${Math.abs(signal.rankDelta ?? 0)} 位`
  return "排名不变"
}

function timelineMovementClass(signal: Omit<PopularitySignal, "mediaItem">): string {
  if (signal.previousRank == null && signal.rank != null) return "movementNew"
  if ((signal.rankDelta ?? 0) > 0) return "movementUp"
  if ((signal.rankDelta ?? 0) < 0) return "movementDown"
  return "movementStable"
}

export function MediaDetailPage() {
  const { id } = useParams()
  const { data, isError, isLoading } = useQuery({
    queryKey: ["media", id],
    queryFn: () => apiGet<MediaDetailResponse>(`/api/media/${id}`),
    enabled: Boolean(id)
  })
  const historyQuery = useQuery({
    queryKey: ["popularity-history", id, 30],
    queryFn: () => apiGet<PopularityHistoryResponse>(
      `/api/media/${id}/popularity-history?days=30`
    ),
    enabled: Boolean(id)
  })

  if (isLoading) return <main className="page">加载中...</main>
  if (isError || !data) return <main className="page">作品详情加载失败</main>

  const historyGroups = (historyQuery.data?.items ?? []).reduce<
    Record<string, PopularityHistoryResponse["items"]>
  >((groups, signal) => {
    groups[signal.source] = [...(groups[signal.source] ?? []), signal]
    return groups
  }, {})
  const activeSourceRefs = data.sourceRefs.filter((sourceRef) => sourceRef.isActive)
  const inactiveSourceRefs = data.sourceRefs.filter((sourceRef) => !sourceRef.isActive)

  return (
    <main className="page">
      <section className="pageHeader detailHeader" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">{data.mediaType} · {data.releaseForm}</p>
          <h1 id="page-title">{data.titleDisplay}</h1>
          <p className="summary">{data.overview ?? "暂无简介"}</p>
          <div className="detailMeta">
            <StatusBadge>{data.status}</StatusBadge>
            <strong>Heat {Math.round(data.heatScore)}</strong>
            <span>{data.firstReleaseDate ?? "日期待定"}</span>
            {activeSourceRefs.length > 0 && (
              <span>数据来源 {activeSourceRefs.map((sourceRef) => sourceLabel(sourceRef.source)).join(" · ")}</span>
            )}
            {inactiveSourceRefs.length > 0 && (
              <span>历史来源 {inactiveSourceRefs.map((sourceRef) => sourceLabel(sourceRef.source)).join(" · ")}</span>
            )}
          </div>
        </div>
        <div className="poster detailPoster">
          {data.posterUrl ? <img src={data.posterUrl} alt="" /> : <span>{data.mediaType}</span>}
        </div>
      </section>

      <section className="contentSplit">
        <div className="sectionBlock">
          <div className="sectionTitle">
            <h2>发行记录</h2>
          </div>
          <div className="list">
            {data.releases.length > 0 ? (
              data.releases.map((release) => {
                const platformLabel = release.platform === "Unspecified"
                  ? "平台未提供"
                  : release.platform
                const episodeLabel = release.seasonNumber != null && release.episodeNumber != null
                  ? `S${release.seasonNumber} E${release.episodeNumber}${release.episodeTitle ? ` · ${release.episodeTitle}` : ""}`
                  : null

                return (
                  <article className="row" key={release.id}>
                    <strong>{platformLabel}</strong>
                    <span>{release.releaseDate ?? "日期待定"}</span>
                    {episodeLabel && <span>{episodeLabel}</span>}
                    <span>来源 {sourceLabel(release.source)}</span>
                    <StatusBadge>{release.releaseStatus}</StatusBadge>
                  </article>
                )
              })
            ) : (
              <p className="emptyText">暂无发行记录</p>
            )}
          </div>
        </div>

        <div className="sectionBlock">
          <div className="sectionTitle">
            <h2>热度信号</h2>
          </div>
          <div className="list">
            {data.popularitySignals.length > 0 ? (
              data.popularitySignals.map((signal) => (
                <article className="row" key={signal.id}>
                  <strong>{sourceLabel(signal.source)} #{signal.rank ?? "-"}</strong>
                  <span>{signal.valueLabel ?? signal.window}</span>
                  <span>{signal.platform ?? "未知平台"}</span>
                </article>
              ))
            ) : (
              <p className="emptyText">暂无热度信号</p>
            )}
          </div>
        </div>
      </section>

      <section className="sectionBlock popularityTimeline">
        <div className="sectionTitle">
          <h2>热度时间线</h2>
          <span>最近 30 天</span>
        </div>
        {historyQuery.isLoading ? (
          <p className="emptyText">加载中...</p>
        ) : historyQuery.isError ? (
          <p className="emptyText">热度时间线加载失败</p>
        ) : Object.keys(historyGroups).length > 0 ? (
          Object.entries(historyGroups).map(([source, signals]) => (
            <section className="timelineGroup" key={source} aria-labelledby={`timeline-${source}`}>
              <h3 id={`timeline-${source}`}>{sourceLabel(source)}</h3>
              <div className="timelineRows">
                {signals.map((signal) => (
                  <article className="timelineRow" key={signal.id}>
                    <time dateTime={signal.capturedAt}>
                      {new Intl.DateTimeFormat("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                      }).format(new Date(signal.capturedAt))}
                    </time>
                    <strong>#{signal.rank ?? "-"}</strong>
                    <span className={timelineMovementClass(signal)}>{timelineMovement(signal)}</span>
                    <span>{signal.valueLabel ?? signal.window}</span>
                  </article>
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="emptyText">暂无热度历史</p>
        )}
      </section>

      <section className="sectionBlock">
        <div className="sectionTitle">
          <h2>事件记录</h2>
        </div>
        <div className="list">
          {data.changeEvents.length > 0 ? (
            data.changeEvents.map((event) => (
              <article className="row eventRow" key={event.id}>
                <strong>{event.eventType}</strong>
                <span>{event.title}</span>
                <span>{event.description}</span>
              </article>
            ))
          ) : (
            <p className="emptyText">暂无事件记录</p>
          )}
        </div>
      </section>
    </main>
  )
}
