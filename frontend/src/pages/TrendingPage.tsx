import { useQuery } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { apiGet } from "../api/client"
import type {
  PopularityMovement,
  PopularitySignal,
  TrendingResponse
} from "../api/types"
import { MediaPoster } from "../components/MediaPoster"
import { SourceLink } from "../components/SourceLink"

const MOVEMENT_TABS: Array<{
  value: "" | PopularityMovement
  label: string
}> = [
  { value: "", label: "全部" },
  { value: "new", label: "新进" },
  { value: "rising", label: "上升" },
  { value: "falling", label: "下降" }
]

const SOURCE_OPTIONS = [
  ["tmdb_trending", "TMDb 电影趋势"],
  ["tmdb_tv_trending", "TMDb 剧集趋势"],
  ["trakt_trending", "Trakt 趋势榜"],
  ["trakt_anticipated", "Trakt 期待榜"],
  ["youku_hot", "优酷热度"],
  ["youku_reserve", "优酷预约"],
  ["iqiyi_reserve", "爱奇艺预约"],
  ["netflix_top10", "Netflix Top 10"],
  ["douban_upcoming", "豆瓣即将播出"],
  ["douban_top", "豆瓣 TOP250"]
]

const PLATFORM_OPTIONS = ["TMDb", "Trakt", "Youku", "iQIYI", "Netflix", "豆瓣"]

export function movementLabel(signal: PopularitySignal): string {
  if (signal.previousRank == null && signal.rank != null) return "新进榜"
  if ((signal.rankDelta ?? 0) > 0) return `上升 ${signal.rankDelta} 位`
  if ((signal.rankDelta ?? 0) < 0) return `下降 ${Math.abs(signal.rankDelta ?? 0)} 位`
  return "排名不变"
}

function movementClass(signal: PopularitySignal): string {
  if (signal.previousRank == null && signal.rank != null) return "movementNew"
  if ((signal.rankDelta ?? 0) > 0) return "movementUp"
  if ((signal.rankDelta ?? 0) < 0) return "movementDown"
  return "movementStable"
}

function capturedAtLabel(capturedAt: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(capturedAt))
}

function mediaTypeLabel(mediaType: string): string {
  const labels: Record<string, string> = {
    movie: "电影",
    series: "剧集",
    anime: "动画",
    documentary: "纪录片"
  }
  return labels[mediaType] ?? mediaType
}

export function TrendingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const movement = searchParams.get("movement") ?? ""
  const source = searchParams.get("source") ?? ""
  const platform = searchParams.get("platform") ?? ""
  const mediaType = searchParams.get("mediaType") ?? ""
  const apiParams = new URLSearchParams()

  if (movement) apiParams.set("movement", movement)
  if (source) apiParams.set("source", source)
  if (platform) apiParams.set("platform", platform)
  if (mediaType) apiParams.set("mediaType", mediaType)

  const queryString = apiParams.toString()
  const apiPath = `/api/trending${queryString ? `?${queryString}` : ""}`
  const { data, isError, isLoading } = useQuery({
    queryKey: ["trending", queryString],
    queryFn: () => apiGet<TrendingResponse>(apiPath)
  })

  function updateFilter(key: string, value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }

  const items = data?.items ?? []
  const works = Array.from(items.reduce((groups, signal) => {
    const existing = groups.get(signal.mediaItemId)
    if (existing) existing.push(signal)
    else groups.set(signal.mediaItemId, [signal])
    return groups
  }, new Map<string, PopularitySignal[]>())).map(([, signals]) => ({
    mediaItem: signals[0].mediaItem,
    signals
  }))

  if (!source) {
    works.sort((left, right) => right.mediaItem.heatScore - left.mediaItem.heatScore)
  }

  return (
    <main className="page">
      <section className="pageHeader simple" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">异动监测</p>
          <h1 id="page-title">热度榜</h1>
          <p className="summary">跨来源信号按排名与抓取窗口聚合，优先呈现可复核的榜单来源。</p>
        </div>
      </section>

      <section className="trendingToolbar" aria-label="热度筛选">
        <div className="movementTabs" role="tablist" aria-label="排名变化">
          {MOVEMENT_TABS.map((tab) => (
            <button
              aria-selected={movement === tab.value}
              key={tab.value || "all"}
              onClick={() => updateFilter("movement", tab.value)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="trendingSelects">
          <label>
            <span>热度来源</span>
            <select value={source} onChange={(event) => updateFilter("source", event.target.value)}>
              <option value="">全部来源</option>
              {SOURCE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>平台</span>
            <select value={platform} onChange={(event) => updateFilter("platform", event.target.value)}>
              <option value="">全部平台</option>
              {PLATFORM_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>类型</span>
            <select value={mediaType} onChange={(event) => updateFilter("mediaType", event.target.value)}>
              <option value="">电影与剧集</option>
              <option value="movie">电影</option>
              <option value="series">剧集</option>
              <option value="anime">动画</option>
              <option value="documentary">纪录片</option>
            </select>
          </label>
        </div>
      </section>

      <div className="trendingList">
        {isLoading ? (
          <p className="emptyText">加载中...</p>
        ) : isError ? (
          <p className="emptyText">热度榜加载失败</p>
        ) : works.length > 0 ? (
          works.map(({ mediaItem, signals }, index) => {
            const primarySignal = signals[0]

            return (
              <article className="trendingCard" key={mediaItem.id}>
                <Link className="trendingPosterLink" to={`/media/${mediaItem.id}`}>
                  <div className="trendingPoster">
                    <MediaPoster
                      mediaId={mediaItem.id}
                      posterUrl={mediaItem.posterUrl}
                      title={mediaItem.titleDisplay}
                      fallbackLabel={mediaItem.titleDisplay}
                      priority={index < 5}
                    />
                    <span className="trendingMediaType">
                      {mediaTypeLabel(mediaItem.mediaType)}
                    </span>
                    <strong className="trendingHeatScore">Heat {Math.round(mediaItem.heatScore)}</strong>
                    {signals.length > 1 ? (
                      <span className="trendingSignalCount">{signals.length} 个榜单</span>
                    ) : null}
                    {source ? (
                      <strong className="rankPosition">#{primarySignal.rank ?? "-"}</strong>
                    ) : null}
                  </div>
                </Link>

                <div className="trendingCardBody">
                  <div className="trendingCardProvenance">
                    <span>{signals.length} 条热度信号</span>
                    <time dateTime={primarySignal.capturedAt}>{capturedAtLabel(primarySignal.capturedAt)}</time>
                  </div>
                  <Link className="rankTitle" to={`/media/${mediaItem.id}`}>
                    <strong>{mediaItem.titleDisplay}</strong>
                    <span>{primarySignal.platform ?? primarySignal.region ?? "全局"}</span>
                  </Link>
                  <div className="trendingSignalList">
                    {signals.map((signal) => (
                      <div className="trendingSignalRow" key={signal.id}>
                        <span className="rankSource">
                          <SourceLink source={signal.source} sourceUrl={signal.sourceUrl} prefix={null} />
                          <small>{signal.valueLabel ?? signal.window}</small>
                        </span>
                        <span className="trendingSignalRank">
                          <strong>#{signal.rank ?? "-"}</strong>
                          <span className={movementClass(signal)}>{movementLabel(signal)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            )
          })
        ) : (
          <p className="emptyText">暂无热度信号</p>
        )}
      </div>
    </main>
  )
}
