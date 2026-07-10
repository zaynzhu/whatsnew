import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { RequestInit as UndiciRequestInit } from "undici"
import { Response } from "undici"
import { PosterImageService } from "../src/services/posterImageService.js"

let tempDir: string | null = null

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe("PosterImageService", () => {
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
})
