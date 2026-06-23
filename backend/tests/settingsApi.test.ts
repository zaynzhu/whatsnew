import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app.js"
import { createSettingsRouter } from "../src/routes/settings.js"
import { createSourcesRouter } from "../src/routes/sources.js"
import type { ConnectionTestService } from "../src/services/connectionTestService.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"

let tempDir: string
let testSettings: RuntimeSettingsService

const successResult = {
  mode: "source" as const,
  success: true,
  durationMs: 12,
  statusCode: 200,
  errorType: null,
  message: "连接成功"
}

const connectionTester = {
  testSource: vi.fn(async () => successResult),
  testProxy: vi.fn(async (mode: "direct" | "http_proxy" | "https_proxy") => ({
    ...successResult,
    mode
  }))
} as unknown as ConnectionTestService

const database = {
  sourceSyncRun: {
    findMany: vi.fn(async () => [])
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "whatsnew-settings-api-"))
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, [
    "HTTPS_PROXY=http://proxy-user:secret-proxy-password@proxy.test:7890",
    "TMDB_API_KEY=secret-tmdb-key",
    "TRAKT_CLIENT_ID=secret-trakt-client-id",
    "THETVDB_API_KEY=free-thetvdb-key",
    "THETVDB_PIN=1234",
    "SOURCE_TMDB_ENABLED=true",
    "SOURCE_TMDB_PROXY_MODE=inherit"
  ].join("\n"))
  testSettings = new RuntimeSettingsService(new EnvFileStore(envPath))
  await testSettings.load()
  vi.clearAllMocks()
  database.sourceSyncRun.findMany.mockResolvedValue([])
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

function testApp() {
  return createApp({
    settingsRouter: createSettingsRouter({
      settings: testSettings,
      connectionTester,
      database: database as never
    }),
    sourcesRouter: createSourcesRouter({
      connectionTester,
      database: database as never,
      settings: testSettings
    })
  })
}

