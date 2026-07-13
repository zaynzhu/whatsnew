import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { afterEach, describe, expect, it } from "vitest"
import type { PosterImage } from "../src/services/posterImageService.js"
import { PosterVariantService } from "../src/services/posterVariantService.js"

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "whatsnew-poster-variant-"))
  temporaryDirectories.push(directory)
  return directory
}

async function image(width: number, height: number): Promise<PosterImage> {
  return {
    body: await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 20, g: 90, b: 140 }
      }
    }).jpeg().toBuffer(),
    contentType: "image/jpeg",
    width,
    height,
    cacheHit: false,
    cacheStatus: "miss"
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true
  })))
})

describe("PosterVariantService", () => {
  it("creates and caches a bounded WebP variant", async () => {
    const cacheDir = await temporaryDirectory()
    const service = new PosterVariantService({ cacheDir })
    const original = await image(800, 1200)

    const first = await service.getVariant("https://img.example.test/poster.jpg", original, 320)
    const second = await service.getVariant("https://img.example.test/poster.jpg", original, 320)

    expect(first).toMatchObject({
      contentType: "image/webp",
      width: 320,
      height: 480,
      cacheStatus: "miss"
    })
    expect(second).toMatchObject({
      contentType: "image/webp",
      width: 320,
      height: 480,
      cacheStatus: "hit"
    })
    expect(second.body.equals(first.body)).toBe(true)
    expect((await sharp(first.body).metadata()).format).toBe("webp")
  })

  it("does not enlarge a small source image", async () => {
    const service = new PosterVariantService({ cacheDir: await temporaryDirectory() })
    const result = await service.getVariant(
      "https://img.example.test/small.jpg",
      await image(120, 180),
      640
    )

    expect(result.width).toBe(120)
    expect(result.height).toBe(180)
  })

  it("separates variants when source bytes change at the same URL", async () => {
    const cacheDir = await temporaryDirectory()
    const service = new PosterVariantService({ cacheDir })
    const url = "https://img.example.test/changing.jpg"

    const first = await service.getVariant(url, await image(800, 1200), 320)
    const second = await service.getVariant(url, await image(600, 600), 320)

    expect(first.height).toBe(480)
    expect(second.height).toBe(320)
    expect(second.cacheStatus).toBe("miss")
    expect((await readdir(cacheDir)).filter((name) => name.endsWith(".webp"))).toHaveLength(2)
  })
})
