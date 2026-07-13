import { ExternalLink, X } from "lucide-react"
import { useEffect } from "react"
import type { SourcePreviewResponse } from "../api/types"

type SourcePreviewDialogProps = {
  sourceName: string
  preview: SourcePreviewResponse
  onClose: () => void
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: "电影",
  series: "剧集",
  anime: "动画",
  variety: "综艺",
  short_drama: "短剧",
  documentary: "纪录片"
}

const RELEASE_PATTERN_LABELS: Record<string, string> = {
  catalog_addition: "平台上新",
  theatrical_release: "院线上映",
  series_premiere: "剧集首播",
  episode_release: "单集播出",
  full_season: "整季上线",
  weekly_release: "周更",
  popularity_snapshot: "热度快照"
}

function dateLabel(value: string | null): string {
  if (!value) return "日期待定"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date)
}

export function SourcePreviewDialog({ sourceName, preview, onClose }: SourcePreviewDialogProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  const mediaTypeSummary = Object.entries(preview.mediaTypes)
    .map(([type, count]) => `${MEDIA_TYPE_LABELS[type] ?? type} ${count}`)
    .join(" · ")
  const releasePatternSummary = Object.entries(preview.releasePatterns)
    .map(([pattern, count]) => `${RELEASE_PATTERN_LABELS[pattern] ?? pattern} ${count}`)
    .join(" · ")

  return (
    <div className="dialogBackdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="sourceDialog sourcePreviewDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-preview-dialog-title"
      >
        <header className="dialogHeader">
          <div>
            <span className="settingsIndex">PREVIEW / 不写入数据库</span>
            <h2 id="source-preview-dialog-title">预览 {sourceName}</h2>
          </div>
          <button
            type="button"
            className="dialogCloseButton"
            autoFocus
            aria-label={`关闭${sourceName}预览`}
            title="关闭"
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <dl className="sourcePreviewSummary">
          <div>
            <dt>本次获取</dt>
            <dd>{preview.itemCount} 条</dd>
          </div>
          <div>
            <dt>带图片</dt>
            <dd>{preview.withPoster} 条</dd>
          </div>
          <div>
            <dt>来源日期</dt>
            <dd>{preview.releaseDateStart
              ? `${dateLabel(preview.releaseDateStart)} 至 ${dateLabel(preview.releaseDateEnd)}`
              : "未提供"}</dd>
          </div>
          <div>
            <dt>内容构成</dt>
            <dd>{mediaTypeSummary || "未识别"}</dd>
          </div>
        </dl>

        <div className="sourcePreviewSignals">
          {preview.scopes.map((scope) => (
            <span key={scope.scope}>{scope.scope} · {scope.itemCount}</span>
          ))}
          {releasePatternSummary && <span>{releasePatternSummary}</span>}
        </div>

        <div className="sourcePreviewList">
          {preview.samples.map((item, index) => (
            <article className="sourcePreviewItem" key={`${item.scope}-${item.title}-${index}`}>
              <div className="sourcePreviewPoster">
                <span>{item.title.slice(0, 1)}</span>
                {item.posterUrl && (
                  <img
                    src={item.posterUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.hidden = true
                    }}
                  />
                )}
              </div>
              <div className="sourcePreviewItemBody">
                <div className="sourcePreviewItemHeading">
                  <div>
                    <span>{MEDIA_TYPE_LABELS[item.mediaType] ?? item.mediaType} · {item.scope}</span>
                    <h3>{item.title}</h3>
                  </div>
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开${item.title}来源`}>
                      <ExternalLink aria-hidden="true" size={16} />
                    </a>
                  )}
                </div>
                <p>{dateLabel(item.releaseDate ?? item.firstReleaseDate)}</p>
                <small>
                  {[item.platform, item.region, item.releasePattern
                    ? RELEASE_PATTERN_LABELS[item.releasePattern] ?? item.releasePattern
                    : null].filter(Boolean).join(" · ") || item.releaseForm}
                </small>
              </div>
            </article>
          ))}
        </div>

        {preview.samples.length === 0 && <p className="emptyText">本次没有获取到可预览内容</p>}

        <footer className="dialogActions">
          <span className="sourcePreviewFetchedAt">
            获取于 {new Intl.DateTimeFormat("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            }).format(new Date(preview.fetchedAt))}
          </span>
          <button type="button" className="secondaryButton" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>
  )
}
