import { beforeEach, describe, expect, it } from "vitest"
import {
  reconcileDuplicateStableIdentities,
  reconcileSharedDateTitles,
  reconcileUniqueTitleIdentities
} from "../src/services/duplicateIdentityService.js"
import { resetTestDatabase, testPrisma } from "./helpers/testDatabase.js"

beforeEach(async () => {
  await resetTestDatabase()
})

describe("reconcileDuplicateStableIdentities", () => {
  it("previews without modifying duplicate TMDb identities", async () => {
    await testPrisma.mediaItem.createMany({
      data: [
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "House of the Dragon", tmdbId: 94997 },
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "权力的游戏前传：龙族", tmdbId: 94997 }
      ]
    })

    const result = await reconcileDuplicateStableIdentities({ database: testPrisma })

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

    const result = await reconcileDuplicateStableIdentities({ database: testPrisma, apply: true })
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

    const result = await reconcileDuplicateStableIdentities({ database: testPrisma, apply: true })

    expect(result).toMatchObject({ groups: 1, merged: 0, conflicts: 1 })
    expect(await testPrisma.mediaItem.count()).toBe(2)
  })

  it("merges specialized and generic content types within one series identity", async () => {
    const anime = await testPrisma.mediaItem.create({
      data: {
        mediaType: "anime",
        releaseForm: "animated_series",
        titleDisplay: "尼古喵喵",
        tmdbId: 312949,
        imdbId: "tt39551330",
        tvdbId: 473423,
        posterUrl: "https://image.test/chainsmoker-cat.jpg"
      }
    })
    const series = await testPrisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "Chainsmoker Cat",
        tmdbId: 312949,
        imdbId: "tt39551330",
        traktId: 315787,
        tvdbId: 473423
      }
    })
    await testPrisma.mediaSourceRef.createMany({
      data: [
        { mediaItemId: anime.id, source: "tmdb", sourceId: "tmdb-tv-312949" },
        { mediaItemId: series.id, source: "trakt", sourceId: "trakt:show:315787" }
      ]
    })

    const result = await reconcileDuplicateStableIdentities({ database: testPrisma, apply: true })
    const merged = await testPrisma.mediaItem.findUniqueOrThrow({
      where: { id: anime.id },
      include: { sourceRefs: true }
    })

    expect(result).toMatchObject({ groups: 1, merged: 1, conflicts: 0 })
    expect(merged).toMatchObject({
      mediaType: "anime",
      releaseForm: "animated_series",
      traktId: 315787,
      posterUrl: "https://image.test/chainsmoker-cat.jpg"
    })
    expect(JSON.parse(merged.titleAliases)).toContain("Chainsmoker Cat")
    expect(merged.sourceRefs).toHaveLength(2)
  })

  it("keeps the larger poster when both duplicate images are healthy and adequate", async () => {
    const documentary = await testPrisma.mediaItem.create({
      data: {
        mediaType: "documentary",
        releaseForm: "documentary_series",
        titleDisplay: "On Patrol: First Shift",
        posterUrl: "https://image.test/smaller.jpg",
        posterStatus: "healthy",
        posterWidth: 680,
        posterHeight: 1000,
        posterQuality: "adequate",
        tmdbId: 206386,
        imdbId: "tt22060992",
        tvdbId: 423300
      }
    })
    await testPrisma.mediaItem.create({
      data: {
        mediaType: "series",
        releaseForm: "tv_series",
        titleDisplay: "On Patrol: First Shift",
        posterUrl: "https://image.test/larger.jpg",
        posterStatus: "healthy",
        posterWidth: 1175,
        posterHeight: 1763,
        posterQuality: "adequate",
        tvmazeId: 63525,
        tvdbId: 423300
      }
    })

    const result = await reconcileDuplicateStableIdentities({ database: testPrisma, apply: true })
    const merged = await testPrisma.mediaItem.findUniqueOrThrow({ where: { id: documentary.id } })

    expect(result).toMatchObject({ groups: 1, merged: 1, conflicts: 0 })
    expect(merged).toMatchObject({
      mediaType: "documentary",
      posterUrl: "https://image.test/larger.jpg",
      posterStatus: "healthy",
      posterWidth: 1175,
      posterHeight: 1763,
      posterQuality: "adequate"
    })
  })

  it("keeps movie and series TMDb namespaces separate", async () => {
    await testPrisma.mediaItem.createMany({
      data: [
        { mediaType: "movie", releaseForm: "streaming_movie", titleDisplay: "Movie", tmdbId: 100 },
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "Series", tmdbId: 100 }
      ]
    })

    const result = await reconcileDuplicateStableIdentities({ database: testPrisma, apply: true })

    expect(result).toMatchObject({ groups: 0, merged: 0, conflicts: 0 })
    expect(await testPrisma.mediaItem.count()).toBe(2)
  })

  it("merges duplicate works connected by a non-TMDb stable identity", async () => {
    const variety = await testPrisma.mediaItem.create({
      data: {
        mediaType: "variety",
        releaseForm: "variety_season",
        titleDisplay: "On Patrol: First Shift",
        tvmazeId: 63525,
        tvdbId: 423300
      }
    })
    const documentary = await testPrisma.mediaItem.create({
      data: {
        mediaType: "documentary",
        releaseForm: "documentary_series",
        titleDisplay: "On Patrol: First Shift",
        tmdbId: 206386,
        imdbId: "tt22060992",
        tvdbId: 423300
      }
    })
    await testPrisma.mediaSourceRef.createMany({
      data: [
        { mediaItemId: variety.id, source: "tvmaze", sourceId: "tvmaze-63525" },
        { mediaItemId: documentary.id, source: "thetvdb", sourceId: "thetvdb:series:423300" }
      ]
    })

    const result = await reconcileDuplicateStableIdentities({ database: testPrisma, apply: true })
    const merged = await testPrisma.mediaItem.findUniqueOrThrow({
      where: { id: documentary.id },
      include: { sourceRefs: true }
    })

    expect(result).toMatchObject({ groups: 1, merged: 1, conflicts: 0 })
    expect(merged).toMatchObject({
      mediaType: "documentary",
      releaseForm: "documentary_series",
      tmdbId: 206386,
      tvmazeId: 63525,
      imdbId: "tt22060992",
      tvdbId: 423300
    })
    expect(merged.sourceRefs).toHaveLength(2)
  })

  it("merges one connected component only once when rows share multiple stable identities", async () => {
    await testPrisma.mediaItem.createMany({
      data: [
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "First", imdbId: "tt100", tvdbId: 100 },
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "Second", imdbId: "tt100", tvdbId: 100 }
      ]
    })

    const result = await reconcileDuplicateStableIdentities({ database: testPrisma, apply: true })

    expect(result).toMatchObject({ groups: 1, merged: 1, conflicts: 0 })
    expect(await testPrisma.mediaItem.count()).toBe(1)
  })

  it("rejects a connected component when non-canonical rows contain conflicting identities", async () => {
    await testPrisma.mediaItem.createMany({
      data: [
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "Anchor", imdbId: "tt100" },
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "First", imdbId: "tt100", tmdbId: 1 },
        { mediaType: "series", releaseForm: "tv_series", titleDisplay: "Second", imdbId: "tt100", tmdbId: 2 }
      ]
    })

    const result = await reconcileDuplicateStableIdentities({ database: testPrisma, apply: true })

    expect(result).toMatchObject({ groups: 1, merged: 0, conflicts: 1 })
    expect(await testPrisma.mediaItem.count()).toBe(3)
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

