import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"

describe("health", () => {
  it("returns service status", async () => {
    const response = await request(createApp()).get("/api/health")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, service: "whatsnew-backend" })
  })
})
