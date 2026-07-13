import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  prunePosterCache,
  prunePosterVariantCache
} from "../src/services/posterVariantCacheMaintenanceService.js"

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "whatsnew-poster-prune-"))
  temporaryDirectories.push(directory)
  return directory
}

async function writeEntry(cacheDir: string, key: string, cachedAt: string, bodyBytes = 300): Promise<void> {
  await Promise.all([
    writeFile(join(cacheDir, `${key}.webp`), Buffer.alloc(bodyBytes, key.charCodeAt(0))),
    writeFile(join(cacheDir, `${key}.json`), JSON.stringify({
      url: `https://img.example.test/${key}.jpg`,
      requestedWidth: 320,
      sourceDigest: key.padEnd(64, "a").slice(0, 64),
      contentType: "image/webp",
      width: 320,
      height: 480,
      cachedAt
    }))
  ])
}

async function writePosterEntry(
  cacheDir: string,
  key: string,
  cachedAt: string,
  bodyBytes = 300
): Promise<void> {
  await Promise.all([
    writeFile(join(cacheDir, `${key}.bin`), Buffer.alloc(bodyBytes, key.charCodeAt(0))),
    writeFile(join(cacheDir, `${key}.json`), JSON.stringify({
      url: `https://img.example.test/${key}.jpg`,
      contentType: "image/jpeg",
      width: 600,
      height: 900,
      cachedAt
    }))
  ])
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true
  })))
})

describe("prunePosterVariantCache", () => {
  it("evicts the oldest complete entries until reaching the target capacity", async () => {
    const cacheDir = await temporaryDirectory()
    await writeEntry(cacheDir, "a", "2026-01-01T00:00:00.000Z")
    await writeEntry(cacheDir, "b", "2026-02-01T00:00:00.000Z")
    await writeEntry(cacheDir, "c", "2026-03-01T00:00:00.000Z")

    const result = await prunePosterVariantCache({ cacheDir, maxBytes: 800, apply: true })

    expect(result.mode).toBe("apply")
    expect(result.entriesBefore).toBe(3)
    expect(result.entriesAfter).toBe(1)
    expect(result.reasons.overCapacity).toBe(2)
    expect(result.bytesAfter).toBeLessThanOrEqual(result.targetBytes)
    await expect(access(join(cacheDir, "a.webp"))).rejects.toThrow()
    await expect(access(join(cacheDir, "b.webp"))).rejects.toThrow()
    await expect(access(join(cacheDir, "c.webp"))).resolves.toBeUndefined()
  })

  it("reports changes without deleting files in dry-run mode", async () => {
    const cacheDir = await temporaryDirectory()
    await writeEntry(cacheDir, "a", "2026-01-01T00:00:00.000Z")
    await writeEntry(cacheDir, "b", "2026-02-01T00:00:00.000Z")

    const result = await prunePosterVariantCache({ cacheDir, maxBytes: 400, apply: false })

    expect(result.mode).toBe("dry-run")
    expect(result.removedEntries).toBeGreaterThan(0)
    expect(await readdir(cacheDir)).toHaveLength(4)
  })

  it("cleans stale corrupt, orphaned and temporary files", async () => {
    const cacheDir = await temporaryDirectory()
    await Promise.all([
      writeFile(join(cacheDir, "broken.webp"), Buffer.alloc(0)),
      writeFile(join(cacheDir, "broken.json"), "{}"),
      writeFile(join(cacheDir, "orphan.webp"), Buffer.from("orphan")),
      writeFile(join(cacheDir, "write.webp.123.tmp"), Buffer.from("temporary"))
    ])

    const result = await prunePosterVariantCache({
      cacheDir,
      maxBytes: 1024,
      apply: true,
      writeGraceMs: 0,
      now: Date.now() + 1000
    })

    expect(result.reasons).toEqual({ corrupt: 1, orphaned: 1, temporary: 1, overCapacity: 0 })
    expect(result.entriesBefore).toBe(1)
    expect(result.entriesAfter).toBe(0)
    expect(await readdir(cacheDir)).toEqual([])
  })

  it("preserves fresh orphaned and temporary files during the write grace period", async () => {
    const cacheDir = await temporaryDirectory()
    await Promise.all([
      writeFile(join(cacheDir, "fresh.webp"), Buffer.from("fresh")),
      writeFile(join(cacheDir, "fresh.webp.123.tmp"), Buffer.from("temporary"))
    ])

    const result = await prunePosterVariantCache({ cacheDir, maxBytes: 1024, apply: true })

    expect(result.removedFiles).toBe(0)
    expect((await readdir(cacheDir)).sort()).toEqual(["fresh.webp", "fresh.webp.123.tmp"])
  })
})

describe("prunePosterCache", () => {
  it("evicts old original images with the shared capacity policy", async () => {
    const cacheDir = await temporaryDirectory()
    await writePosterEntry(cacheDir, "a", "2026-01-01T00:00:00.000Z")
    await writePosterEntry(cacheDir, "b", "2026-02-01T00:00:00.000Z")
    await writePosterEntry(cacheDir, "c", "2026-03-01T00:00:00.000Z")

    const result = await prunePosterCache({ cacheDir, maxBytes: 800, apply: true })

    expect(result.entriesBefore).toBe(3)
    expect(result.entriesAfter).toBe(1)
    expect(result.reasons.overCapacity).toBe(2)
    expect(result.bytesAfter).toBeLessThanOrEqual(result.targetBytes)
    await expect(access(join(cacheDir, "a.bin"))).rejects.toThrow()
    await expect(access(join(cacheDir, "b.bin"))).rejects.toThrow()
    await expect(access(join(cacheDir, "c.bin"))).resolves.toBeUndefined()
  })

  it("removes an invalid original-image pair after the grace period", async () => {
    const cacheDir = await temporaryDirectory()
    await Promise.all([
      writeFile(join(cacheDir, "broken.bin"), Buffer.from("not-an-image")),
      writeFile(join(cacheDir, "broken.json"), JSON.stringify({
        url: "https://img.example.test/broken.jpg",
        contentType: "text/html",
        cachedAt: "2026-01-01T00:00:00.000Z"
      }))
    ])

    const result = await prunePosterCache({
      cacheDir,
      maxBytes: 1024,
      apply: true,
      writeGraceMs: 0,
      now: Date.now() + 1000
    })

    expect(result.reasons.corrupt).toBe(1)
    expect(await readdir(cacheDir)).toEqual([])
  })
})
