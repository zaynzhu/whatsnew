import { describe, expect, it, vi } from "vitest"
import { createTraktClient } from "../src/clients/traktClient.js"
import type { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"
import type {
  SourceHttpClient,
  SourceRequestOptions
} from "../src/utils/sourceHttpClient.js"

describe("traktClient", () => {
  it("uses only the public client ID header and spaces request starts", async () => {
    const starts: number[] = []
    const fetchJson = vi.fn(async (_sourceId, _url, options) => {
      starts.push(Date.now())
      expect(options.headers).toEqual({
        "User-Agent": "WhatsNew/0.1",
        "trakt-api-key": "client-id",
        "trakt-api-version": "2"
      })
      expect(JSON.stringify(options.headers)).not.toContain("secret")
      expect(JSON.stringify(options.headers)).not.toContain("Bearer")
      return { ok: true }
    })
    const client = createTraktClient({
      clientId: "client-id",
      minIntervalMs: 5,
      httpClient: { fetchJson } as unknown as SourceHttpClient
    })

    await Promise.all([client.get("/movies/trending"), client.get("/shows/trending")])

    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(5)
  })

  it("rejects requests when the runtime client ID is empty", async () => {
    const settings = {
      view: () => ({
        get: () => "",
        getBoolean: () => false,
        sourceProxyMode: () => "inherit"
      })
    } as unknown as RuntimeSettingsService
    const client = createTraktClient({
      settings,
      httpClient: { fetchJson: vi.fn() } as unknown as SourceHttpClient
    })

    await expect(client.get("/movies/trending")).rejects.toThrow("Trakt 凭据未配置")
  })

  it("trims the base URL and captures proxy settings for each request", async () => {
    let httpsProxy = "http://proxy-one.test:8080"
    const requests: Array<{ url: string, options: SourceRequestOptions }> = []
    const settings = {
      view: () => ({
        get: (key: string) => {
          if (key === "TRAKT_CLIENT_ID") return "runtime-client-id"
          if (key === "HTTPS_PROXY") return httpsProxy
          return ""
        },
        getBoolean: () => false,
        sourceProxyMode: () => "inherit"
      })
    } as unknown as RuntimeSettingsService
    const fetchJson = vi.fn(async (_sourceId: string, url: string, options: SourceRequestOptions) => {
      requests.push({ url, options })
      return { ok: true }
    })
    const client = createTraktClient({
      baseUrl: "https://trakt.test/",
      minIntervalMs: 0,
      settings,
      httpClient: { fetchJson } as unknown as SourceHttpClient
    })

    await client.get("/movies/trending")
    httpsProxy = "http://proxy-two.test:8080"
    await client.get("/shows/trending")

    expect(requests.map((request) => request.url)).toEqual([
      "https://trakt.test/movies/trending",
      "https://trakt.test/shows/trending"
    ])
    expect(requests[0].options.settingsOverride?.HTTPS_PROXY).toBe("http://proxy-one.test:8080")
    expect(requests[1].options.settingsOverride?.HTTPS_PROXY).toBe("http://proxy-two.test:8080")
  })
})
