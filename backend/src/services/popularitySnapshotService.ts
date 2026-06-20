import type { PopularitySignal, Prisma, PrismaClient } from "@prisma/client"
import {
  calculateRankDelta,
  classifyPopularityEvent,
  heatFromCurrentSignals
} from "../domain/popularityMovement.js"
import type { PopularitySignalInput } from "../domain/types.js"
import { createPopularityEvent } from "./eventService.js"

export type PersistSignalInput = {
  mediaItemId: string
  mediaTitle: string
  signal: PopularitySignalInput
  sourceSyncRunId: string
  capturedAt: Date
}

type TransactionClient = Prisma.TransactionClient

export class PopularitySnapshotService {
  constructor(private readonly prisma: PrismaClient) {}

  async persistSignal(input: PersistSignalInput): Promise<PopularitySignal> {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.popularitySignal.findFirst({
        where: this.currentIdentity(input),
        orderBy: { capturedAt: "desc" }
      })

      if (previous?.capturedAt.getTime() === input.capturedAt.getTime()) {
        const updated = await tx.popularitySignal.update({
          where: { id: previous.id },
          data: {
            sourceSyncRunId: input.sourceSyncRunId,
            sourceCategory: input.signal.sourceCategory,
            rank: input.signal.rank,
            rankDelta: calculateRankDelta(previous.previousRank, input.signal.rank),
            value: input.signal.value,
            valueLabel: input.signal.valueLabel,
            sourceUrl: input.signal.sourceUrl
          }
        })
        await this.updateHeatScore(tx, input.mediaItemId)
        return updated
      }

      const previousRank = previous?.rank ?? null
      const rankDelta = calculateRankDelta(previousRank, input.signal.rank)

      await tx.popularitySignal.updateMany({
        where: this.currentIdentity(input),
        data: { isCurrent: false }
      })

      const created = await tx.popularitySignal.create({
        data: {
          mediaItemId: input.mediaItemId,
          sourceSyncRunId: input.sourceSyncRunId,
          source: input.signal.source,
          sourceCategory: input.signal.sourceCategory,
          platform: input.signal.platform,
          region: input.signal.region,
          window: input.signal.window,
          rank: input.signal.rank,
          previousRank,
          rankDelta,
          value: input.signal.value,
          valueLabel: input.signal.valueLabel,
          capturedAt: input.capturedAt,
          isCurrent: true,
          sourceUrl: input.signal.sourceUrl
        }
      })

      const eventType = classifyPopularityEvent(previousRank, input.signal.rank)
      if (eventType) {
        await createPopularityEvent(tx, input.mediaItemId, input.mediaTitle, eventType, {
          source: input.signal.source,
          platform: input.signal.platform,
          region: input.signal.region,
          window: input.signal.window,
          previousRank,
          currentRank: input.signal.rank,
          rankDelta,
          capturedAt: input.capturedAt.toISOString()
        }, input.signal.sourceUrl)
      }

      await this.updateHeatScore(tx, input.mediaItemId)
      return created
    })
  }

  async persistSignals(inputs: PersistSignalInput[]): Promise<PopularitySignal[]> {
    const results: PopularitySignal[] = []
    for (const input of inputs) {
      results.push(await this.persistSignal(input))
    }
    return results
  }

  async pruneHistory(signalSources: string[], cutoff: Date): Promise<number> {
    if (signalSources.length === 0) return 0

    const result = await this.prisma.popularitySignal.deleteMany({
      where: {
        source: { in: signalSources },
        isCurrent: false,
        capturedAt: { lt: cutoff }
      }
    })
    return result.count
  }

  async deactivateMissingCurrentSignals(
    signalSources: string[],
    currentSignalIds: string[]
  ): Promise<number> {
    if (signalSources.length === 0) return 0

    return this.prisma.$transaction(async (tx) => {
      const staleSignals = await tx.popularitySignal.findMany({
        where: {
          source: { in: signalSources },
          isCurrent: true,
          ...(currentSignalIds.length > 0 ? { id: { notIn: currentSignalIds } } : {})
        },
        select: { id: true, mediaItemId: true }
      })
      if (staleSignals.length === 0) return 0

      await tx.popularitySignal.updateMany({
        where: { id: { in: staleSignals.map((signal) => signal.id) } },
        data: { isCurrent: false }
      })

      const mediaItemIds = [...new Set(staleSignals.map((signal) => signal.mediaItemId))]
      for (const mediaItemId of mediaItemIds) {
        await this.updateHeatScore(tx, mediaItemId)
      }
      return staleSignals.length
    })
  }

  private currentIdentity(input: PersistSignalInput) {
    return {
      mediaItemId: input.mediaItemId,
      source: input.signal.source,
      platform: input.signal.platform,
      region: input.signal.region,
      window: input.signal.window,
      isCurrent: true
    }
  }

  private async updateHeatScore(
    tx: TransactionClient,
    mediaItemId: string
  ): Promise<void> {
    const signals = await tx.popularitySignal.findMany({
      where: { mediaItemId, isCurrent: true },
      select: { rank: true }
    })
    await tx.mediaItem.update({
      where: { id: mediaItemId },
      data: { heatScore: heatFromCurrentSignals(signals) }
    })
  }
}
