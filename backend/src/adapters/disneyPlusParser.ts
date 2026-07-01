import { load } from "cheerio"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

function pickContentRoot(html: ReturnType<typeof load>) {
  const article = html("article").first()
  if (article.length > 0) return article

  const main = html("main").first()
  if (main.length > 0) return main

  return html("body").first()
}

function inferContentType(title: string, description: string | null): string {
  const text = `${title} ${description ?? ""}`.toLowerCase()

  if (text.includes("documentary")) return "documentary"
  if (text.includes("special")) return "special"
  if (text.includes("movie") || text.includes("film") || text.includes("feature")) return "movie"
  if (text.includes("season") || text.includes("series") || text.includes("episode")) return "series"

  return "unknown"
}

export function parseDisneyPlusNewReleases(
  html: string,
  sourceUrl: string,
  fallbackYear: number
): PlatformReleaseCandidate[] {
  const $ = load(html)
  const root = pickContentRoot($)
  const candidates: PlatformReleaseCandidate[] = []
  let currentDate: string | null = null

  root.find("h2, h3, h4, li").each((_index, element) => {
    const text = cleanPlatformText($(element).text())
    if (!text) return

    const parsedDate = parseEnglishReleaseDate(text, fallbackYear)
    if (parsedDate) {
      currentDate = parsedDate
      return
    }

    const tagName = element.tagName.toLowerCase()
    if (tagName === "h2") {
      currentDate = null
      return
    }

    if (!currentDate) return
    if (/coming later|streaming now|also streaming/i.test(text)) return
    if (!["h3", "h4", "li"].includes(tagName)) return

    const description = cleanPlatformText($(element).next("p").text())
    candidates.push({
      title: text,
      sourceContentType: inferContentType(text, description),
      releaseDate: currentDate,
      description,
      labels: [],
      sourceUrl
    })
  })

  if (candidates.length === 0) throw new Error("Disney+ 页面没有可解析条目")

  return candidates
}
