import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { beforeEach, describe, expect, it } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter.js"
import { createApp } from "../src/app.js"
import { runSourceSync } from "../src/services/sourceSyncService.js"

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.changeEvent.deleteMany()
  await prisma.popularitySignal.deleteMany()
  await prisma.release.deleteMany()
  await prisma.mediaItem.deleteMany()
  await prisma.sourceSyncRun.deleteMany()
  await runSourceSync(prisma, demoSeedAdapter)
})

describe("api routes", () => {
  it("returns dashboard sections", async () => {
    const response = await request(createApp()).get("/api/dashboard")

    expect(response.status).toBe(200)
    expect(response.body.today.length).toBeGreaterThan(0)
    expect(response.body.week.length).toBeGreaterThan(0)
    expect(response.body.trending.length).toBeGreaterThan(0)
    expect(response.body.sources.length).toBeGreaterThan(0)
  })

  it("filters media by mediaType", async () => {
    const response = await request(createApp()).get("/api/media?mediaType=movie")

    expect(response.status).toBe(200)
    expect(response.body.items.every((item: any) => item.mediaType === "movie")).toBe(true)
  })

  it("returns calendar releases", async () => {
    const response = await request(createApp()).get("/api/calendar?from=2026-06-17&to=2026-06-30")

    expect(response.status).toBe(200)
    expect(response.body.items.length).toBeGreaterThan(0)
  })
})
