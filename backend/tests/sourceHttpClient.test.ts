import type { Dispatcher } from "undici"
import { Response } from "undici"
import { describe, expect, it, vi } from "vitest"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { resolveProxy } from "../src/settings/proxyResolver.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import {
  SourceHttpClient,
  SourceHttpError,
  type SourceTransport
} from "../src/utils/sourceHttpClient.js"
import { runWithSourceSyncSignal } from "../src/utils/sourceSyncContext.js"

function fakeSettings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-whatsnew-env"), values)
}

const fakeDispatcher = {} as Dispatcher

async function captureError<T extends Error>(promise: Promise<unknown>): Promise<T> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    return error as T
  }
  throw new Error("期望请求失败")
}

describe("resolveProxy", () => {
  it("uses protocol-specific global proxy in inherit mode", () => {
    const settings = fakeSettings({
      HTTP_PROXY: "http://proxy.test:8080",
      HTTPS_PROXY: "http://proxy.test:8443",
      SOURCE_TMDB_PROXY_MODE: "inherit"
    })
    expect(resolveProxy(settings, "tmdb", "http://example.com")).toBe("http://proxy.test:8080")
    expect(resolveProxy(settings, "tmdb", "https://example.com")).toBe("http://proxy.test:8443")
  })

  it("forces direct mode even when a global proxy exists", () => {
    const settings = fakeSettings({ HTTPS_PROXY: "http://proxy.test:8443", SOURCE_YOUKU_PROXY_MODE: "direct" })
    expect(resolveProxy(settings, "youku", "https://tv.youku.com")).toBeNull()
  })

  it("uses a source custom proxy", () => {
    const settings = fakeSettings({
      SOURCE_TMDB_PROXY_MODE: "custom",
      SOURCE_TMDB_HTTPS_PROXY: "http://custom.test:7890"
    })
    expect(resolveProxy(settings, "tmdb", "https://api.themoviedb.org")).toBe("http://custom.test:7890")
  })
})

