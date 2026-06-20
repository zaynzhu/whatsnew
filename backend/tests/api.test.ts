import type { PrismaClient } from "@prisma/client"
import request from "supertest"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter.js"
import { runSourceSync } from "../src/services/sourceSyncService.js"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"

let createApp: typeof import("../src/app.js").createApp
const prisma: PrismaClient = testPrisma

beforeAll(async () => {
  const appModule = await import("../src/app.js")
  createApp = appModule.createApp
})

beforeEach(async () => {
  await resetTestDatabase()
  await runSourceSync(prisma, demoSeedAdapter)
})

describe("api routes", () => {
  it("returns dashboard sections for the current date window", async () => {
    const response = await request(createApp()).get("/api/dashboard")
    const today = new Date()
    const todayDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-")

    expect(response.status).toBe(200)
    expect(response.body.today.every((release: any) => release.releaseDate === todayDate)).toBe(true)
    expect(Array.isArray(response.body.week)).toBe(true)
    expect(response.body.trending.length).toBeGreaterThan(0)
    expect(response.body.sources.length).toBeGreaterThan(0)
  })

  it("filters media by mediaType", async () => {
    const response = await request(createApp()).get("/api/media?mediaType=movie")

    expect(response.status).toBe(200)
    expect(response.body.items.every((item: any) => item.mediaType === "movie")).toBe(true)
  })

  it("returns calendar releases", async () => {
    const response = await request(createApp()).get("/api/calendar")
    const today = new Date()
    const todayDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-")

    expect(response.status).toBe(200)
    expect(response.body.items.every((release: any) => release.releaseDate >= todayDate)).toBe(true)
  })

  it("returns trending and source status routes", async () => {
    const trendingResponse = await request(createApp()).get("/api/trending?window=week")
    const sourcesResponse = await request(createApp()).get("/api/sources")

    expect(trendingResponse.status).toBe(200)
    expect(trendingResponse.body.items.length).toBeGreaterThan(0)
    expect(sourcesResponse.status).toBe(200)
    expect(sourcesResponse.body.items.length).toBeGreaterThan(0)
  })

  it("rejects unknown source sync requests", async () => {
    const response = await request(createApp()).post("/api/sources/unknown/sync")

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: "source_not_available_in_mvp" })
  })
})
