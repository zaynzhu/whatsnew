import { useQuery } from "@tanstack/react-query"
import { RotateCcw, SlidersHorizontal } from "lucide-react"
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
  ["youku_reserve", "优酷预约"],
  ["iqiyi_reserve", "爱奇艺预约"],
  ["tencent_reserve", "腾讯视频预约"],
  ["netflix_top10", "Netflix Top 10"],
  ["douban_upcoming", "豆瓣即将播出"],
  ["douban_top", "豆瓣 TOP250"]
]

const PLATFORM_OPTIONS = ["TMDb", "Trakt", "优酷", "爱奇艺", "腾讯视频", "Netflix", "豆瓣"]

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

function sourceTone(source: string): string {
  if (source.startsWith("iqiyi") || source.startsWith("youku") || source.startsWith("tencent")) return "domestic"
  if (source.startsWith("trakt")) return "trakt"
  if (source.startsWith("tmdb")) return "tmdb"
  if (source.startsWith("netflix")) return "netflix"
  if (source.startsWith("douban")) return "douban"
  return "default"
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value)
}

function signalMetric(signal: PopularitySignal): string {
  if (signal.source === "tencent_reserve" && signal.valueLabel) return signal.valueLabel
  if (signal.source.endsWith("_reserve") && signal.value != null) {
    return `${compactNumber(signal.value)} 人预约`
  }
  return signal.valueLabel ?? (signal.value != null ? compactNumber(signal.value) : signal.window)
}

export function trendingPosterUrl(signal: Pick<PopularitySignal, "source">, posterUrl: string | null): string | null {
  if (signal.source !== "iqiyi_reserve" || !posterUrl) return posterUrl
  if (!/^https?:\/\/[^/]*iqiyipic\.com\//i.test(posterUrl)) return posterUrl

  return posterUrl.replace(/_\d{2,4}_\d{2,4}(?=\.(?:jpe?g|webp|png)(?:[?#]|$))/i, "_579_772")
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

  const selectedSourceLabel = SOURCE_OPTIONS.find(([value]) => value === source)?.[1] ?? "全部榜单来源"
  const hasFilters = Boolean(movement || source || platform || mediaType)

  function clearFilters() {
    setSearchParams({}, { replace: true })
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

      <section className="trendingControlDeck" aria-label="热度筛选">
        <div className="trendingControlHeader">
          <div className="trendingControlTitle">
            <SlidersHorizontal aria-hidden="true" size={18} />
            <span>榜单控制台</span>
            <strong>{selectedSourceLabel}</strong>
          </div>
          <div className="trendingControlResult" aria-live="polite">
            <strong>{isLoading ? "--" : works.length}</strong>
            <span>部作品</span>
          </div>
          <button
            className="trendingResetButton"
            disabled={!hasFilters}
            onClick={clearFilters}
            title="清除筛选"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
            <span>重置</span>
          </button>
        </div>

        <div className="trendingSelects">
          <label className="trendingSourceSelect">
            <span>榜单来源</span>
            <select aria-label="热度来源" value={source} onChange={(event) => updateFilter("source", event.target.value)}>
              <option value="">全部来源</option>
              {SOURCE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>信号平台</span>
            <select aria-label="平台" value={platform} onChange={(event) => updateFilter("platform", event.target.value)}>
              <option value="">全部平台</option>
              {PLATFORM_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>影视类型</span>
            <select value={mediaType} onChange={(event) => updateFilter("mediaType", event.target.value)}>
              <option value="">电影与剧集</option>
              <option value="movie">电影</option>
              <option value="series">剧集</option>
              <option value="anime">动画</option>
              <option value="documentary">纪录片</option>
            </select>
          </label>
        </div>

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
      </section>

      <div className="trendingList">
        {isLoading ? (
          <p className="emptyText">加载中...</p>
        ) : isError ? (
          <p className="emptyText">热度榜加载失败</p>
        ) : works.length > 0 ? (
          works.map(({ mediaItem, signals }, index) => {
            const primarySignal = signals[0]
            const posterUrl = trendingPosterUrl(primarySignal, mediaItem.posterUrl)

            return (
              <article className={`trendingCard ${sourceTone(primarySignal.source)}`} key={mediaItem.id}>
                <Link className="trendingPosterLink" to={`/media/${mediaItem.id}`}>
                  <div className="trendingPoster">
                    <MediaPoster
                      mediaId={mediaItem.id}
                      posterUrl={posterUrl}
                      title={mediaItem.titleDisplay}
                      fallbackLabel={mediaItem.titleDisplay}
                      priority={index < 5}
                      proxyFirst={primarySignal.source !== "iqiyi_reserve"}
                    />
                    <span className="trendingMediaType">
                      {mediaTypeLabel(mediaItem.mediaType)}
                    </span>
                    <strong className="trendingPosterRank">#{primarySignal.rank ?? index + 1}</strong>
                  </div>
                </Link>

                <div className="trendingCardBody">
                  <div className="trendingCardProvenance">
                    <span>{signals.length > 1 ? `${signals.length} 个榜单` : mediaTypeLabel(mediaItem.mediaType)}</span>
                    <time dateTime={primarySignal.capturedAt}>{capturedAtLabel(primarySignal.capturedAt)}</time>
                  </div>
                  <div className="trendingRankLine">
                    <span className={movementClass(primarySignal)}>{movementLabel(primarySignal)}</span>
                    <small className="trendingCompositeHeat">Heat {Math.round(mediaItem.heatScore)}</small>
                  </div>
                  <Link className="rankTitle" to={`/media/${mediaItem.id}`}>
                    <strong>{mediaItem.titleDisplay}</strong>
                    <span>{primarySignal.platform ?? primarySignal.region ?? "全局"}</span>
                  </Link>
                  <div className="trendingMetricRow">
                    <strong className="trendingPrimaryMetric">{signalMetric(primarySignal)}</strong>
                    <span className="rankSource trendingPrimarySource">
                      <SourceLink source={primarySignal.source} sourceUrl={primarySignal.sourceUrl} prefix={null} />
                    </span>
                  </div>
                  <div className="trendingSignalList">
                    {signals.slice(1).map((signal) => (
                      <div className="trendingSignalRow" key={signal.id}>
                        <span className="rankSource">
                          <SourceLink source={signal.source} sourceUrl={signal.sourceUrl} prefix={null} />
                          <small>{signalMetric(signal)}</small>
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
