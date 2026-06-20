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

function fakeSettings(values: Record<string, string>): RuntimeSettingsService {
  return new RuntimeSettingsService(new EnvFileStore("/tmp/unused-whatsnew-env"), values)
}

const fakeDispatcher = {} as Dispatcher

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
