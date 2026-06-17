import { describe, expect, it } from "vitest"
import { RateLimiter } from "../src/utils/rateLimiter.js"

describe("RateLimiter", () => {
  it("waits at least the configured interval between jobs", async () => {
    const limiter = new RateLimiter(25)
    const started: number[] = []

    await limiter.run(async () => {
      started.push(Date.now())
    })
    await limiter.run(async () => {
      started.push(Date.now())
    })

    expect(started[1] - started[0]).toBeGreaterThanOrEqual(20)
  })
})