describe("settings API", () => {
  it("returns masked settings and every catalog source", async () => {
    database.sourceSyncRun.findMany.mockResolvedValue([{
      source: "tmdb",
      status: "failed",
      startedAt: new Date("2026-06-20T10:00:00.000Z"),
      finishedAt: new Date("2026-06-20T10:00:01.000Z"),
      durationMs: 1000,
      itemCount: 0,
      errorMessage: "proxy secret-proxy-password key secret-tmdb-key"
    }] as never)

    const response = await request(testApp()).get("/api/settings")

    expect(response.status).toBe(200)
    expect(response.body.sources).toHaveLength(20)
    expect(response.body.proxyFields.find((field: any) => field.key === "HTTPS_PROXY").value).toBeNull()
    expect(JSON.stringify(response.body)).not.toContain("secret-proxy-password")
    expect(JSON.stringify(response.body)).not.toContain("secret-tmdb-key")
    expect(JSON.stringify(response.body)).not.toContain("secret-trakt-client-id")
    const trakt = response.body.sources.find((source: any) => source.id === "trakt")
    const clientId = trakt.fields.find((field: any) => field.key === "TRAKT_CLIENT_ID")
    expect(clientId.value).toBeNull()
    expect(clientId.sensitive).toBe(true)
  })

  it("reports the user switch separately from credential readiness", async () => {
    await testSettings.update({}, ["TMDB_API_KEY"])

    const response = await request(testApp()).get("/api/settings")
    const tmdb = response.body.sources.find((source: any) => source.id === "tmdb")

    expect(tmdb).toMatchObject({
      enabled: true,
      runnable: false,
      credentialsComplete: false,
      missingCredentials: ["TMDB_API_KEY"]
    })
  })

  it("redacts stored errors from the source runs API", async () => {
    database.sourceSyncRun.findMany.mockResolvedValue([{
      source: "trakt",
      status: "failed",
      startedAt: new Date("2026-06-20T10:00:00.000Z"),
      finishedAt: new Date("2026-06-20T10:00:01.000Z"),
      durationMs: 1000,
      itemCount: 0,
      errorMessage: "request failed with secret-trakt-client-id"
    }] as never)

    const response = await request(testApp()).get("/api/sources")

    expect(response.status).toBe(200)
    expect(JSON.stringify(response.body)).not.toContain("secret-trakt-client-id")
    expect(response.body.items[0].errorMessage).toContain("[REDACTED]")
  })

  it("returns TheTVDB PIN as an optional masked field", async () => {
    const response = await request(testApp()).get("/api/settings")
    const theTvdb = response.body.sources.find((source: any) => source.id === "thetvdb")
    const pin = theTvdb.fields.find((field: any) => field.key === "THETVDB_PIN")

    expect(theTvdb.implementationStatus).toBe("active")
    expect(theTvdb.enabled).toBe(false)
    expect(theTvdb.runnable).toBe(false)
    expect(theTvdb.supportsEnable).toBe(true)
    expect(theTvdb.supportsSync).toBe(true)
    expect(theTvdb.credentialsComplete).toBe(true)
    expect(theTvdb.missingCredentials).toEqual([])
    expect(pin.value).toBeNull()
    expect(pin.maskedValue).toBe("••••••••")
    expect(JSON.stringify(response.body)).not.toContain("1234")
  })

  it("uses the newest sync run for each source", async () => {
    database.sourceSyncRun.findMany.mockResolvedValue([
      {
        source: "tmdb",
        status: "success",
        startedAt: new Date("2026-06-20T10:00:00.000Z"),
        finishedAt: new Date("2026-06-20T10:00:01.000Z"),
        durationMs: 1000,
        itemCount: 12,
        errorMessage: null
      },
      {
        source: "tmdb",
        status: "failed",
        startedAt: new Date("2026-06-19T10:00:00.000Z"),
        finishedAt: new Date("2026-06-19T10:00:01.000Z"),
        durationMs: 1000,
        itemCount: 0,
        errorMessage: "older"
      }
    ] as never)

    const response = await request(testApp()).get("/api/settings")
    const tmdb = response.body.sources.find((source: any) => source.id === "tmdb")

    expect(tmdb.latestRun.status).toBe("success")
    expect(tmdb.latestRun.itemCount).toBe(12)
  })

  it("reports a failed scope when another Trakt scope succeeds", async () => {
    database.sourceSyncRun.findMany.mockResolvedValue([
      {
        source: "trakt",
        scope: "calendar",
        status: "success",
        startedAt: new Date("2026-06-20T10:01:00.000Z"),
        finishedAt: new Date("2026-06-20T10:02:00.000Z"),
        durationMs: 60000,
        itemCount: 160,
        errorMessage: null
      },
      {
        source: "trakt",
        scope: "popularity",
        status: "failed",
        startedAt: new Date("2026-06-20T10:00:00.000Z"),
        finishedAt: new Date("2026-06-20T10:00:10.000Z"),
        durationMs: 10000,
        itemCount: 0,
        errorMessage: "popularity failed"
      }
    ] as never)

    const response = await request(testApp()).get("/api/settings")
    const trakt = response.body.sources.find((source: any) => source.id === "trakt")

    expect(trakt.latestRun.status).toBe("failed")
    expect(trakt.latestRun.itemCount).toBe(160)
    expect(trakt.latestRun.errorMessage).toContain("popularity failed")
  })

  it("updates settings immediately without accepting unknown keys", async () => {
    const response = await request(testApp()).put("/api/settings").send({
      values: { SOURCE_TMDB_PROXY_MODE: "direct" },
      clearKeys: []
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, effectiveImmediately: true })
    expect(testSettings.sourceProxyMode("tmdb")).toBe("direct")

    const rejected = await request(testApp()).put("/api/settings").send({ values: { EVIL: "1" }, clearKeys: [] })
    expect(rejected.status).toBe(400)
  })

  it("tests a planned source without making it active", async () => {
    const response = await request(testApp()).post("/api/sources/imdb/test")

    expect(response.status).toBe(200)
    expect(response.body.implementationStatus).toBe("planned")
    expect(response.body.result.mode).toBe("source")
    expect(response.body.implementationStatus).not.toBe("active")
  })

  it("tests direct and unsaved proxy paths", async () => {
    const response = await request(testApp()).post("/api/settings/proxy/test").send({
      HTTP_PROXY: "http://new-http-proxy.test:7890",
      HTTPS_PROXY: "http://new-https-proxy.test:7890"
    })

    expect(response.status).toBe(200)
    expect(response.body.items.map((item: any) => item.mode)).toEqual(["direct", "http_proxy", "https_proxy"])
    expect(connectionTester.testProxy).toHaveBeenCalledTimes(3)
    expect(connectionTester.testProxy).toHaveBeenCalledWith(
      "https_proxy",
      "https://example.com/",
      expect.objectContaining({ HTTPS_PROXY: "http://new-https-proxy.test:7890" })
    )
  })

  it("rejects newline injection in unsaved proxy values", async () => {
    const response = await request(testApp()).post("/api/settings/proxy/test").send({
      HTTPS_PROXY: "http://proxy.test:7890\nINJECTED=yes"
    })

    expect(response.status).toBe(400)
    expect(connectionTester.testProxy).not.toHaveBeenCalled()
  })
})
