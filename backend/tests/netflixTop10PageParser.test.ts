import { describe, expect, it } from "vitest"
import { parseNetflixTop10Page } from "../src/adapters/netflixTop10PageParser.js"

function pageWithData(data: Record<string, unknown>): string {
  const payload = JSON.stringify({ data })
  const encoded = JSON.stringify(payload).slice(1, -1).replaceAll("'", "\\'")
  return `<script>netflix.reactContext.models.graphql = JSON.parse('${encoded}');</script>`
}

function top10Entity(overrides: Record<string, unknown> = {}) {
  return {
    __typename: "PulseTop10ItemEntity",
    top10: {
      weekEndDate: "2026-07-05",
      category: "ENGLISH_MOVIES",
      weeklyRank: 1,
      weeklyHoursViewed: 37_300_000,
      runtime: 1.8,
      weeklyViews: 20_700_000,
      cumulativeWeeksInTop10: 1,
      videoId: 81_605_886
    },
    artwork: {
      sdpArt: {
        'urlsSized({"sizes":{"height":219,"width":390}})': [{
          url: "https://dnm.nflximg.net/title.jpg"
        }]
      }
    },
    top10Video: {
      title: "Enola Holmes 3",
      releaseYear: 2026,
      shortSynopsis: "A new mystery."
    },
    displayVideo: {
      title: "Enola Holmes 3",
      titlePageSlug: "/enola-holmes-3"
    },
    ...overrides
  }
}

describe("Netflix Top 10 page parser", () => {
  it("extracts whitelisted ranking, identity and artwork fields", () => {
    const rows = parseNetflixTop10Page(pageWithData({ item: top10Entity() }))

    expect(rows).toEqual([{
      week: "2026-07-05",
      category: "Films (English)",
      weeklyRank: 1,
      showTitle: "Enola Holmes 3",
      weeklyHoursViewed: 37_300_000,
      runtime: 1.8,
      weeklyViews: 20_700_000,
      cumulativeWeeksInTop10: 1,
      videoId: 81_605_886,
      releaseYear: 2026,
      synopsis: "A new mystery.",
      displayTitle: "Enola Holmes 3",
      titlePageSlug: "/enola-holmes-3",
      artworkUrl: "https://dnm.nflximg.net/title.jpg"
    }])
  })

  it("ignores unrelated and incomplete entities", () => {
    const rows = parseNetflixTop10Page(pageWithData({
      unrelated: { __typename: "PulseLinkEntity" },
      incomplete: top10Entity({ top10Video: { title: null } }),
      valid: top10Entity(),
      duplicate: top10Entity()
    }))

    expect(rows).toHaveLength(1)
  })

  it("keeps only the latest available week", () => {
    const rows = parseNetflixTop10Page(pageWithData({
      old: top10Entity({
        top10: {
          ...top10Entity().top10,
          weekEndDate: "2026-06-28",
          videoId: 1
        }
      }),
      current: top10Entity()
    }))

    expect(rows).toHaveLength(1)
    expect(rows[0].week).toBe("2026-07-05")
  })

  it("rejects missing, malformed and empty state", () => {
    expect(() => parseNetflixTop10Page("<html></html>"))
      .toThrow("Netflix Top 10 页面缺少榜单状态")
    expect(() => parseNetflixTop10Page(
      "<script>netflix.reactContext.models.graphql = JSON.parse('bad');</script>"
    )).toThrow("Netflix Top 10 页面状态无法解析")
    expect(() => parseNetflixTop10Page(pageWithData({})))
      .toThrow("Netflix Top 10 页面没有有效榜单")
  })
})
