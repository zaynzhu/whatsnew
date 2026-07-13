import type { PrismaClient } from "@prisma/client"
import { normalizeMediaStatusForDate } from "../domain/mediaStatus.js"
import { formatLocalDate } from "../utils/date.js"

type ReconciliationDatabase = Pick<PrismaClient, "mediaItem">

type ReconciliationOptions = {
  database: ReconciliationDatabase
  apply?: boolean
  now?: Date
}

export type MediaStatusReconciliationResult = {
  scanned: number
  matched: number
  updated: number
  transitions: Record<string, number>
  samples: string[]
}

export async function reconcileMediaStatuses(
  options: ReconciliationOptions
): Promise<MediaStatusReconciliationResult> {
  const today = formatLocalDate(options.now ?? new Date())
  const rows = await options.database.mediaItem.findMany({
    where: { firstReleaseDate: { not: null } },
    select: {
      id: true,
      titleDisplay: true,
      firstReleaseDate: true,
      status: true
    }
  })
  const changes = rows.flatMap((row) => {
    const nextStatus = normalizeMediaStatusForDate(row.status, row.firstReleaseDate, today)
    return nextStatus === row.status ? [] : [{ ...row, nextStatus }]
  })
  const transitions: Record<string, number> = {}

  for (const change of changes) {
    const key = `${change.status}->${change.nextStatus}`
    transitions[key] = (transitions[key] ?? 0) + 1
  }

  let updated = 0
  if (options.apply) {
    for (const nextStatus of [...new Set(changes.map((change) => change.nextStatus))]) {
      const ids = changes
        .filter((change) => change.nextStatus === nextStatus)
        .map((change) => change.id)
      const result = await options.database.mediaItem.updateMany({
        where: { id: { in: ids } },
        data: { status: nextStatus }
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
      `${change.titleDisplay}: ${change.status} -> ${change.nextStatus}`
    ))
  }
}
