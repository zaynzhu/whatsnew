import { db } from "../config/db.js"
import {
  heatFromCurrentSignals,
  NON_HEAT_SIGNAL_SOURCES
} from "../domain/popularityMovement.js"

const apply = process.argv.includes("--apply")

try {
  const mediaItems = await db.mediaItem.findMany({
    select: {
      id: true,
      titleDisplay: true,
      heatScore: true,
      popularitySignals: {
        where: { isCurrent: true },
        select: { source: true, rank: true }
      }
    }
  })
  const changes = mediaItems.flatMap((item) => {
    const heatScore = heatFromCurrentSignals(item.popularitySignals)
    if (item.heatScore === heatScore) return []

    return [{
      id: item.id,
      titleDisplay: item.titleDisplay,
      previousHeatScore: item.heatScore,
      heatScore
    }]
  })

  if (apply) {
    for (const change of changes) {
      await db.mediaItem.update({
        where: { id: change.id },
        data: { heatScore: change.heatScore }
      })
    }
  }

  const nonHeatPopularityEventWhere = {
    source: { in: [...NON_HEAT_SIGNAL_SOURCES] },
    eventType: { in: ["rank_entered", "rank_changed", "heat_rising"] }
  }
  const incorrectEvents = await db.changeEvent.count({
    where: nonHeatPopularityEventWhere
  })
  const removedEvents = apply
    ? (await db.changeEvent.deleteMany({ where: nonHeatPopularityEventWhere })).count
    : 0

  const transitions = {
    zeroed: changes.filter((change) => change.heatScore === 0).length,
    decreased: changes.filter((change) => (
      change.heatScore > 0 && change.heatScore < change.previousHeatScore
    )).length,
    increased: changes.filter((change) => change.heatScore > change.previousHeatScore).length
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    scanned: mediaItems.length,
    matched: changes.length,
    updated: apply ? changes.length : 0,
    incorrectEvents,
    removedEvents,
    transitions,
    samples: changes.slice(0, 20).map((change) => ({
      title: change.titleDisplay,
      from: change.previousHeatScore,
      to: change.heatScore
    }))
  }, null, 2))
} finally {
  await db.$disconnect()
}
