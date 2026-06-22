import { describe, expect, it, vi } from "vitest"
import { Response } from "undici"
import { createTheTvdbClient } from "../src/clients/theTvdbClient.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import {
  SourceHttpClient,
  SourceHttpError,
  type SourceRequestOptions,
  type SourceTransport
} from "../src/utils/sourceHttpClient.js"

type FakeHandler = (url: string, options: SourceRequestOptions) => unknown | Promise<unknown>

function fakeHttpClient(handler: FakeHandler): SourceHttpClient {
  return {
    fetchJson: vi.fn(async (_sourceId: string, url: string, options: SourceRequestOptions) => {
      return handler(url, options)
    })
  } as unknown as SourceHttpClient
}

function transportHttpClient(transport: SourceTransport): SourceHttpClient {
  const settings = new RuntimeSettingsService(
    new EnvFileStore("/tmp/unused-whatsnew-thetvdb-env"),
    { SOURCE_THETVDB_PROXY_MODE: "direct" }
  )
  return new SourceHttpClient(settings, transport)
}

function mutableSettings(initialValues: Record<string, string>) {
  let values = { ...initialValues }
  const settings = {
    view: () => ({
      get: (key: string, fallback = "") => values[key] ?? fallback,
      getBoolean: () => false,
      sourceProxyMode: () => "inherit"
    })
  } as unknown as RuntimeSettingsService

  return {
    settings,
    update(nextValues: Record<string, string>) {
      values = { ...values, ...nextValues }
    }
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
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

  it.each([
    ["API Key", "THETVDB_API_KEY", "free-key-two"],
    ["PIN", "THETVDB_PIN", "pin-two"],
    ["Base URL", "THETVDB_BASE_URL", "https://context-two.test/v4"]
  ])("does not reuse a token after the runtime %s changes", async (_name, key, nextValue) => {
    const runtime = mutableSettings({
      THETVDB_API_KEY: "free-key-one",
      THETVDB_PIN: "pin-one",
      THETVDB_BASE_URL: "https://context-one.test/v4"
    })
    const loginRequests: Array<{ url: string, body: Record<string, string> }> = []
    const authorizations: string[] = []
    const httpClient = fakeHttpClient(async (url, options) => {
      if (url.endsWith("/login")) {
        loginRequests.push({ url, body: JSON.parse(options.body as string) })
        return { status: "success", data: { token: `token-${loginRequests.length}` } }
      }
      authorizations.push((options.headers as Record<string, string>).Authorization)
      return { status: "success", data: { id: authorizations.length } }
    })
    const client = createTheTvdbClient({ settings: runtime.settings, minIntervalMs: 0, httpClient })

    await client.getMovie(1)
    runtime.update({ [key]: nextValue })
    await client.getMovie(2)

    expect(loginRequests).toHaveLength(2)
    expect(authorizations).toEqual(["Bearer token-1", "Bearer token-2"])
  })

  it("does not share an in-flight login across runtime contexts", async () => {
    const runtime = mutableSettings({
      THETVDB_API_KEY: "free-key-one",
      THETVDB_PIN: "pin-one",
      THETVDB_BASE_URL: "https://context-one.test/v4"
    })
    const firstLogin = deferred<{ status: string, data: { token: string } }>()
    const loginUrls: string[] = []
    const dataRequests: Array<{ url: string, authorization: string }> = []
    const httpClient = fakeHttpClient(async (url, options) => {
      if (url.endsWith("/login")) {
        loginUrls.push(url)
        if (url.startsWith("https://context-one.test")) return firstLogin.promise
        return { status: "success", data: { token: "token-two" } }
      }
      dataRequests.push({
        url,
        authorization: (options.headers as Record<string, string>).Authorization
      })
      return { status: "success", data: { id: dataRequests.length } }
    })
    const client = createTheTvdbClient({ settings: runtime.settings, minIntervalMs: 0, httpClient })

    const firstRequest = client.getMovie(1)
    await vi.waitFor(() => expect(loginUrls).toHaveLength(1))
    runtime.update({
      THETVDB_API_KEY: "free-key-two",
      THETVDB_PIN: "pin-two",
      THETVDB_BASE_URL: "https://context-two.test/v4"
    })
    const secondRequest = client.getSeries(2)
    firstLogin.resolve({ status: "success", data: { token: "token-one" } })
    await Promise.all([firstRequest, secondRequest])

    expect(loginUrls).toEqual([
      "https://context-one.test/v4/login",
      "https://context-two.test/v4/login"
    ])
    expect(dataRequests).toEqual(expect.arrayContaining([
      {
        url: "https://context-one.test/v4/movies/1/extended?short=true",
        authorization: "Bearer token-one"
      },
      {
        url: "https://context-two.test/v4/series/2/extended?short=true",
        authorization: "Bearer token-two"
      }
    ]))
  })

  it("does not clear a newer context token when an old context returns 401", async () => {
    const runtime = mutableSettings({
      THETVDB_API_KEY: "free-key-one",
      THETVDB_PIN: "pin-one",
      THETVDB_BASE_URL: "https://context-one.test/v4"
    })
    const loginCounts = new Map<string, number>()
    const dataRequests: Array<{ url: string, authorization: string }> = []
    const httpClient = fakeHttpClient(async (url, options) => {
      const contextName = url.includes("context-one") ? "one" : "two"
      if (url.endsWith("/login")) {
        const count = (loginCounts.get(contextName) ?? 0) + 1
        loginCounts.set(contextName, count)
        return { status: "success", data: { token: `token-${contextName}-${count}` } }
      }

      const authorization = (options.headers as Record<string, string>).Authorization
      dataRequests.push({ url, authorization })
      if (url.includes("/movies/2/") && authorization === "Bearer token-one-1") {
        throw new SourceHttpError("HTTP 401", "thetvdb", 401, "unauthorized")
      }
      return { status: "success", data: { id: dataRequests.length } }
    })
    const client = createTheTvdbClient({ settings: runtime.settings, minIntervalMs: 0, httpClient })

    await client.getMovie(1)
    runtime.update({
      THETVDB_API_KEY: "free-key-two",
      THETVDB_PIN: "pin-two",
      THETVDB_BASE_URL: "https://context-two.test/v4"
    })
    await client.getSeries(3)
    runtime.update({
      THETVDB_API_KEY: "free-key-one",
      THETVDB_PIN: "pin-one",
      THETVDB_BASE_URL: "https://context-one.test/v4"
    })
    await client.getMovie(2)
    runtime.update({
      THETVDB_API_KEY: "free-key-two",
      THETVDB_PIN: "pin-two",
      THETVDB_BASE_URL: "https://context-two.test/v4"
    })
    await client.getSeries(4)

    expect(loginCounts.get("one")).toBe(2)
    expect(loginCounts.get("two")).toBe(1)
    expect(dataRequests.filter((request) => request.url.includes("context-two"))).toEqual([
      {
        url: "https://context-two.test/v4/series/3/extended?short=true",
        authorization: "Bearer token-two-1"
      },
      {
        url: "https://context-two.test/v4/series/4/extended?short=true",
        authorization: "Bearer token-two-1"
      }
    ])
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

  it("redacts API Key and PIN echoed by a failed login", async () => {
    const apiKey = "login-api-key-secret"
    const pin = "login-pin-secret"
    const httpClient = transportHttpClient(vi.fn<SourceTransport>(async () => {
      return new Response(`echo ${apiKey} ${pin}`, { status: 400, statusText: "Bad Request" })
    }))
    const client = createTheTvdbClient({ apiKey, pin, minIntervalMs: 0, httpClient })

    const error = await captureError(client.getMovie(1)) as SourceHttpError

    expect(error).toBeInstanceOf(SourceHttpError)
    expect(error.statusCode).toBe(400)
    for (const secret of [apiKey, pin]) {
      expect(error.message).not.toContain(secret)
      expect(error.bodySnippet).not.toContain(secret)
    }
  })

  it("redacts credentials and token echoed by a non-401 data error", async () => {
    const apiKey = "data-api-key-secret"
    const pin = "data-pin-secret"
    const token = "data-token-secret"
    const httpClient = transportHttpClient(vi.fn<SourceTransport>(async (url) => {
      if (url.endsWith("/login")) {
        return new Response(JSON.stringify({ status: "success", data: { token } }), { status: 200 })
      }
      return new Response(`echo ${apiKey} ${pin} ${token}`, { status: 500, statusText: "Server Error" })
    }))
    const client = createTheTvdbClient({ apiKey, pin, minIntervalMs: 0, httpClient })

    const error = await captureError(client.getMovie(1)) as SourceHttpError

    expect(error).toBeInstanceOf(SourceHttpError)
    expect(error.statusCode).toBe(500)
    for (const secret of [apiKey, pin, token]) {
      expect(error.message).not.toContain(secret)
      expect(error.bodySnippet).not.toContain(secret)
    }
  })

  it("redacts credentials and refreshed token echoed by a second 401", async () => {
    const apiKey = "retry-api-key-secret"
    const pin = "retry-pin-secret"
    const tokens = ["retry-token-one-secret", "retry-token-two-secret"]
    let loginCount = 0
    let dataCount = 0
    const httpClient = transportHttpClient(vi.fn<SourceTransport>(async (url) => {
      if (url.endsWith("/login")) {
        const token = tokens[loginCount]
        loginCount += 1
        return new Response(JSON.stringify({ status: "success", data: { token } }), { status: 200 })
      }
      const token = tokens[Math.min(dataCount, tokens.length - 1)]
      dataCount += 1
      return new Response(`echo ${apiKey} ${pin} ${token}`, { status: 401, statusText: "Unauthorized" })
    }))
    const client = createTheTvdbClient({ apiKey, pin, minIntervalMs: 0, httpClient })

    const error = await captureError(client.getMovie(1)) as SourceHttpError

    expect(error).toBeInstanceOf(SourceHttpError)
    expect(error.statusCode).toBe(401)
    expect(loginCount).toBe(2)
    expect(dataCount).toBe(2)
    for (const secret of [apiKey, pin, ...tokens]) {
      expect(error.message).not.toContain(secret)
      expect(error.bodySnippet).not.toContain(secret)
    }
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
