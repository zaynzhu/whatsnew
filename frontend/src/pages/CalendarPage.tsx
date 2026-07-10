import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, ChevronLeft, ChevronRight, Film, Tv } from "lucide-react"
import { Link } from "react-router-dom"
import { apiGet } from "../api/client"
import type { CalendarResponse, ReleaseRow } from "../api/types"
import { MediaPoster } from "../components/MediaPoster"
import { SourceLink } from "../components/SourceLink"
import { StatusBadge } from "../components/StatusBadge"

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
const MAX_VISIBLE_RELEASES = 24

type MediaTypeFilter = "" | "movie" | "series"

type CalendarCell = {
  date: Date
  dateKey: string
  inCurrentMonth: boolean
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day, 12)
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12)
}

function shiftMonth(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12)
}

function monthRange(date: Date): { from: string; to: string } {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)
  return { from: localDateKey(date), to: localDateKey(lastDay) }
}

function calendarCells(month: Date): CalendarCell[] {
  const firstWeekday = (month.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index - firstWeekday + 1, 12)
    return {
      date,
      dateKey: localDateKey(date),
      inCurrentMonth: date.getMonth() === month.getMonth()
    }
  })
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

function selectedDateLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(dateFromKey(value))
}

function platformLabel(platform: string): string {
  return platform === "Unspecified" ? "平台待确认" : platform
}

function episodeLabel(release: ReleaseRow): string | null {
  if (release.seasonNumber == null || release.episodeNumber == null) return null
  return `S${release.seasonNumber} E${release.episodeNumber}${release.episodeTitle ? ` · ${release.episodeTitle}` : ""}`
}

function mediaTypePath(value: MediaTypeFilter): string {
  return value ? `&mediaType=${value}` : ""
}

