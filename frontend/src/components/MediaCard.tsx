import type { MediaSummary } from "@whatsnew/shared/media"
import { Link } from "react-router-dom"
import { StatusBadge } from "./StatusBadge"

export function MediaCard({ item }: { item: MediaSummary }) {
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
          <div className="mediaCardMeta">
            <StatusBadge>{item.status}</StatusBadge>
            <strong>Heat {Math.round(item.heatScore)}</strong>
          </div>
        </div>
      </Link>
    </article>
  )
}
