import { describe, expect, it, vi } from "vitest"
import { createTheTvdbClient } from "../src/clients/theTvdbClient.js"
import type { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import {
  SourceHttpError,
  type SourceHttpClient,
  type SourceRequestOptions
} from "../src/utils/sourceHttpClient.js"

type FakeHandler = (url: string, options: SourceRequestOptions) => unknown | Promise<unknown>

function fakeHttpClient(handler: FakeHandler): SourceHttpClient {
  return {
    fetchJson: vi.fn(async (_sourceId: string, url: string, options: SourceRequestOptions) => {
      return handler(url, options)
    })
  } as unknown as SourceHttpClient
}

async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    return error as Error
  }
  throw new Error("期望请求失败")
}

describe("theTvdbClient", () => {
  it("omits pin when only a free project key is configured", async () => {
    const requests: Array<{ url: string, body?: string, headers?: HeadersInit }> = []
    const httpClient = fakeHttpClient(async (url, options) => {
      requests.push({ url, body: options.body as string | undefined, headers: options.headers })
      if (url.endsWith("/login")) return { status: "success", data: { token: "memory-token" } }
      return { status: "success", data: [], links: { next: null } }
    })
    const client = createTheTvdbClient({
      apiKey: "free-key",
      pin: "",
      minIntervalMs: 0,
      httpClient
    })

    await client.getUpdates("movies", 123, 0)

    expect(JSON.parse(requests[0].body ?? "{}")).toEqual({ apikey: "free-key" })
    expect(requests[1].headers).toMatchObject({ Authorization: "Bearer memory-token" })
  })

  it("includes pin only when explicitly configured", async () => {
    const bodies: string[] = []
    const httpClient = fakeHttpClient(async (url, options) => {
      if (url.endsWith("/login")) {
        bodies.push(options.body as string)
        return { status: "success", data: { token: "memory-token" } }
      }
      return { status: "success", data: { id: 1 } }
    })
    const client = createTheTvdbClient({
      apiKey: "free-key",
      pin: "subscriber-pin",
      minIntervalMs: 0,
      httpClient
    })

    await client.getMovie(1)

    expect(JSON.parse(bodies[0])).toEqual({ apikey: "free-key", pin: "subscriber-pin" })
  })

  it("reuses the in-memory token and never persists it", async () => {
    const loginRequests: string[] = []
    const update = vi.fn()
    const snapshot = vi.fn(() => ({ THETVDB_API_KEY: "free-key" }))
    const settings = {
      view: () => ({
        get: (key: string) => key === "THETVDB_API_KEY" ? "free-key" : "",
        getBoolean: () => false,
        sourceProxyMode: () => "inherit"
      }),
      update,
      snapshot
    } as unknown as RuntimeSettingsService
    const httpClient = fakeHttpClient(async (url) => {
      if (url.endsWith("/login")) {
        loginRequests.push(url)
        return { status: "success", data: { token: "memory-token" } }
      }
      return { status: "success", data: { id: url.includes("/movies/") ? 1 : 2 } }
    })
    const client = createTheTvdbClient({ settings, minIntervalMs: 0, httpClient })

    await client.getMovie(1)
    await client.getSeries(2)

    expect(loginRequests).toHaveLength(1)
    expect(update).not.toHaveBeenCalled()
    expect(JSON.stringify(snapshot())).not.toContain("memory-token")
  })

  it("refreshes once after 401 and retries the original request", async () => {
    const loginRequests: string[] = []
    const movieRequests: string[] = []
    const httpClient = fakeHttpClient(async (url) => {
      if (url.endsWith("/login")) {
        loginRequests.push(url)
        return { status: "success", data: { token: `memory-token-${loginRequests.length}` } }
      }
      movieRequests.push(url)
      if (movieRequests.length === 1) {
        throw new SourceHttpError("HTTP 401", "thetvdb", 401, "unauthorized")
      }
      return { status: "success", data: { id: 1 } }
    })
    const client = createTheTvdbClient({
      apiKey: "free-key",
      minIntervalMs: 0,
      httpClient
    })

    await expect(client.getMovie(1)).resolves.toMatchObject({ id: 1 })
    expect(loginRequests).toHaveLength(2)
    expect(movieRequests).toHaveLength(2)
  })

  it("rejects a second 401 without entering another refresh loop", async () => {
    const loginRequests: string[] = []
    const movieRequests: string[] = []
    const unauthorized = new SourceHttpError("HTTP 401", "thetvdb", 401, "unauthorized")
    const httpClient = fakeHttpClient(async (url) => {
      if (url.endsWith("/login")) {
        loginRequests.push(url)
        return { status: "success", data: { token: `memory-token-${loginRequests.length}` } }
      }
      movieRequests.push(url)
      throw unauthorized
    })
    const client = createTheTvdbClient({
      apiKey: "free-key",
      minIntervalMs: 0,
      httpClient
    })

    await expect(client.getMovie(1)).rejects.toBe(unauthorized)
    expect(loginRequests).toHaveLength(2)
    expect(movieRequests).toHaveLength(2)
  })

  it("rejects requests when the free project key is missing", async () => {
    const settings = {
      view: () => ({
        get: () => "",
        getBoolean: () => false,
        sourceProxyMode: () => "inherit"
      })
    } as unknown as RuntimeSettingsService
    const client = createTheTvdbClient({
      settings,
      httpClient: fakeHttpClient(async () => ({}))
    })

    await expect(client.getMovie(1)).rejects.toThrow("TheTVDB 凭据未配置")
  })

  it("rejects a login response without a token without leaking credentials", async () => {
    const apiKey = "free-key-secret"
    const pin = "pin-secret"
    const httpClient = fakeHttpClient(async () => ({ status: "success", data: {} }))
    const client = createTheTvdbClient({ apiKey, pin, minIntervalMs: 0, httpClient })

    const error = await captureError(client.getMovie(1))

    expect(error.message).toBe("TheTVDB 登录响应缺少 Token")
    expect(error.message).not.toContain(apiKey)
    expect(error.message).not.toContain(pin)
  })

  it("spaces login and authenticated request starts with one limiter", async () => {
    vi.useFakeTimers()
    try {
      const starts: number[] = []
      const httpClient = fakeHttpClient(async (url) => {
        starts.push(Date.now())
        if (url.endsWith("/login")) return { status: "success", data: { token: "memory-token" } }
        return { status: "success", data: { id: url.includes("/movies/") ? 1 : 2 } }
      })
      const client = createTheTvdbClient({
        apiKey: "free-key",
        minIntervalMs: 5,
        httpClient
      })

      const requests = Promise.all([client.getMovie(1), client.getSeries(2)])
      await vi.runAllTimersAsync()
      await requests

      expect(starts).toHaveLength(3)
      expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(5)
      expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it("uses the exact v4 endpoints and unwraps official response envelopes", async () => {
    const requests: string[] = []
    const httpClient = fakeHttpClient(async (url) => {
      requests.push(url)
      if (url.endsWith("/login")) return { status: "success", data: { token: "memory-token" } }
      if (url.includes("/updates?")) {
        return {
          status: "success",
          data: [{ recordId: 3, methodInt: 1, timeStamp: 123 }],
          links: { next: null }
        }
      }
      return { status: "success", data: { id: url.includes("/movies/") ? 1 : 2 } }
    })
    const client = createTheTvdbClient({
      apiKey: "free-key",
      baseUrl: "https://thetvdb.test/v4/",
      minIntervalMs: 0,
      httpClient
    })

    await expect(client.getUpdates("series", 123, 4)).resolves.toMatchObject({
      data: [{ recordId: 3 }],
      links: { next: null }
    })
    await expect(client.getMovie(1)).resolves.toEqual({ id: 1 })
    await expect(client.getSeries(2)).resolves.toEqual({ id: 2 })

    expect(requests).toEqual([
      "https://thetvdb.test/v4/login",
      "https://thetvdb.test/v4/updates?since=123&type=series&page=4",
      "https://thetvdb.test/v4/movies/1/extended?short=true",
      "https://thetvdb.test/v4/series/2/extended?short=true"
    ])
  })

  it("names a missing-data endpoint without exposing its response or token", async () => {
    const token = "memory-token-secret"
    const responseSecret = "response-body-secret"
    const httpClient = fakeHttpClient(async (url) => {
      if (url.endsWith("/login")) return { status: "success", data: { token } }
      return { status: "failure", error: responseSecret }
    })
    const client = createTheTvdbClient({
      apiKey: "free-key",
      minIntervalMs: 0,
      httpClient
    })

    const error = await captureError(client.getSeries(2))

    expect(error.message).toContain("/series/2/extended")
    expect(error.message).not.toContain(responseSecret)
    expect(error.message).not.toContain(token)
  })
})
