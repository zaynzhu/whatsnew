import type { PrismaClient } from "@prisma/client"
import { normalizeReleaseStatusForDate } from "../domain/releaseStatus.js"
import { formatLocalDate } from "../utils/date.js"

type ReconciliationDatabase = Pick<PrismaClient, "release">

type ReconciliationOptions = {
  database: ReconciliationDatabase
  apply?: boolean
  now?: Date
}

export type ReleaseStatusReconciliationResult = {
  scanned: number
  matched: number
  updated: number
  transitions: Record<string, number>
  samples: string[]
}

export async function reconcileReleaseStatuses(
  options: ReconciliationOptions
): Promise<ReleaseStatusReconciliationResult> {
  const today = formatLocalDate(options.now ?? new Date())
  const rows = await options.database.release.findMany({
    where: { releaseDate: { not: null } },
    select: {
      id: true,
      releaseDate: true,
      releaseStatus: true,
      platform: true,
      mediaItem: { select: { titleDisplay: true } }
    }
  })
  const changes = rows.flatMap((row) => {
    const nextStatus = normalizeReleaseStatusForDate(row.releaseStatus, row.releaseDate, today)
    return nextStatus === row.releaseStatus ? [] : [{ ...row, nextStatus }]
  })
  const transitions: Record<string, number> = {}

  for (const change of changes) {
    const key = `${change.releaseStatus}->${change.nextStatus}`
    transitions[key] = (transitions[key] ?? 0) + 1
  }

  let updated = 0
  if (options.apply) {
    for (const nextStatus of [...new Set(changes.map((change) => change.nextStatus))]) {
      const ids = changes
        .filter((change) => change.nextStatus === nextStatus)
        .map((change) => change.id)
      const result = await options.database.release.updateMany({
        where: { id: { in: ids } },
        data: { releaseStatus: nextStatus }
      })
      updated += result.count
    }
  }

  return {
    scanned: rows.length,
    matched: changes.length,
    updated,
    transitions,
    samples: changes.slice(0, 20).map((change) => (
      `${change.mediaItem.titleDisplay} / ${change.platform}: ${change.releaseStatus} -> ${change.nextStatus}`
    ))
  }
}
