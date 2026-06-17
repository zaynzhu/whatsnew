import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { apiGet } from "../api/client"
import type { MediaDetailResponse } from "../api/types"
import { StatusBadge } from "../components/StatusBadge"

export function MediaDetailPage() {
  const { id } = useParams()
  const { data, isError, isLoading } = useQuery({
    queryKey: ["media", id],
    queryFn: () => apiGet<MediaDetailResponse>(`/api/media/${id}`),
    enabled: Boolean(id)
  })

  if (isLoading) return <main className="page">加载中...</main>
  if (isError || !data) return <main className="page">作品详情加载失败</main>

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
              data.releases.map((release) => (
                <article className="row" key={release.id}>
                  <strong>{release.platform}</strong>
                  <span>{release.releaseDate ?? "日期待定"}</span>
                  <StatusBadge>{release.releaseStatus}</StatusBadge>
                </article>
              ))
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
                  <strong>{signal.source} #{signal.rank ?? "-"}</strong>
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
