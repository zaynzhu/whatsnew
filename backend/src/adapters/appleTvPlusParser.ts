import { load } from "cheerio"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

export type AppleTvPressCandidate = PlatformReleaseCandidate & {
  publishedAt: string
}

// 解析 Apple TV Press 官方 Atom RSS（https://www.apple.com/tv-pr/news-feed.xml）。
// <updated> 只表示新闻发布日期；<link> 取第一个非 enclosure 作为文章页 URL。
// 非影视类新闻（无 series/movie/documentary/special 关键词）会在 candidateToAdapterItem 的 classifyCandidate 阶段被过滤。
export function parseAppleTvPlusNewsFeed(
  xml: string,
  sourceUrl: string,
  _fallbackYear: number
): AppleTvPressCandidate[] {
  const $ = load(xml, { xml: true })
  const candidates: AppleTvPressCandidate[] = []

  $("entry").each((_index, entry) => {
    const $entry = $(entry)
    const title = cleanPlatformText($entry.find("title").first().text())
    const updated = $entry.find("updated").first().text().trim()
    const content = cleanPlatformText($entry.find("content").first().text())

    const categories: string[] = []
    $entry.find("category").each((_, cat) => {
      const term = $(cat).attr("term")
      if (term) categories.push(term)
    })

    // 第一个非 enclosure 的 link 是文章页 URL；enclosure 是配图
    let entryUrl: string | null = null
    $entry.find("link").each((_, link) => {
      if (entryUrl) return
      const rel = $(link).attr("rel")
      if (rel !== "enclosure") entryUrl = $(link).attr("href") ?? null
    })

    if (!title || !updated) return

    candidates.push({
      title,
      sourceContentType: categories[0] ?? "press_release",
      releaseDate: null,
      publishedAt: updated,
      description: content,
      labels: categories,
      sourceUrl: entryUrl ?? sourceUrl,
      posterUrl: null
    })
  })

  if (candidates.length === 0) throw new Error("Apple TV+ RSS 没有可解析条目")

  return candidates
}

function workTitle(headline: string): string | null {
  const quoted = headline.match(/[“"]([^”"]{1,120})[”"]/)?.[1]
  if (quoted) return cleanPlatformText(quoted)

  const leadingTitle = headline.match(/^(.+?)(?:\s+season\s+\d+)?\s+(?:debuts?|premieres?|returns?)\b/i)?.[1]
  return cleanPlatformText(leadingTitle)
}

function explicitPremiereDate(text: string, fallbackYear: number): string | null {
  const segments = text.match(/\b(?:premier\w*|debut\w*)\b[^.]{0,180}/gi) ?? []
  for (const segment of segments) {
    const date = parseEnglishReleaseDate(segment, fallbackYear)
    if (date) return date
  }
  return null
}

export function parseAppleTvPlusPressArticle(
  candidate: AppleTvPressCandidate,
  html: string,
  fallbackYear: number
): AppleTvPressCandidate {
  const $ = load(html)
  const headline = cleanPlatformText(
    $('meta[property="og:title"]').attr("content")
      ?? $("h1").first().text()
      ?? candidate.title
  ) ?? candidate.title
  const title = workTitle(headline) ?? workTitle(candidate.title) ?? candidate.title
  const articleText = cleanPlatformText($("article").first().text() || $("main").first().text()) ?? ""
  const description = cleanPlatformText($('meta[property="og:description"]').attr("content"))
    ?? candidate.description

  return {
    ...candidate,
    title,
    titleAliases: candidate.title === title ? [] : [candidate.title],
    description,
    releaseDate: explicitPremiereDate(articleText, fallbackYear),
    releasePattern: "platform_premiere",
    posterUrl: null
  }
}
