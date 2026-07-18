import type { ContentAttentionCategory } from "@whatsnew/shared/settings"
import type { ChangeEvent } from "@prisma/client"
import { Router } from "express"
import { db } from "../config/db.js"
import {
  contentAttentionWeight,
  featuredScore,
  type AttentionMedia
} from "../domain/contentAttention.js"
import { ACTIVE_MEDIA_WHERE } from "../domain/mediaActivity.js"
import { withDataSources } from "../domain/mediaPresenter.js"
import { contentWeightMap } from "../settings/contentAttentionSettings.js"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import { getUpcomingDateWindow } from "../utils/date.js"

export const dashboardRouter = Router()

const DASHBOARD_EVENT_LIMIT = 20
const DASHBOARD_EVENT_CANDIDATE_LIMIT = 100
const RELEASE_EVENT_TYPES = new Set(["release_announced", "delayed", "airing_today", "available_now"])
const SOURCE_FAILED_EVENT_TYPE = "source_failed"

type DashboardRelease = {
  releasePattern: string
  mediaItem: AttentionMedia
}

type DashboardEvent = ChangeEvent & {
  mediaItem: { id: string, titleDisplay: string } | null
}

type ReleaseEventPayload = {
  platform?: string | null
  region?: string | null
  seasonNumber?: number | null
  episodeNumber?: number | null
  previousDate?: string | null
  releaseDate?: string | null
  direction?: string | null
}

function releaseEventPayload(event: DashboardEvent): ReleaseEventPayload | null {
  if (!RELEASE_EVENT_TYPES.has(event.eventType)) return null

  try {
    return JSON.parse(event.payload) as ReleaseEventPayload
  } catch {
    return null
  }
}

function releaseEventGroupKey(event: DashboardEvent, payload: ReleaseEventPayload): string {
  return [
    event.mediaItemId ?? event.id,
    event.eventType,
    event.source,
    payload.platform ?? "",
    payload.region ?? "",
    payload.previousDate ?? "",
    payload.releaseDate ?? "",
    payload.direction ?? ""
  ].join("|")
}

function aggregateReleaseEvents(events: DashboardEvent[]): DashboardEvent[] {
  if (events.length < 2) return events

  const payloads = events.map(releaseEventPayload)
  if (payloads.some((payload) => payload == null)) return events

  const episodeNumbers = [...new Set(payloads
    .map((payload) => payload?.episodeNumber)
    .filter((episodeNumber): episodeNumber is number => episodeNumber != null))]
    .sort((left, right) => left - right)
  if (episodeNumbers.length < 2) return events

  const seasonNumbers = [...new Set(payloads
    .map((payload) => payload?.seasonNumber)
    .filter((seasonNumber): seasonNumber is number => seasonNumber != null))]
    .sort((left, right) => left - right)
  const seasonNumber = seasonNumbers.length === 1 ? seasonNumbers[0] : null
  const episodeLabel = seasonNumber == null
    ? `共 ${episodeNumbers.length} 集`
    : `第 ${seasonNumber} 季共 ${episodeNumbers.length} 集`
  const event = events[0]
  const payload = payloads[0]
  const mediaTitle = event.mediaItem?.titleDisplay
  if (!payload || !mediaTitle) return events
  const summarizedTitle = `${mediaTitle} ${episodeLabel}`

  return [{
    ...event,
    title: event.title.replace(mediaTitle, summarizedTitle),
    description: event.description.replace(mediaTitle, summarizedTitle),
    payload: JSON.stringify({
      ...payload,
      seasonNumber,
      seasonNumbers,
      episodeNumber: null,
      episodeNumbers,
      episodeCount: episodeNumbers.length
    })
  }]
}

function aggregateEventGroup(events: DashboardEvent[]): DashboardEvent[] {
  if (events.length < 2) return events
  if (events[0]?.eventType === SOURCE_FAILED_EVENT_TYPE) return [events[0]]
  return aggregateReleaseEvents(events)
}

function aggregateDashboardEvents(events: DashboardEvent[]): DashboardEvent[] {
  const groups = new Map<string, DashboardEvent[]>()

  for (const event of events) {
    const payload = releaseEventPayload(event)
    const key = event.eventType === SOURCE_FAILED_EVENT_TYPE
      ? `source_failed|${event.source}|${event.eventAt.toISOString().slice(0, 10)}`
      : payload?.episodeNumber == null
        ? `event|${event.id}`
        : releaseEventGroupKey(event, payload)

    const group = groups.get(key)
    if (group) group.push(event)
    else groups.set(key, [event])
  }

  return [...groups.values()]
    .flatMap(aggregateEventGroup)
    .slice(0, DASHBOARD_EVENT_LIMIT)
}