describe("reconcileSharedDateTitles", () => {
  it("merges source-only records when independent sources agree on exact title, type and date", async () => {
    const douban = await testPrisma.mediaItem.create({
      data: {
        mediaType: "documentary",
        releaseForm: "documentary_series",
        titleDisplay: "南宋大贤王十朋",
        firstReleaseDate: "2026-08-06",
        heatScore: 10
      }
    })
    const iqiyi = await testPrisma.mediaItem.create({
      data: {
        mediaType: "documentary",
        releaseForm: "documentary_series",
        titleDisplay: "南宋大贤王十朋",
        firstReleaseDate: "2026-08-06",
        posterUrl: "https://image.test/wang-shipeng.jpg",
        heatScore: 20
      }
    })
    await testPrisma.mediaSourceRef.createMany({
      data: [
        { mediaItemId: douban.id, source: "douban", sourceId: "douban-38520951" },
        { mediaItemId: iqiyi.id, source: "iqiyi", sourceId: "iqiyi-2978140980432001" }
      ]
    })

    const result = await reconcileSharedDateTitles({ database: testPrisma, apply: true })
    const merged = await testPrisma.mediaItem.findFirstOrThrow({
      include: { sourceRefs: true }
    })

    expect(result).toMatchObject({ groups: 1, merged: 1 })
    expect(await testPrisma.mediaItem.count()).toBe(1)
    expect(merged.posterUrl).toBe("https://image.test/wang-shipeng.jpg")
    expect(merged.heatScore).toBe(20)
    expect(merged.sourceRefs).toHaveLength(2)
  })

  it("does not merge duplicate rows supported by only one source family", async () => {
    const items = await Promise.all(["first", "second"].map((sourceId) => testPrisma.mediaItem.create({
      data: {
        mediaType: "movie",
        releaseForm: "streaming_movie",
        titleDisplay: "同日同名",
        firstReleaseDate: "2026-08-06"
      }
    })))
    await testPrisma.mediaSourceRef.createMany({
      data: items.map((item, index) => ({
        mediaItemId: item.id,
        source: "youku",
        sourceId: `youku-${index}`
      }))
    })

    const result = await reconcileSharedDateTitles({ database: testPrisma, apply: true })

    expect(result).toMatchObject({ groups: 0, merged: 0 })
    expect(await testPrisma.mediaItem.count()).toBe(2)
  })
})
