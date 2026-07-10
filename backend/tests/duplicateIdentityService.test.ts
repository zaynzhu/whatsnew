import { beforeEach, describe, expect, it } from "vitest"
import { reconcileDuplicateTmdbIdentities } from "../src/services/duplicateIdentityService.js"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"

beforeEach(async () => {
  await resetTestDatabase()
})

describe("reconcileDuplicateTmdbIdentities", () => {
  it("previews without modifying duplicate TMDb identities", async () => {
    await testPrisma.mediaItem.createMany({
      data: [
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "House of the Dragon", tmdbId: 94997 },
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "权力的游戏前传：龙族", tmdbId: 94997 }
      ]
    })

    const result = await reconcileDuplicateTmdbIdentities({ database: testPrisma })

    expect(result).toMatchObject({ groups: 1, merged: 0, conflicts: 0 })
    expect(await testPrisma.mediaItem.count()).toBe(2)
  })

  it("merges relations and localized titles into the richer canonical item", async () => {
    const canonical = await testPrisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "House of the Dragon",
        tmdbId: 94997,
        tvmazeId: 44778,
        traktId: 154574,
        heatScore: 82
      }
    })
    const duplicate = await testPrisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "权力的游戏前传：龙族",
        tmdbId: 94997,
        posterUrl: "https://image.test/dragon.jpg",
        heatScore: 91
      }
    })
    await testPrisma.mediaSourceRef.createMany({
      data: [
        { mediaItemId: canonical.id, source: "trakt", sourceId: "trakt:154574" },
        { mediaItemId: duplicate.id, source: "tmdb", sourceId: "tmdb-tv-94997" }
      ]
    })
    await testPrisma.release.createMany({
      data: [
        { mediaItemId: canonical.id, source: "trakt", platform: "HBO", region: "US", releaseDate: "2026-07-12" },
        { mediaItemId: duplicate.id, source: "tmdb", platform: "TMDb TV", region: "GLOBAL", releaseDate: "2026-07-12" }
      ]
    })

    const result = await reconcileDuplicateTmdbIdentities({ database: testPrisma, apply: true })
    const merged = await testPrisma.mediaItem.findUniqueOrThrow({
      where: { id: canonical.id },
      include: { sourceRefs: true, releases: true }
    })

    expect(result).toMatchObject({ groups: 1, merged: 1, conflicts: 0 })
    expect(await testPrisma.mediaItem.count()).toBe(1)
    expect(merged).toMatchObject({ posterUrl: "https://image.test/dragon.jpg", heatScore: 91 })
    expect(JSON.parse(merged.titleAliases)).toContain("权力的游戏前传：龙族")
    expect(merged.sourceRefs).toHaveLength(2)
    expect(merged.releases).toHaveLength(2)
  })

  it("refuses to merge conflicting external identities", async () => {
    await testPrisma.mediaItem.createMany({
      data: [
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "One", tmdbId: 100, tvmazeId: 1 },
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "Two", tmdbId: 100, tvmazeId: 2 }
      ]
    })

    const result = await reconcileDuplicateTmdbIdentities({ database: testPrisma, apply: true })

    expect(result).toMatchObject({ groups: 1, merged: 0, conflicts: 1 })
    expect(await testPrisma.mediaItem.count()).toBe(2)
  })
})
