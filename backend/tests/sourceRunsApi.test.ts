import request from "supertest"
import { describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app.js"
import { createSourceRunsRouter } from "../src/routes/sourceRuns.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"

describe("source runs API", () => {
  it("returns filtered persistent runs with redacted errors and retry state", async () => {
    const database = {
      sourceSyncRun: {
        findMany: vi.fn(async () => [{
          id: "run-1",
          source: "tmdb",
          scope: "all",
          status: "failed",
          startedAt: new Date("2026-07-16T08:34:52.816Z"),
          finishedAt: new Date("2026-07-16T08:35:59.791Z"),
          durationMs: 66975,
          itemCount: 0,
          errorMessage: "request key secret-tmdb-key?api_key=secret-tmdb-key",
          nextRunAt: null
        }])
      }
    }
    const settings = new RuntimeSettingsService(new EnvFileStore("/tmp/unused-source-runs-env"), {
      TMDB_API_KEY: "secret-tmdb-key",
      SOURCE_TMDB_ENABLED: "true"
    })
    const app = createApp({
      sourceRunsRouter: createSourceRunsRouter({
        database: database as never,
        settings
      })
    })

    const response = await request(app).get("/api/source-runs?source=tmdb&status=failed&limit=20")

    expect(response.status).toBe(200)
    expect(database.sourceSyncRun.findMany).toHaveBeenCalledWith({
      where: { source: "tmdb", status: "failed" },
      orderBy: { startedAt: "desc" },
      take: 20
    })
    expect(response.body.items[0]).toMatchObject({
      sourceId: "tmdb",
      sourceName: "TMDb",
      status: "failed",
      retryable: true,
      errorMessage: "request key [REDACTED]?api_key=[REDACTED]"
    })
    expect(response.body.sources).toContainEqual({ id: "tmdb", name: "TMDb" })
    expect(JSON.stringify(response.body)).not.toContain("secret-tmdb-key")
  })

  it("caps invalid or excessive limits", async () => {
    const findMany = vi.fn(async () => [])
    const app = createApp({
      sourceRunsRouter: createSourceRunsRouter({
        database: { sourceSyncRun: { findMany } } as never
      })
    })

    await request(app).get("/api/source-runs?limit=9999")
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 200 }))

    await request(app).get("/api/source-runs?limit=nope")
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 100 }))
  })
})
