import { load } from "cheerio"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  stripSeasonQualifier,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

function pickContentRoot(html: ReturnType<typeof load>) {
  const main = html("main").first()
  if (main.length > 0) return main

  const article = html("article").first()
  if (article.length > 0) return article

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

function isEditorialCard(element: ReturnType<ReturnType<typeof load>>): boolean {
  const listItem = element.closest("li")
  if (listItem.length === 0) return false

  return listItem.hasClass("grid-item") || listItem.find("article").length > 0
}

function cleanDisneyTitle(value: string): { title: string; titleAliases: string[] } {
  const withoutPlatform = value
    .replace(/,\s*(?:Disney\+\s*&\s*Hulu|Disney\+|Hulu)\s*$/i, "")
    .trim()
  const title = stripSeasonQualifier(withoutPlatform)

  return { title, titleAliases: title === value ? [] : [value] }
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
    const htmlElement = $(element)
    const text = cleanPlatformText(htmlElement.text())
    if (!text) return
    if (isEditorialCard(htmlElement)) return

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

    const normalizedTitle = cleanDisneyTitle(text)
    const description = cleanPlatformText(htmlElement.next("p").text())
    candidates.push({
      title: normalizedTitle.title,
      titleAliases: normalizedTitle.titleAliases,
      sourceContentType: inferContentType(text, description),
      releaseDate: currentDate,
      releasePattern: "catalog_addition",
      description,
      labels: [],
      sourceUrl
    })
  })

  if (candidates.length === 0) throw new Error("Disney+ 页面没有可解析条目")

  return candidates
}