export function CalendarPage() {
  const today = useMemo(() => new Date(), [])
  const todayKey = localDateKey(today)
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("")
  const range = monthRange(month)
  const monthPath = `/api/calendar?from=${range.from}&to=${range.to}&summary=true${mediaTypePath(mediaType)}`
  const dayPath = `/api/calendar?from=${selectedDate}&to=${selectedDate}${mediaTypePath(mediaType)}`
  const monthQuery = useQuery({
    queryKey: ["calendar", "month", range.from, mediaType],
    queryFn: () => apiGet<CalendarResponse>(monthPath)
  })
  const dayQuery = useQuery({
    queryKey: ["calendar", "day", selectedDate, mediaType],
    queryFn: () => apiGet<CalendarResponse>(dayPath)
  })
  const dayMap = useMemo(() => new Map(
    (monthQuery.data?.days ?? []).map((day) => [day.date, day])
  ), [monthQuery.data])
  const cells = useMemo(() => calendarCells(month), [month])
  const totalReleases = (monthQuery.data?.days ?? []).reduce((total, day) => total + day.count, 0)
  const selectedSummary = dayMap.get(selectedDate)
  const selectedGroups = useMemo(() => {
    const groups = new Map<string, { release: ReleaseRow; count: number }>()
    for (const release of dayQuery.data?.items ?? []) {
      const existing = groups.get(release.mediaItemId)
      if (existing) existing.count += 1
      else groups.set(release.mediaItemId, { release, count: 1 })
    }
    return [...groups.values()]
  }, [dayQuery.data])

  useEffect(() => {
    if (!monthQuery.data || selectedDate !== range.from || dayMap.has(selectedDate)) return
    const firstDate = monthQuery.data.days[0]?.date
    if (firstDate) setSelectedDate(firstDate)
  }, [dayMap, monthQuery.data, range.from, selectedDate])

  function selectMonth(nextMonth: Date) {
    setMonth(nextMonth)
    const nextRange = monthRange(nextMonth)
    const sameAsCurrentMonth = nextMonth.getFullYear() === today.getFullYear()
      && nextMonth.getMonth() === today.getMonth()
    setSelectedDate(sameAsCurrentMonth ? todayKey : nextRange.from)
  }

  function selectCell(cell: CalendarCell) {
    if (!cell.inCurrentMonth) setMonth(startOfMonth(cell.date))
    setSelectedDate(cell.dateKey)
  }

  return (
    <main className="page calendarPage">
      <section className="calendarMasthead" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">影视排期墙</p>
          <h1 id="page-title">海报日历</h1>
          <p className="summary">按日期浏览即将上映、上线和更新的电影与剧集。</p>
        </div>
        <div className="calendarMonthIdentity" aria-live="polite">
          <span>当前月份</span>
          <strong>{monthLabel(month)}</strong>
          <small>{monthQuery.data?.days.length ?? 0} 个播出日 · {totalReleases} 条排期</small>
        </div>
      </section>

      <section className="calendarToolbar" aria-label="日历控制">
        <div className="calendarMonthControls">
          <button
            aria-label="前一个月"
            className="calendarIconButton"
            onClick={() => selectMonth(shiftMonth(month, -1))}
            title="前一个月"
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <button
            className="calendarTodayButton"
            onClick={() => selectMonth(startOfMonth(today))}
            type="button"
          >
            <CalendarDays aria-hidden="true" size={17} />
            回到本月
          </button>
          <button
            aria-label="后一个月"
            className="calendarIconButton"
            onClick={() => selectMonth(shiftMonth(month, 1))}
            title="后一个月"
            type="button"
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </div>

        <div className="calendarTypeTabs" role="tablist" aria-label="影视类型">
          {([
            ["", "全部", CalendarDays],
            ["movie", "电影", Film],
            ["series", "剧集", Tv]
          ] as const).map(([value, label, Icon]) => (
            <button
              aria-selected={mediaType === value}
              key={value || "all"}
              onClick={() => setMediaType(value)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="posterCalendar" aria-label={monthLabel(month)}>
        <div className="posterCalendarWeekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>

        {monthQuery.isError ? (
          <p className="calendarMessage">本月排期加载失败，请检查数据源状态。</p>
        ) : (
          <div className="posterCalendarGrid">
            {cells.map((cell) => {
              const day = dayMap.get(cell.dateKey)
              const featured = day?.items[0]
              const isSelected = selectedDate === cell.dateKey
              const isToday = cell.dateKey === todayKey
              const dateText = `${cell.date.getMonth() + 1}月${cell.date.getDate()}日`
              return (
                <button
                  aria-label={`${dateText}，${day?.count ?? 0}部影视`}
                  aria-pressed={isSelected}
                  className={`calendarDayCell${cell.inCurrentMonth ? "" : " outside"}${isSelected ? " selected" : ""}${isToday ? " today" : ""}`}
                  key={cell.dateKey}
                  onClick={() => selectCell(cell)}
                  type="button"
                >
                  {featured ? (
                    <div className="calendarDayArtwork" aria-hidden="true">
                      <MediaPoster
                        fallbackLabel={featured.mediaItem.titleDisplay}
                        mediaId={featured.mediaItem.id}
                        posterUrl={featured.mediaItem.posterUrl}
                        title={featured.mediaItem.titleDisplay}
                      />
                    </div>
                  ) : null}
                  <span className="calendarDayShade" aria-hidden="true" />
                  <span className="calendarDayNumber">
                    <strong>{cell.date.getDate()}</strong>
                    {isToday ? <small>今天</small> : null}
                  </span>
                  {day ? <span className="calendarDayCount">{day.count} 部</span> : null}
                  {featured ? (
                    <span className="calendarDayTitle">
                      <strong>{featured.mediaItem.titleDisplay}</strong>
                      <small>{platformLabel(featured.platform)}</small>
                    </span>
                  ) : (
                    <span className="calendarDayEmpty">暂无排期</span>
                  )}
                  {day && day.items.length > 1 ? (
                    <span className="calendarMiniStack" aria-hidden="true">
                      {day.items.slice(1, 3).map((release) => (
                        <span className="calendarMiniPoster" key={release.id}>
                          <MediaPoster
                            fallbackLabel={release.mediaItem.titleDisplay}
                            mediaId={release.mediaItem.id}
                            posterUrl={release.mediaItem.posterUrl}
                            title={release.mediaItem.titleDisplay}
                          />
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="calendarDayShelf" aria-labelledby="selected-date-title">
        <header className="calendarShelfHeader">
          <div>
            <p className="eyebrow">当日片单</p>
            <h2 id="selected-date-title">{selectedDateLabel(selectedDate)}</h2>
          </div>
          <p>{selectedSummary?.count ?? dayQuery.data?.items.length ?? 0} 条排期</p>
        </header>

        {dayQuery.isLoading ? (
          <p className="calendarMessage">正在装载当日海报...</p>
        ) : dayQuery.isError ? (
          <p className="calendarMessage">当日片单加载失败。</p>
        ) : selectedGroups.length > 0 ? (
          <>
            <div className="calendarReleaseGallery">
              {selectedGroups.slice(0, MAX_VISIBLE_RELEASES).map(({ release, count }) => {
                const episode = episodeLabel(release)
                return (
                  <article className="calendarPremiereCard" key={release.mediaItemId}>
                    <Link className="calendarPremierePoster" to={`/media/${release.mediaItemId}`}>
                      <MediaPoster
                        fallbackLabel={release.mediaItem.titleDisplay}
                        mediaId={release.mediaItem.id}
                        posterUrl={release.mediaItem.posterUrl}
                        title={release.mediaItem.titleDisplay}
                      />
                      <span>{platformLabel(release.platform)}</span>
                    </Link>
                    <div className="calendarPremiereBody">
                      <p>{release.mediaItem.mediaType} · {release.region}</p>
                      <Link to={`/media/${release.mediaItemId}`}>
                        <h3>{release.mediaItem.titleDisplay}</h3>
                      </Link>
                      {episode ? <p className="calendarPremiereEpisode">{episode}</p> : null}
                      {count > 1 ? <p className="calendarPremiereEpisode">当日 {count} 条更新</p> : null}
                      <div className="calendarPremiereMeta">
                        <SourceLink source={release.source} sourceUrl={release.sourceUrl} />
                        <StatusBadge>{release.releaseStatus}</StatusBadge>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            {selectedGroups.length > MAX_VISIBLE_RELEASES ? (
              <p className="calendarOverflowNote">另有 {selectedGroups.length - MAX_VISIBLE_RELEASES} 部作品未展开</p>
            ) : null}
          </>
        ) : (
          <p className="calendarMessage">这一天暂无影视排期，选择其他有海报的日期继续浏览。</p>
        )}
      </section>
    </main>
  )
}
