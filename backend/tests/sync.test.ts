import type { PrismaClient } from "@prisma/client"
import { beforeEach, describe, expect, it } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter.js"
import { runSourceSync } from "../src/services/sourceSyncService.js"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"

const prisma: PrismaClient = testPrisma

beforeEach(async () => {
  await resetTestDatabase()
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

  it("keeps source detail rows idempotent when syncing the same adapter twice", async () => {
    await runSourceSync(prisma, demoSeedAdapter)

    const firstCounts = {
      media: await prisma.mediaItem.count(),
      releases: await prisma.release.count(),
      popularity: await prisma.popularitySignal.count(),
      events: await prisma.changeEvent.count()
    }

    await runSourceSync(prisma, demoSeedAdapter)

    expect(await prisma.mediaItem.count()).toBe(firstCounts.media)
    expect(await prisma.release.count()).toBe(firstCounts.releases)
    expect(await prisma.popularitySignal.count()).toBe(firstCounts.popularity)
    expect(await prisma.changeEvent.count()).toBe(firstCounts.events)
    expect(await prisma.sourceSyncRun.count()).toBe(2)
  }, 15000)

  it("redacts API keys from failed source sync error messages", async () => {
    const result = await runSourceSync(prisma, {
      source: "broken",
      async fetchItems() {
        throw new Error("HTTP 401 for https://api.example.test/movie?api_key=secret-key&language=zh-CN")
      }
    })

    expect(result.status).toBe("failed")
    expect(result.errorMessage).toContain("api_key=[REDACTED]")
    expect(result.errorMessage).not.toContain("secret-key")
  })
})
