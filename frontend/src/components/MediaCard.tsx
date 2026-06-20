import type { MediaSummary } from "@whatsnew/shared/media"
import { Link } from "react-router-dom"
import { StatusBadge } from "./StatusBadge"

type MediaCardItem = MediaSummary & {
  dataSources?: string[]
}

export function MediaCard({ item }: { item: MediaCardItem }) {
  return (
    <article className="mediaCard">
      <Link to={`/media/${item.id}`} className="mediaCardLink">
        <div className="poster">
          {item.posterUrl ? <img src={item.posterUrl} alt="" /> : <span>{item.mediaType}</span>}
        </div>
        <div className="mediaCardBody">
          <p className="kicker">{item.mediaType}</p>
          <h3>{item.titleDisplay}</h3>
          <p>{item.releaseForm}</p>
          {item.dataSources && item.dataSources.length > 0 ? (
            <p>来源 {item.dataSources.join(" · ")}</p>
          ) : null}
          <div className="mediaCardMeta">
            <StatusBadge>{item.status}</StatusBadge>
            <strong>Heat {Math.round(item.heatScore)}</strong>
          </div>
        </div>
      </Link>
    </article>
  )
}
