import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Dispatcher, RequestInit as UndiciRequestInit } from "undici"
import { Response } from "undici"
import { PosterImageService } from "../src/services/posterImageService.js"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"

let tempDir: string | null = null

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe("PosterImageService", () => {
  it("measures image dimensions and restores them from disk cache", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-posters-"))
    const body = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAAA7MdV8AAAAFElEQVR42mNkYGD4z8DAwMAAAAcABP0C/QsAAAAASUVORK5CYII=",
      "base64"
    )
    const transport = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "image/png" }
    }))
    const service = new PosterImageService({ cacheDir: tempDir, transport, minIntervalMs: 0 })

    await expect(service.getPoster("https://img.test/measured.png")).resolves.toMatchObject({
      width: 1,
      height: 2,
      cacheStatus: "miss"
    })
    await expect(service.getPoster("https://img.test/measured.png")).resolves.toMatchObject({
      width: 1,
      height: 2,
      cacheStatus: "hit"
    })
  })

  it("fetches image bytes with origin referer and reuses disk cache", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-posters-"))
    const transport = vi.fn(async (_url: string, _options?: UndiciRequestInit) => {
      return new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "content-type": "image/jpeg" }
      })
    })
    const service = new PosterImageService({
      cacheDir: tempDir,
      transport,
      minIntervalMs: 0
    })
    const url = "https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2578474613.jpg"

    const first = await service.getPoster(url)
    const second = await service.getPoster(url)

    expect(first).toMatchObject({
      contentType: "image/jpeg",
      cacheHit: false
    })
    expect(first.body.toString()).toBe("image-bytes")
    expect(second).toMatchObject({
      contentType: "image/jpeg",
      cacheHit: true
    })
    expect(second.body.toString()).toBe("image-bytes")
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[1]?.headers).toMatchObject({
      referer: "https://img3.doubanio.com/"
    })
  })

  it("serves the downloaded image when the disk cache is not writable", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-posters-"))
    const invalidCacheDir = join(tempDir, "cache-file")
    await writeFile(invalidCacheDir, "not-a-directory")
    const body = Buffer.from("image-bytes")
    const transport = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    }))
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    const service = new PosterImageService({
      cacheDir: invalidCacheDir,
      transport,
      minIntervalMs: 0
    })

    await expect(service.getPoster("https://img.test/uncached.jpg")).resolves.toMatchObject({
      body,
      cacheHit: false,
      cacheStatus: "miss"
    })
    expect(warning).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith(
      "海报缓存写入失败，当前请求将返回未缓存图片",
      { code: "EEXIST" }
    )

    warning.mockRestore()
  })

  it("routes known poster hosts through their source proxy mode", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-posters-"))
    const settings = new RuntimeSettingsService(new EnvFileStore("/tmp/unused-poster-proxy-env"), {
      HTTPS_PROXY: "http://global-proxy.test:7890",
      SOURCE_DOUBAN_PROXY_MODE: "direct",
      SOURCE_IMDB_PROXY_MODE: "direct",
      SOURCE_TMDB_PROXY_MODE: "inherit"
    })
    const dispatcher = {} as Dispatcher
    const createDispatcher = vi.fn(() => dispatcher)
    const transport = vi.fn(async (_url: string, _options?: UndiciRequestInit) => {
      return new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "content-type": "image/jpeg" }
      })
    })
    const service = new PosterImageService({
      cacheDir: tempDir,
      settings,
      transport,
      createDispatcher,
      minIntervalMs: 0
    })

    await service.getPoster("https://img3.doubanio.com/view/photo/l_ratio_poster/public/p1.jpg")
    await service.getPoster("https://m.media-amazon.com/images/M/p2.jpg")
    await service.getPoster("https://image.tmdb.org/t/p/w500/p3.jpg")

    expect(transport.mock.calls[0]?.[1]?.dispatcher).toBeUndefined()
    expect(transport.mock.calls[1]?.[1]?.dispatcher).toBeUndefined()
    expect(transport.mock.calls[2]?.[1]?.dispatcher).toBe(dispatcher)
    expect(createDispatcher).toHaveBeenCalledOnce()
    expect(createDispatcher).toHaveBeenCalledWith("http://global-proxy.test:7890")
  })

  it("starts the request timeout after a poster leaves the rate-limit queue", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-posters-"))
    const transport = vi.fn(async (_url: string, options?: UndiciRequestInit) => {
      if (options?.signal?.aborted) throw options.signal.reason
      return new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "content-type": "image/jpeg" }
      })
    })
    const service = new PosterImageService({
      cacheDir: tempDir,
      transport,
      minIntervalMs: 60,
      timeoutMs: 10
    })

    await service.getPoster("https://image.tmdb.org/t/p/w500/first.jpg")
    const queued = await service.getPoster("https://image.tmdb.org/t/p/w500/second.jpg")

    expect(queued.body.toString()).toBe("image-bytes")
    expect(transport).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[1]?.[1]?.signal?.aborted).toBe(false)
  })

  it("deduplicates concurrent cold-cache requests for the same poster", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-posters-"))
    const transport = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return new Response(Buffer.from("shared-image"), {
        status: 200,
        headers: { "content-type": "image/webp" }
      })
    })
    const service = new PosterImageService({
      cacheDir: tempDir,
      transport,
      minIntervalMs: 0
    })
    const url = "https://image.tmdb.org/t/p/w500/shared.jpg"

    const images = await Promise.all([
      service.getPoster(url),
      service.getPoster(url),
      service.getPoster(url)
    ])

    expect(images.map((image) => image.body.toString())).toEqual([
      "shared-image",
      "shared-image",
      "shared-image"
    ])
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("serves an expired cached poster when upstream refresh fails", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-posters-"))
    const transport = vi.fn()
      .mockResolvedValueOnce(new Response(Buffer.from("stale-image"), {
        status: 200,
        headers: { "content-type": "image/jpeg" }
      }))
      .mockRejectedValueOnce(new Error("upstream unavailable"))
    const service = new PosterImageService({
      cacheDir: tempDir,
      transport,
      minIntervalMs: 0,
      cacheMaxAgeMs: -1
    })
    const url = "https://image.tmdb.org/t/p/w500/stale.jpg"

    await service.getPoster(url)
    const image = await service.getPoster(url)

    expect(image).toMatchObject({
      cacheHit: true,
      cacheStatus: "stale",
      contentType: "image/jpeg"
    })
    expect(image.body.toString()).toBe("stale-image")
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it("backs off repeated failures for an uncached poster", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-posters-"))
    const transport = vi.fn(async () => {
      throw new Error("upstream unavailable")
    })
    const service = new PosterImageService({
      cacheDir: tempDir,
      transport,
      minIntervalMs: 0,
      failureCooldownMs: 60_000
    })
    const url = "https://image.tmdb.org/t/p/w500/missing.jpg"

    await expect(service.getPoster(url)).rejects.toThrow("upstream unavailable")
    await expect(service.getPoster(url)).rejects.toThrow("upstream unavailable")

    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("rejects a corrupt disk entry and fetches a clean replacement", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "whatsnew-posters-"))
    const transport = vi.fn(async () => new Response(Buffer.from("valid-image"), {
      status: 200,
      headers: { "content-type": "image/png" }
    }))
    const url = "https://image.tmdb.org/t/p/w500/corrupt.jpg"
    const firstService = new PosterImageService({ cacheDir: tempDir, transport, minIntervalMs: 0 })
    await firstService.getPoster(url)
    const bodyFile = (await readdir(tempDir)).find((name) => name.endsWith(".bin"))
    if (!bodyFile) throw new Error("测试缓存文件未创建")
    await writeFile(join(tempDir, bodyFile), Buffer.alloc(0))

    const secondService = new PosterImageService({ cacheDir: tempDir, transport, minIntervalMs: 0 })
    const image = await secondService.getPoster(url)

    expect(image.cacheStatus).toBe("miss")
    expect(image.body.toString()).toBe("valid-image")
    expect(transport).toHaveBeenCalledTimes(2)
  })
})
