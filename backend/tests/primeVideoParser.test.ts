import { describe, expect, it } from "vitest"
import {
  findLatestPrimeVideoArticle,
  isPrimeVideoMonthlyArticle,
  parsePrimeVideoMonthlyArticle
} from "../src/adapters/primeVideoParser.js"

const indexUrl = "https://www.aboutamazon.com/news/entertainment"
const articleUrl = "https://www.aboutamazon.com/news/entertainment/prime-video-july-2026"

const indexHtml = `
  <main>
    <a href="/news/entertainment/prime-video-june-2026">What's new on Prime Video in June 2026</a>
    <a href="/news/entertainment/prime-video-july-2026">What's new on Prime Video in July 2026</a>
    <a href="https://example.com/news/entertainment/prime-video-august-2026">What's new on Prime Video in August 2026</a>
  </main>
`

const articleHtml = `
  <h1>What's new on Prime Video in July 2026, including 'Elle'</h1>
  <div class="article-header-v2__img-content"><img src="/images/elle.jpg"></div>
  <div class="ArticlePage-articleBody"><article>
    <div class="contentContainer"><div class="contentItem-role-heading2"><h2>Spotlight: ‘Elle’</h2></div></div>
    <div class="contentContainer"><div class="contentItem-role-video"></div></div>
    <div class="contentContainer"><div class="contentItem-role-text">July 1. Season 1 of Elle follows Elle Woods in high school.</div></div>
    <div class="contentContainer"><div class="contentItem-role-heading2"><h2>More Prime Originals</h2></div></div>
    <div class="contentContainer"><div class="contentItem-role-heading3"><h3>‘Magilumiere Magical Girls Inc.’ Season 2</h3></div></div>
    <div class="contentContainer"><div class="contentItem-role-image"><img src="/images/magilumiere.jpg"></div></div>
    <div class="contentContainer"><div class="contentItem-role-text">July 5. The anime series returns for a second season.</div></div>
    <div class="contentContainer"><div class="contentItem-role-heading3"><h3>‘Murder 101’</h3></div></div>
    <div class="contentContainer"><div class="contentItem-role-image"><img src="/images/murder-101.jpg"></div></div>
    <div class="contentContainer"><div class="contentItem-role-text">July 13. This three-episode docuseries follows a sociology class.</div></div>
    <div class="contentContainer"><div class="contentItem-role-heading3"><h3>‘Ambiguous Event’</h3></div></div>
    <div class="contentContainer"><div class="contentItem-role-text">July 14. A mysterious gathering unfolds.</div></div>
    <div class="contentContainer"><div class="contentItem-role-heading3"><h3>‘The Devil's Mouth’</h3></div></div>
    <div class="contentContainer"><div class="contentItem-role-image"><img src="/images/devils-mouth.jpg"></div></div>
    <div class="contentContainer"><div class="contentItem-role-text">July 29. Five friends enter a dangerous cave.</div></div>
    <div class="contentContainer"><div class="contentItem-role-heading2"><h2>Live Music</h2></div></div>
    <div class="contentContainer"><div class="contentItem-role-text">July 20. Music festival livestream.</div></div>
    <div class="contentContainer"><div class="contentItem-role-heading2"><h2>Live Sports</h2></div></div>
    <div class="contentContainer"><div class="contentItem-role-heading3"><h3>WNBA</h3></div></div>
    <div class="contentContainer"><div class="contentItem-role-heading2"><h2>Full list of what’s new</h2></div></div>
    <div class="contentContainer"><div class="contentItem-role-heading3"><h3>July 1</h3></div></div>
    <div class="contentContainer"><div class="contentItem-role-text"><span><div>
      <a href="https://www.amazon.com/gp/video/detail/series">Everybody Hates Chris</a> S1–4 (2005)<br>
      <a href="https://www.amazon.com/gp/video/detail/movie">A Fish Called Wanda</a> (1988)<br>
    </div></span></div></div>
    <div class="contentContainer"><div class="contentItem-role-heading2"><h2>July 13</h2></div></div>
    <div class="contentContainer"><div class="contentItem-role-text"><span><div>
      <a href="https://www.amazon.com/gp/video/detail/murder">Murder 101</a> (2026)<br>
    </div></span></div></div>
    <div class="contentContainer"><div class="contentItem-role-heading2"><h2>July 29</h2></div></div>
    <div class="contentContainer"><div class="contentItem-role-text"><span><div>
      <a href="https://www.amazon.com/gp/video/detail/devils-mouth">The Devil's Mouth</a> (2026)<br>
    </div></span></div></div>
  </article></div>
`

describe("Prime Video parser", () => {
  it("finds the latest official monthly article without accepting external lookalikes", () => {
    expect(findLatestPrimeVideoArticle(indexHtml, indexUrl)).toBe(
      "https://www.aboutamazon.com/news/entertainment/prime-video-july-2026"
    )
    expect(isPrimeVideoMonthlyArticle(articleHtml)).toBe(true)
    expect(isPrimeVideoMonthlyArticle(indexHtml)).toBe(false)
  })

  it("parses dated movies and series while excluding sports, music and ambiguous entries", () => {
    const candidates = parsePrimeVideoMonthlyArticle(articleHtml, articleUrl)

    expect(candidates.map((candidate) => candidate.title)).toEqual([
      "Elle",
      "Magilumiere Magical Girls Inc.",
      "Murder 101",
      "The Devil's Mouth",
      "Everybody Hates Chris",
      "A Fish Called Wanda"
    ])
    expect(candidates.find((candidate) => candidate.title === "Elle")).toMatchObject({
      sourceContentType: "series",
      releaseDate: "2026-07-01",
      releasePattern: "platform_premiere",
      posterUrl: "https://www.aboutamazon.com/images/elle.jpg"
    })
    expect(candidates.find((candidate) => candidate.title === "Magilumiere Magical Girls Inc.")).toMatchObject({
      titleAliases: ["Magilumiere Magical Girls Inc. Season 2"],
      sourceContentType: "series",
      posterUrl: "https://www.aboutamazon.com/images/magilumiere.jpg"
    })
    expect(candidates.find((candidate) => candidate.title === "Murder 101")).toMatchObject({
      sourceContentType: "documentary_series",
      releaseDate: "2026-07-13"
    })
    expect(candidates.find((candidate) => candidate.title === "The Devil's Mouth")).toMatchObject({
      sourceContentType: "movie",
      releasePattern: "platform_premiere",
      posterUrl: "https://www.aboutamazon.com/images/devils-mouth.jpg"
    })
    expect(candidates.find((candidate) => candidate.title === "Everybody Hates Chris")).toMatchObject({
      sourceContentType: "series",
      originalReleaseYear: 2005,
      releasePattern: "catalog_addition"
    })
    expect(candidates.find((candidate) => candidate.title === "A Fish Called Wanda")).toMatchObject({
      sourceContentType: "movie",
      originalReleaseYear: 1988
    })
    expect(candidates.some((candidate) => candidate.title === "WNBA")).toBe(false)
    expect(candidates.some((candidate) => candidate.title === "Ambiguous Event")).toBe(false)
  })

  it("fails visibly when the official page no longer contains parseable releases", () => {
    expect(() => findLatestPrimeVideoArticle("<main></main>", indexUrl)).toThrow(
      "Prime Video 官方娱乐页没有找到月度上新文章"
    )
    expect(() => parsePrimeVideoMonthlyArticle("<h1>Prime Video</h1>", articleUrl)).toThrow(
      "Prime Video 月度文章标题缺少月份或年份"
    )
  })
})
