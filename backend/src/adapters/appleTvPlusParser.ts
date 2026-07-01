import { load } from "cheerio"
import {
  cleanPlatformText,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

// 解析 Apple TV Press 官方 Atom RSS（https://www.apple.com/tv-pr/news-feed.xml）。
// <updated> 是新闻发布日期，首版作为 releaseDate；<link> 取第一个非 enclosure 作为文章页 URL。
// 非影视类新闻（无 series/movie/documentary/special 关键词）会在 candidateToAdapterItem 的 classifyCandidate 阶段被过滤。
export function parseAppleTvPlusNewsFeed(
  xml: string,
  sourceUrl: string,
  _fallbackYear: number
): PlatformReleaseCandidate[] {
  const $ = load(xml, { xml: true })
  const candidates: PlatformReleaseCandidate[] = []

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
    const releaseDate = updated.slice(0, 10)

    candidates.push({
      title,
      sourceContentType: categories[0] ?? "press_release",
      releaseDate,
      description: content,
      labels: categories,
      sourceUrl: entryUrl ?? sourceUrl
    })
  })

  if (candidates.length === 0) throw new Error("Apple TV+ RSS 没有可解析条目")

  return candidates
}