export function dashboardReleasePriority(
  release: DashboardRelease,
  weights: Record<ContentAttentionCategory, number>
): number {
  const patternBoost = release.releasePattern === "platform_premiere"
    ? 100
    : release.releasePattern === "catalog_addition"
      ? -100
      : 0

  return contentAttentionWeight(release.mediaItem, weights) * 100
    + release.mediaItem.heatScore
    + patternBoost
}

export function dashboardTimingBoost(releasePattern: string, baseBoost: number): number {
  if (releasePattern === "catalog_addition") return 0
  if (releasePattern === "platform_premiere") return baseBoost + 5
  return baseBoost
}

function rankedUniqueReleases<T extends DashboardRelease & {
  mediaItemId: string
  releaseDate: string | null
}>(
  releases: T[],
  weights: Record<ContentAttentionCategory, number>,
  limit: number
): T[] {
  const seen = new Set<string>()

  return [...releases]
    .sort((left, right) => (
      dashboardReleasePriority(right, weights) - dashboardReleasePriority(left, weights)
      || (left.releaseDate ?? "").localeCompare(right.releaseDate ?? "")
    ))
    .filter((release) => {
      if (seen.has(release.mediaItemId)) return false
      seen.add(release.mediaItemId)
      return true
    })
    .slice(0, limit)
}

dashboardRouter.get("/", async (_req, res) => {
  const { from: today, to: weekEnd } = getUpcomingDateWindow()
  const weights = contentWeightMap(runtimeSettings)

  const [todayPool, weekPool, trendingPool, events, sourceRuns] = await Promise.all([
    db.release.findMany({
      where: { releaseDate: today, mediaItem: ACTIVE_MEDIA_WHERE },
      include: { mediaItem: true },
      take: 250
    }),
    db.release.findMany({
      where: { releaseDate: { gte: today, lte: weekEnd }, mediaItem: ACTIVE_MEDIA_WHERE },
      include: { mediaItem: true },
      take: 500
    }),
    db.mediaItem.findMany({
      where: ACTIVE_MEDIA_WHERE,
      include: {
        releases: { select: { source: true } },
        popularitySignals: { where: { isCurrent: true }, select: { source: true } }
      },
      orderBy: { heatScore: "desc" },
      take: 50
    }),
    db.changeEvent.findMany({
      include: {
        mediaItem: {
          select: { id: true, titleDisplay: true }
        }
      },
      orderBy: { eventAt: "desc" },
      take: DASHBOARD_EVENT_CANDIDATE_LIMIT
    }),
    db.sourceSyncRun.findMany({
      where: { source: { not: "demo" } },
      orderBy: { startedAt: "desc" },
      take: 50
    })
  ])
  const todayReleases = rankedUniqueReleases(todayPool, weights, 12)
  const weekReleases = rankedUniqueReleases(weekPool, weights, 24)
  const trending = trendingPool.map(withDataSources)
  const candidates = new Map<string, { media: AttentionMedia & { id: string }, timingBoost: number }>()

  for (const media of trending) candidates.set(media.id, { media, timingBoost: 0 })
  for (const release of weekPool) {
    const current = candidates.get(release.mediaItem.id)
    candidates.set(release.mediaItem.id, {
      media: release.mediaItem,
      timingBoost: Math.max(
        current?.timingBoost ?? 0,
        dashboardTimingBoost(release.releasePattern, 5)
      )
    })
  }
  for (const release of todayPool) {
    const current = candidates.get(release.mediaItem.id)
    candidates.set(release.mediaItem.id, {
      media: release.mediaItem,
      timingBoost: Math.max(
        current?.timingBoost ?? 0,
        dashboardTimingBoost(release.releasePattern, 10)
      )
    })
  }

  const featured = [...candidates.values()]
    .sort((left, right) => (
      featuredScore(right.media, weights, right.timingBoost)
      - featuredScore(left.media, weights, left.timingBoost)
    ))
    .slice(0, 5)
    .map((candidate) => candidate.media)
  const sources = sourceRuns.filter((run, index) => (
    sourceRuns.findIndex((candidate) => candidate.source === run.source) === index
  ))

  res.json({
    today: todayReleases,
    week: weekReleases,
    featured,
    trending: trending.slice(0, 12),
    events: aggregateDashboardEvents(events),
    sources
  })
})