describe("SourceHttpClient", () => {
  it("retries one transient network failure in the production retry mode", async () => {
    const transport = vi.fn<SourceTransport>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
    const client = new SourceHttpClient(
      fakeSettings({ SOURCE_TVMAZE_PROXY_MODE: "direct" }),
      transport,
      undefined,
      0,
      2
    )

    await expect(client.fetchText("tvmaze", "https://api.tvmaze.test/shows", {
      timeoutMs: 1000,
      retryDelayMs: 0
    })).resolves.toBe("ok")
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it("retries server errors but not ordinary client errors", async () => {
    const serverTransport = vi.fn<SourceTransport>()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
    const serverClient = new SourceHttpClient(fakeSettings({}), serverTransport, undefined, 0, 2)

    await expect(serverClient.fetchText("tmdb", "https://api.example.test/server", {
      timeoutMs: 1000,
      retryDelayMs: 0
    })).resolves.toBe("ok")
    expect(serverTransport).toHaveBeenCalledTimes(2)

    const clientTransport = vi.fn<SourceTransport>(async () => new Response("missing", { status: 404 }))
    const client = new SourceHttpClient(fakeSettings({}), clientTransport, undefined, 0, 2)
    await expect(client.fetchText("tmdb", "https://api.example.test/missing", {
      timeoutMs: 1000,
      retryDelayMs: 0
    })).rejects.toMatchObject({ statusCode: 404 })
    expect(clientTransport).toHaveBeenCalledTimes(1)
  })

  it("does not automatically retry non-idempotent requests", async () => {
    const transport = vi.fn<SourceTransport>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
    const client = new SourceHttpClient(fakeSettings({}), transport, undefined, 0, 2)

    await expect(client.fetchText("thetvdb", "https://api.example.test/login", {
      method: "POST",
      timeoutMs: 1000,
      retryDelayMs: 0
    })).rejects.toThrow("fetch failed")
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("starts timeout accounting after a request leaves the rate-limit queue", async () => {
    const transport = vi.fn<SourceTransport>(async (_url, options) => {
      if (options?.signal?.aborted) throw options.signal.reason
      return new Response("ok", { status: 200 })
    })
    const client = new SourceHttpClient(fakeSettings({}), transport, undefined, 60)

    await client.fetchText("tmdb", "https://api.example.test/first", { timeoutMs: 10 })
    await expect(client.fetchText("tmdb", "https://api.example.test/second", {
      timeoutMs: 10
    })).resolves.toBe("ok")
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it("spaces runtime request starts across callers for the same service", async () => {
    vi.useFakeTimers()
    try {
      const starts: number[] = []
      const transport = vi.fn<SourceTransport>(async () => {
        starts.push(Date.now())
        return new Response("ok", { status: 200 })
      })
      const client = new SourceHttpClient(
        fakeSettings({ SOURCE_TRAKT_PROXY_MODE: "direct" }),
        transport,
        undefined,
        2000
      )

      const first = client.fetchText("trakt", "https://api.trakt.test/one", { timeoutMs: 5000 })
      const second = client.fetchText("trakt", "https://api.trakt.test/two", { timeoutMs: 5000 })
      await vi.advanceTimersByTimeAsync(0)
      expect(starts).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1999)
      expect(starts).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1)
      await Promise.all([first, second])
      expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(2000)
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps response bodies out of persisted error messages", async () => {
    const responseBody = "opaque-server-response-body"
    const transport = vi.fn<SourceTransport>(async () => new Response(responseBody, {
      status: 500,
      statusText: "Server Error"
    }))
    const client = new SourceHttpClient(fakeSettings({ SOURCE_TMDB_PROXY_MODE: "direct" }), transport)

    const error = await captureError<SourceHttpError>(client.fetchText(
      "tmdb",
      "https://api.example.test/data",
      { timeoutMs: 1000 }
    ))

    expect(error.bodySnippet).toContain(responseBody)
    expect(error.message).not.toContain(responseBody)
  })

  it("passes a dispatcher only when a proxy resolves and reuses it", async () => {
    const transport = vi.fn<SourceTransport>(async () => new Response("{}", { status: 200 }))
    const createDispatcher = vi.fn(() => fakeDispatcher)
    const client = new SourceHttpClient(
      fakeSettings({ HTTPS_PROXY: "http://proxy.test:7890" }),
      transport,
      createDispatcher
    )

    await client.fetchJson("tmdb", "https://api.example.test/data", { timeoutMs: 1000 })
    await client.fetchJson("tmdb", "https://api.example.test/other", { timeoutMs: 1000 })

    expect(transport.mock.calls[0][1]?.dispatcher).toBe(fakeDispatcher)
    expect(createDispatcher).toHaveBeenCalledTimes(1)
  })

  it("omits the dispatcher for direct requests", async () => {
    const transport = vi.fn<SourceTransport>(async () => new Response("ok", { status: 200 }))
    const client = new SourceHttpClient(fakeSettings({ SOURCE_YOUKU_PROXY_MODE: "direct" }), transport)

    await client.fetchText("youku", "https://tv.youku.com/", { timeoutMs: 1000 })

    expect(transport.mock.calls[0][1]?.dispatcher).toBeUndefined()
  })

  it("returns binary response data as a buffer", async () => {
    const transport = vi.fn<SourceTransport>(async () => {
      return new Response(Uint8Array.from([80, 75, 3, 4]), { status: 200 })
    })
    const client = new SourceHttpClient(
      fakeSettings({ SOURCE_NETFLIX_PROXY_MODE: "direct" }),
      transport
    )

    const buffer = await client.fetchBuffer("netflix", "https://example.test/data.xlsx", {
      timeoutMs: 1000
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect([...buffer]).toEqual([80, 75, 3, 4])
  })

  it("uses unsaved settings overrides without mutating live settings", async () => {
    const settings = fakeSettings({ HTTPS_PROXY: "http://old-proxy.test:7890" })
    const transport = vi.fn<SourceTransport>(async () => new Response("{}", { status: 200 }))
    const createDispatcher = vi.fn(() => fakeDispatcher)
    const client = new SourceHttpClient(settings, transport, createDispatcher)

    await client.fetchJson("tmdb", "https://api.example.test/data", {
      timeoutMs: 1000,
      settingsOverride: { HTTPS_PROXY: "http://new-proxy.test:7890" }
    })

    expect(createDispatcher).toHaveBeenCalledWith("http://new-proxy.test:7890")
    expect(settings.get("HTTPS_PROXY")).toBe("http://old-proxy.test:7890")
  })

  it("aborts requests after the configured timeout", async () => {
    const transport = vi.fn<SourceTransport>(async (_url, options) => {
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true })
      })
    })
    const client = new SourceHttpClient(fakeSettings({ SOURCE_TMDB_PROXY_MODE: "direct" }), transport)

    await expect(client.fetchText("tmdb", "https://api.example.test/slow", { timeoutMs: 5 })).rejects.toMatchObject({
      name: "TimeoutError"
    })
  })

  it("aborts requests when the enclosing source sync is cancelled", async () => {
    const transport = vi.fn<SourceTransport>(async (_url, options) => {
      return new Promise<Response>((_resolve, reject) => {
        if (options?.signal?.aborted) {
          reject(options.signal.reason)
          return
        }
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true })
      })
    })
    const client = new SourceHttpClient(fakeSettings({ SOURCE_TRAKT_PROXY_MODE: "direct" }), transport)
    const controller = new AbortController()
    const request = runWithSourceSyncSignal(controller.signal, () => {
      return client.fetchText("trakt", "https://api.example.test/slow", { timeoutMs: 1000 })
    })

    controller.abort(new DOMException("来源同步超时", "TimeoutError"))

    await expect(request).rejects.toMatchObject({
      name: "TimeoutError",
      message: "来源同步超时"
    })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("throws a redacted bounded error for failed HTTP responses", async () => {
    const secret = "super-secret-key"
    const responseBody = `request failed for ${secret} ${"x".repeat(600)}`
    const transport = vi.fn<SourceTransport>(async () => new Response(responseBody, {
      status: 403,
      statusText: "Forbidden"
    }))
    const client = new SourceHttpClient(fakeSettings({ SOURCE_TMDB_PROXY_MODE: "direct" }), transport)

    const error = await client.fetchText(
      "tmdb",
      `https://api.example.test/data?api_key=${secret}&token=${secret}`,
      { timeoutMs: 1000 }
    ).catch((caught) => caught)

    expect(error).toBeInstanceOf(SourceHttpError)
    expect(error).toMatchObject({ statusCode: 403, sourceId: "tmdb" })
    expect(error.bodySnippet.length).toBeLessThanOrEqual(500)
    expect(error.message).not.toContain(secret)
    expect(error.bodySnippet).not.toContain(secret)
  })

  it("redacts only explicitly supplied sensitive values while preserving HTTP metadata", async () => {
    const apiKey = "explicit-api-key"
    const pin = "explicit-pin"
    const token = "explicit-token"
    const transport = vi.fn<SourceTransport>(async () => new Response(
      `echo ${apiKey} ${pin} ${token}`,
      { status: 418, statusText: "Teapot" }
    ))
    const client = new SourceHttpClient(fakeSettings({ SOURCE_THETVDB_PROXY_MODE: "direct" }), transport)

    const error = await client.fetchText("thetvdb", "https://api.example.test/data", {
      timeoutMs: 1000,
      sensitiveValues: [apiKey, pin, token]
    }).catch((caught) => caught)

    expect(error).toBeInstanceOf(SourceHttpError)
    expect(error).toMatchObject({ statusCode: 418, sourceId: "thetvdb" })
    for (const secret of [apiKey, pin, token]) {
      expect(error.message).not.toContain(secret)
      expect(error.bodySnippet).not.toContain(secret)
    }
  })

  it("redacts a string cause thrown by the transport", async () => {
    const secret = "string-cause-secret"
    const transport = vi.fn<SourceTransport>(async () => {
      throw new Error("transport failed", { cause: `nested ${secret}` })
    })
    const client = new SourceHttpClient(fakeSettings({ SOURCE_THETVDB_PROXY_MODE: "direct" }), transport)

    const error = await captureError<Error & { cause?: unknown }>(client.fetchText(
      "thetvdb",
      "https://api.example.test/data",
      {
        timeoutMs: 1000,
        sensitiveValues: [secret]
      }
    ))

    expect(error.cause).toBeTypeOf("string")
    expect(error.cause).not.toContain(secret)
  })

  it("preserves SourceHttpError type and metadata while redacting all recursive fields", async () => {
    const secret = "source-http-error-secret"
    const sourceError = new SourceHttpError(
      `HTTP 401 ${secret}`,
      "thetvdb",
      401,
      `body ${secret}`,
      "edge-server"
    ) as SourceHttpError & { cause?: unknown }
    sourceError.cause = new Error(`nested ${secret}`)
    const transport = vi.fn<SourceTransport>(async () => {
      throw sourceError
    })
    const client = new SourceHttpClient(fakeSettings({ SOURCE_THETVDB_PROXY_MODE: "direct" }), transport)

    const error = await captureError<SourceHttpError>(client.fetchText(
      "thetvdb",
      "https://api.example.test/data",
      {
        timeoutMs: 1000,
        sensitiveValues: [secret]
      }
    ))

    expect(error).toBeInstanceOf(SourceHttpError)
    expect(error).toMatchObject({
      sourceId: "thetvdb",
      statusCode: 401,
      serverHeader: "edge-server"
    })
    expect(error.message).not.toContain(secret)
    expect(error.bodySnippet).not.toContain(secret)
    expect(error.cause).toBeInstanceOf(Error)
    expect((error.cause as Error).message).not.toContain(secret)
  })

  it("redacts the complete proxy URL when dispatcher creation fails", async () => {
    const proxyUrl = "http://proxy-user:proxy-password@proxy.internal:7890"
    const createDispatcher = vi.fn(() => {
      throw new Error(`invalid proxy ${proxyUrl}`)
    })
    const client = new SourceHttpClient(
      fakeSettings({ HTTPS_PROXY: proxyUrl }),
      vi.fn<SourceTransport>(),
      createDispatcher
    )

    const error = await client.fetchText("tmdb", "https://api.example.test/data", {
      timeoutMs: 1000
    }).catch((caught) => caught)

    expect(error.message).not.toContain("proxy-user")
    expect(error.message).not.toContain("proxy-password")
    expect(error.message).not.toContain("proxy.internal")
  })
})
