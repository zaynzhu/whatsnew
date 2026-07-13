import { beforeEach, describe, expect, it } from "vitest"
import {
  reconcileDuplicateTmdbIdentities,
  reconcileUniqueTitleIdentities
} from "../src/services/duplicateIdentityService.js"
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

describe("reconcileUniqueTitleIdentities", () => {
  it("merges one source-only exact-title item into its unique external identity", async () => {
    const canonical = await testPrisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "A Shop for Killers",
        firstReleaseDate: "2024-01-17",
        originalLanguage: "ko",
        tmdbId: 215072,
        heatScore: 25
      }
    })
    const duplicate = await testPrisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "A Shop for Killers",
        originalLanguage: "en",
        heatScore: 10
      }
    })
    await testPrisma.mediaSourceRef.createMany({
      data: [
        { mediaItemId: canonical.id, source: "tmdb", sourceId: "tmdb-tv-215072" },
        { mediaItemId: duplicate.id, source: "disney_plus", sourceId: "disney-shop-for-killers" }
      ]
    })
    await testPrisma.release.create({
      data: {
        mediaItemId: duplicate.id,
        source: "disney_plus",
        platform: "Disney+",
        region: "US",
        releaseDate: "2026-07-15"
      }
    })

    const result = await reconcileUniqueTitleIdentities({ database: testPrisma, apply: true })
    const merged = await testPrisma.mediaItem.findUniqueOrThrow({
      where: { id: canonical.id },
      include: { sourceRefs: true, releases: true }
    })

    expect(result).toMatchObject({ groups: 1, merged: 1, ambiguous: 0 })
    expect(await testPrisma.mediaItem.count()).toBe(1)
    expect(merged.originalLanguage).toBe("ko")
    expect(merged.sourceRefs).toHaveLength(2)
    expect(merged.releases).toHaveLength(1)
  })

  it("leaves an unknown-language title separate when two identities are possible", async () => {
    await testPrisma.mediaItem.createMany({
      data: [
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "Love Island", firstReleaseDate: "2015-06-07", tmdbId: 1 },
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "Love Island", firstReleaseDate: "2019-07-09", tmdbId: 2 },
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "Love Island" }
      ]
    })

    const result = await reconcileUniqueTitleIdentities({ database: testPrisma, apply: true })

    expect(result).toMatchObject({ groups: 0, merged: 0, ambiguous: 1 })
    expect(await testPrisma.mediaItem.count()).toBe(3)
  })

  it("requires compatible release years for a non-platform source-only item", async () => {
    await testPrisma.mediaItem.createMany({
      data: [
        { mediaType: "movie", releaseForm: "theatrical_movie", titleDisplay: "The Gift", firstReleaseDate: "2015-08-07", originalLanguage: "en", tmdbId: 1 },
        { mediaType: "movie", releaseForm: "theatrical_movie", titleDisplay: "The Gift", firstReleaseDate: "2000-12-22", originalLanguage: "en" }
      ]
    })

    const result = await reconcileUniqueTitleIdentities({ database: testPrisma, apply: true })

    expect(result).toMatchObject({ groups: 0, merged: 0, ambiguous: 0 })
    expect(await testPrisma.mediaItem.count()).toBe(2)
  })
})
