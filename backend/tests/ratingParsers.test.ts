import { describe, expect, it } from "vitest"
import {
  findRottenTomatoesPath,
  normalizeRottenTomatoesTitle,
  parseDoubanRating,
  parseOmdbRating,
  parseRottenTomatoesScores,
  parseTmdbRating
} from "../src/services/ratingParsers.js"

describe("评分来源解析", () => {
  it("只接受量表范围内的豆瓣与 TMDb 评分", () => {
    expect(parseDoubanRating({ rating: { value: 8.7, count: 12345 } })).toEqual({
      value: 8.7,
      voteCount: 12345
    })
    expect(parseDoubanRating({ rating: { value: 0, count: 0 } })).toEqual({
      value: null,
      voteCount: null
    })
    expect(parseTmdbRating({ vote_average: "7.9", vote_count: "1,024" })).toEqual({
      value: 7.9,
      voteCount: 1024
    })
    expect(parseTmdbRating({ vote_average: 11, vote_count: -1 })).toEqual({
      value: null,
      voteCount: null
    })
  })

  it("OMDb 必须返回同一个 IMDb 身份才采用评分", () => {
    const parsed = parseOmdbRating({
      Response: "True",
      imdbID: "tt1234567",
      Title: "A Sample Movie",
      imdbRating: "8.2",
      imdbVotes: "12,345",
      Ratings: [{ Source: "Rotten Tomatoes", Value: "91%" }]
    }, "tt1234567")

    expect(parsed).toEqual({
      value: 8.2,
      voteCount: 12345,
      imdbId: "tt1234567",
      title: "A Sample Movie",
      rottenTomatoes: 91
    })
    expect(parseOmdbRating({
      Response: "True",
      imdbID: "tt7654321",
      imdbRating: "9.9"
    }, "tt1234567").value).toBeNull()
  })

  it("烂番茄搜索严格区分电影剧集并拒绝低重叠标题", () => {
    const html = `
      <a data-qa="info-name" href="/tv/sample_movie">Sample Movie</a>
      <a data-qa="info-name" href="/m/sample_movie_legacy">Sample Movie Legacy</a>
      <a data-qa="info-name" href="/m/sample_movie">The Sample Movie</a>
      <a data-qa="info-name" href="/m/unrelated">Entirely Different</a>
    `

    expect(normalizeRottenTomatoesTitle("The Sample: Movie!")).toBe("sample movie")
    expect(findRottenTomatoesPath(html, "Sample Movie", "movie")).toBe(
      "https://www.rottentomatoes.com/m/sample_movie"
    )
    expect(findRottenTomatoesPath(html, "Entirely Unknown Work", "series")).toBeNull()
    expect(findRottenTomatoesPath(
      '<a data-qa="info-name" href="http://www.rottentomatoes.com/m/sample_movie">Sample Movie</a>',
      "Sample Movie",
      "movie"
    )).toBeNull()
  })

  it("烂番茄优先读取 JSON，旧页面回退 score-board", () => {
    const jsonHtml = `
      <script type="application/json">
        {"props":{"scores":{"criticsScore":{"score":"93"},"audienceScore":{"score":87}}}}
      </script>
      <score-board tomatometerscore="10" audiencescore="20"></score-board>
    `
    expect(parseRottenTomatoesScores(jsonHtml)).toEqual({ critics: 93, audience: 87 })

    const legacyHtml = "<score-board-deprecated tomatometerscore=\"74\" audiencescore=\"68\"></score-board-deprecated>"
    expect(parseRottenTomatoesScores(legacyHtml)).toEqual({ critics: 74, audience: 68 })
    expect(parseRottenTomatoesScores("<html></html>")).toEqual({ critics: null, audience: null })
  })
})
