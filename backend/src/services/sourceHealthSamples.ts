import type { PrismaClient } from "@prisma/client"
import type { SourceHealthSample, SourceSignalKind } from "@whatsnew/shared/settings"
import type { RegisteredHealthScope, SourceHealthSampleStrategy } from "../adapters/adapterRegistry.js"
import { db } from "../config/db.js"

type SourceHealthSampleDatabase = Pick<PrismaClient, "release" | "popularitySignal">

const SIGNAL_KIND_PRIORITY: Record<SourceHealthSampleStrategy, SourceSignalKind[]> = {
  release: ["release_calendar", "platform_catalog", "news_signal", "metadata"],
  popularity: ["platform_rank", "community_trend", "rating", "news_signal", "availability"],
  local_state: ["metadata", "rating"],
  coverage_only: ["metadata"]
}

function sourceIdentifiers(scope: RegisteredHealthScope): string[] {
  if (scope.healthPolicy.sampleSources?.length) {
    return scope.healthPolicy.sampleSources
  }

  return [
    scope.sourceId,
    scope.adapter?.source ?? ""
  ].filter((source, index, sources) => source && sources.indexOf(source) === index)
}

function sourcePredicates(scope: RegisteredHealthScope) {
  if (scope.healthPolicy.sampleSources?.length) {
    return sourceIdentifiers(scope).map((source) => ({ source }))
  }

  return sourceIdentifiers(scope).flatMap((source) => [
    { source },
    { source: { startsWith: `${source}_` } }
  ])
}

function primarySignalKind(scope: RegisteredHealthScope): SourceSignalKind {
  const expected = scope.healthPolicy.expectedSignalKinds
  const priority = SIGNAL_KIND_PRIORITY[scope.healthPolicy.sampleStrategy]
  return priority.find((kind) => expected.includes(kind)) ?? expected[0] ?? "metadata"
}

export function createSourceHealthSampleReader(database: SourceHealthSampleDatabase = db) {
  return {
    async samplesForScope(scope: RegisteredHealthScope, limit: number): Promise<SourceHealthSample[]> {
      if (scope.healthPolicy.sampleStrategy === "release") {
        const releases = await database.release.findMany({
          where: { OR: sourcePredicates(scope) },
          include: { mediaItem: true },
          orderBy: { fetchedAt: "desc" },
          take: limit
        })

        return releases.map((release) => ({
          title: release.mediaItem.titleDisplay,
          mediaType: release.mediaItem.mediaType,
          signalKind: primarySignalKind(scope),
          source: release.source,
          platform: release.platform,
          region: release.region,
          sourceUrl: release.sourceUrl,
          capturedAtOrFetchedAt: release.fetchedAt.toISOString()
        }))
      }

      if (scope.healthPolicy.sampleStrategy === "popularity") {
        const signals = await database.popularitySignal.findMany({
          where: {
            isCurrent: true,
            OR: sourcePredicates(scope)
          },
          include: { mediaItem: true },
          orderBy: [
            { rank: "asc" },
            { capturedAt: "desc" }
          ],
          take: limit
        })

        return signals.map((signal) => ({
          title: signal.mediaItem.titleDisplay,
          mediaType: signal.mediaItem.mediaType,
          signalKind: primarySignalKind(scope),
          source: signal.source,
          platform: signal.platform,
          region: signal.region,
          sourceUrl: signal.sourceUrl,
          capturedAtOrFetchedAt: signal.capturedAt.toISOString()
        }))
      }

      return []
    }
  }
}

export const sourceHealthSampleReader = createSourceHealthSampleReader()
