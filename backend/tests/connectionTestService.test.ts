import { describe, expect, it, vi } from "vitest"
import { Response } from "undici"
import type { SourceHttpClient } from "../src/utils/sourceHttpClient.js"
import { SourceHttpError } from "../src/utils/sourceHttpClient.js"
import { ConnectionTestService } from "../src/services/connectionTestService.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import { getSourceDefinition } from "../src/settings/sourceCatalog.js"

function settings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-connection-env"), values)
}

function httpClient(request: ReturnType<typeof vi.fn>): SourceHttpClient {
  return { request } as unknown as SourceHttpClient
}

describe("ConnectionTestService", () => {
  it("returns credential_missing before making a network request", async () => {
    const request = vi.fn()
    const service = new ConnectionTestService(settings({}), httpClient(request))

    const result = await service.testSource(getSourceDefinition("tmdb"))

    expect(result.errorType).toBe("credential_missing")
    expect(request).not.toHaveBeenCalled()
  })

  it("classifies DNS failures for a direct source", async () => {
    const error = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })
    const service = new ConnectionTestService(
      settings({ SOURCE_YOUKU_PROXY_MODE: "direct" }),
      httpClient(vi.fn(async () => { throw error }))
    )

    const result = await service.testSource(getSourceDefinition("youku"))

    expect(result.errorType).toBe("dns_error")
  })

  it("classifies connection refusal as proxy_unreachable when a proxy is selected", async () => {
    const error = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })
    const service = new ConnectionTestService(
      settings({
        TMDB_API_KEY: "test-key",
        HTTPS_PROXY: "http://proxy.test:7890",
        SOURCE_TMDB_PROXY_MODE: "inherit"
      }),
      httpClient(vi.fn(async () => { throw error }))
    )

    const result = await service.testSource(getSourceDefinition("tmdb"))

    expect(result.errorType).toBe("proxy_unreachable")
  })

  it("classifies Cloudflare 403 responses", async () => {
    const error = new SourceHttpError("HTTP 403", "tmdb", 403, "blocked by Cloudflare")
    const service = new ConnectionTestService(
      settings({ TMDB_API_KEY: "test-key", SOURCE_TMDB_PROXY_MODE: "direct" }),
      httpClient(vi.fn(async () => { throw error }))
    )

    const result = await service.testSource(getSourceDefinition("tmdb"))

    expect(result.errorType).toBe("cloudflare_blocked")
    expect(result.statusCode).toBe(403)
  })

  it.each([
    [Object.assign(new Error("aborted"), { name: "AbortError" }), "timeout"],
    [new SourceHttpError("HTTP 401", "tmdb", 401, "unauthorized"), "unauthorized"],
    [new SourceHttpError("HTTP 403", "tmdb", 403, "plain forbidden"), "forbidden"],
    [new SourceHttpError("HTTP 500", "tmdb", 500, "server error"), "http_error"],
    [new Error("socket closed"), "unknown"]
  ])("classifies %s as %s", async (error, expectedType) => {
    const service = new ConnectionTestService(
      settings({ TMDB_API_KEY: "test-key", SOURCE_TMDB_PROXY_MODE: "direct" }),
      httpClient(vi.fn(async () => { throw error }))
    )

    const result = await service.testSource(getSourceDefinition("tmdb"))

    expect(result.errorType).toBe(expectedType)
    expect(result.message.length).toBeLessThanOrEqual(500)
  })

  it("rate limits repeated tests against the same service", async () => {
    const startedAt: number[] = []
    const request = vi.fn(async () => {
      startedAt.push(Date.now())
      return new Response("ok", { status: 200 })
    })
    const service = new ConnectionTestService(
      settings({ SOURCE_YOUKU_PROXY_MODE: "direct" }),
      httpClient(request),
      20
    )

    await Promise.all([
      service.testSource(getSourceDefinition("youku")),
      service.testSource(getSourceDefinition("youku"))
    ])

    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(20)
  })
})
