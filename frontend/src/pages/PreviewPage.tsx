import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Film, RefreshCw, Settings2, Telescope, Tv, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { apiGet, apiRequest } from "../api/client"
import type { PreviewResponse, ReleaseRow } from "../api/types"
import { MediaPoster } from "../components/MediaPoster"
import { SourceLink } from "../components/SourceLink"

type PreviewFilter = "all" | "movie" | "series"

const FILTERS: Array<{ value: PreviewFilter, label: string }> = [
  { value: "all", label: "全部" },
  { value: "movie", label: "电影" },
  { value: "series", label: "剧集" }
]

function dateParts(date: string) {
  const parsed = new Date(`${date}T12:00:00+08:00`)
  return {
    monthKey: date.slice(0, 7),
    month: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long" }).format(parsed),
    day: date.slice(8, 10),
    weekday: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(parsed)
  }
}

function listValue(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

function sourceUpdateLabel(value: string | null): string {
  if (!value) return "尚未成功同步"
  return `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value))}`
}

export function PreviewPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<PreviewFilter>("all")
  const [selected, setSelected] = useState<ReleaseRow | null>(null)
  const query = useQuery({
    queryKey: ["preview"],
    queryFn: () => apiGet<PreviewResponse>("/api/preview"),
    refetchInterval: (state) => state.state.data?.source.syncing ? 5000 : false
  })
  const syncMutation = useMutation({
    mutationFn: () => apiRequest("/api/preview/sync", "POST", {}),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["preview"] })
  })

  useEffect(() => {
    if (!selected) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [selected])

  const data = query.data
  const days = useMemo(() => (data?.days ?? []).map((day) => ({
    ...day,
    items: day.items.filter((item) => filter === "all" || item.mediaItem.mediaType === filter)
  })).filter((day) => day.items.length > 0), [data?.days, filter])
  const undated = (data?.undated ?? []).filter((item) => filter === "all" || item.mediaItem.mediaType === filter)
  const syncing = Boolean(data?.source.syncing || syncMutation.isPending)

  if (query.isLoading) return <main className="page previewPage">加载前瞻时间线...</main>
  if (query.isError || !data) return <main className="page previewPage">前瞻数据加载失败</main>

  let previousMonth = ""

  return (
    <main className="page previewPage">
      <section className="previewMasthead" aria-labelledby="preview-title">
        <div>
          <p className="eyebrow">豆瓣前瞻</p>
          <h1 id="preview-title">待映 · 待播</h1>
          <p className="summary">沿时间线查看即将上映的电影与即将播出的剧集。</p>
        </div>
        <div className="previewPulse" aria-label="前瞻数据状态">
          <Telescope aria-hidden="true" size={22} />
          <strong>{data.summary.total}</strong>
          <span>部作品在路上</span>
        </div>
      </section>

      <section className="previewControls" aria-label="前瞻筛选与同步">
        <div className="previewTabs" role="tablist" aria-label="作品类型">
          {FILTERS.map((item) => (
            <button
              aria-selected={filter === item.value}
              key={item.value}
              onClick={() => setFilter(item.value)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="previewSourceState">
          <span>{sourceUpdateLabel(data.source.lastSuccessAt)}</span>
          {data.source.enabled ? (
            <button
              className="iconTextButton"
              disabled={syncing || !data.source.runnable}
              onClick={() => syncMutation.mutate()}
              type="button"
            >
              <RefreshCw aria-hidden="true" className={syncing ? "spin" : ""} size={16} />
              {syncing ? "同步中" : "立即同步"}
            </button>
          ) : (
            <Link className="iconTextButton" to="/settings">
              <Settings2 aria-hidden="true" size={16} />
              前往设置
            </Link>
          )}
        </div>
      </section>

      {!data.source.enabled ? (
        <section className="previewNotice warning">豆瓣数据源未启用，开启后才能刷新前瞻片单。</section>
      ) : syncMutation.isError ? (
        <section className="previewNotice warning">同步请求失败，当前继续展示已有数据，请稍后重试。</section>
      ) : data.source.latestRun?.status === "failed" ? (
        <section className="previewNotice warning">
          最近同步失败，当前继续展示上次成功数据。{data.source.latestRun.errorMessage}
        </section>
      ) : null}

      {days.length > 0 ? (
        <section className="previewTimeline" aria-label="豆瓣待映待播时间线">
          {days.map((day, index) => {
            const parts = dateParts(day.date)
            const showMonth = parts.monthKey !== previousMonth
            previousMonth = parts.monthKey
            return (
              <div className={`previewTimelineEntry ${index % 2 === 0 ? "left" : "right"}`} key={day.date}>
                {showMonth ? <div className="previewMonthMarker">{parts.month}</div> : null}
                <div className={`previewDateNode ${day.date === data.today ? "today" : ""}`}>
                  <strong>{parts.day}</strong>
                  <span>{day.date === data.today ? "今天" : parts.weekday}</span>
                </div>
                <div className="previewDayShelf">
                  {day.items.map((release) => (
                    <PreviewPoster key={release.id} release={release} onOpen={setSelected} />
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      ) : (
        <section className="previewEmpty">
          <Telescope aria-hidden="true" size={30} />
          <strong>{data.source.enabled ? "还没有待映待播数据" : "等待启用豆瓣"}</strong>
          <span>{data.source.enabled ? "运行一次同步后，作品会沿时间线出现在这里。" : "请先在设置中启用豆瓣数据源。"}</span>
        </section>
      )}

      {undated.length > 0 ? (
        <section className="previewUndated" aria-labelledby="undated-title">
          <div>
            <p className="eyebrow">时间线终点</p>
            <h2 id="undated-title">待定档</h2>
            <span>{undated.length} 部作品仍在等待明确日期</span>
          </div>
          <div className="previewUndatedRail">
            {undated.map((release) => (
              <PreviewPoster key={release.id} release={release} onOpen={setSelected} />
            ))}
          </div>
        </section>
      ) : null}

      {selected ? <PreviewDrawer release={selected} onClose={() => setSelected(null)} /> : null}
    </main>
  )
}

function PreviewPoster({ release, onOpen }: { release: ReleaseRow, onOpen: (release: ReleaseRow) => void }) {
  const Icon = release.mediaItem.mediaType === "movie" ? Film : Tv
  return (
    <button className="previewPosterCard" onClick={() => onOpen(release)} type="button">
      <div className="previewPosterImage">
        <MediaPoster
          mediaId={release.mediaItem.id}
          posterUrl={release.mediaItem.posterUrl}
          title={release.mediaItem.titleDisplay}
          fallbackLabel={release.mediaItem.titleDisplay}
        />
      </div>
      <span><Icon aria-hidden="true" size={12} />{release.mediaItem.mediaType === "movie" ? "电影" : "剧集"}</span>
      <strong>{release.mediaItem.titleDisplay}</strong>
    </button>
  )
}

function PreviewDrawer({ release, onClose }: { release: ReleaseRow, onClose: () => void }) {
  const countries = listValue(release.mediaItem.productionCountries ?? "[]")
  const genres = listValue(release.mediaItem.genres ?? "[]")
  return (
    <div className="previewDrawerBackdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside aria-labelledby="preview-drawer-title" aria-modal="true" className="previewDrawer" role="dialog">
        <button aria-label="关闭详情" className="dialogCloseButton" onClick={onClose} type="button">
          <X aria-hidden="true" size={20} />
        </button>
        <div className="previewDrawerPoster">
          <MediaPoster
            mediaId={release.mediaItem.id}
            posterUrl={release.mediaItem.posterUrl}
            title={release.mediaItem.titleDisplay}
            fallbackLabel={release.mediaItem.titleDisplay}
            priority
          />
        </div>
        <div className="previewDrawerBody">
          <p className="eyebrow">{release.mediaItem.mediaType === "movie" ? "电影待映" : "剧集待播"}</p>
          <h2 id="preview-drawer-title">{release.mediaItem.titleDisplay}</h2>
          <strong>{release.releaseDate ?? "日期待定"}</strong>
          <div className="previewDrawerTags">
            {[...countries, ...genres].map((item) => <span key={item}>{item}</span>)}
          </div>
          <SourceLink source="douban" sourceUrl={release.sourceUrl} />
          <Link className="primaryButton" to={`/media/${release.mediaItem.id}`}>查看完整详情</Link>
        </div>
      </aside>
    </div>
  )
}
