import { PrismaClient } from "@prisma/client"
import { beforeEach, describe, expect, it } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter.js"
import { runSourceSync } from "../src/services/sourceSyncService.js"

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.changeEvent.deleteMany()
  await prisma.popularitySignal.deleteMany()
  await prisma.release.deleteMany()
  await prisma.mediaItem.deleteMany()
  await prisma.sourceSyncRun.deleteMany()
})

describe("runSourceSync", () => {
  it("persists demo media, releases, popularity signals, source run, and events", async () => {
    const result = await runSourceSync(prisma, demoSeedAdapter)

    expect(result.status).toBe("success")
    expect(result.itemCount).toBeGreaterThan(0)

    const mediaCount = await prisma.mediaItem.count()
    const releaseCount = await prisma.release.count()
    const popularityCount = await prisma.popularitySignal.count()
    const eventCount = await prisma.changeEvent.count()
    const runCount = await prisma.sourceSyncRun.count()

    expect(mediaCount).toBeGreaterThanOrEqual(4)
    expect(releaseCount).toBeGreaterThanOrEqual(4)
    expect(popularityCount).toBeGreaterThanOrEqual(4)
    expect(eventCount).toBeGreaterThanOrEqual(4)
    expect(runCount).toBe(1)
  })
})
