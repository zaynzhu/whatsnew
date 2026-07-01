import { load } from "cheerio"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

const SKIP_ENTRY_PATTERN = /\b(?:coming later|check back|streaming now|last chance|leaving|expires?)\b/i
const RESET_SECTION_PATTERN = /\b(?:coming later|last chance|leaving this month|leaving in)\b/i
const BLOCKED_SECTION_PATTERN = /\b(?:last chance|leaving(?: this month)?|coming later|worth the wait)\b/i
const RELEASE_SECTION_PATTERN = /\b(?:what'?s new|available|premieres?)\b/i

function pickContentRoot(html: ReturnType<typeof load>) {
  const article = html("article").first()
  if (article.length > 0) return article

  const main = html("main").first()
  if (main.length > 0) return main

  return html("body").first()
}

function titleFromRaw(value: string): string {
  return value
    .replace(/^feature film:\s*/i, "")
    .replace(/,\s*\d{4}\b.*$/, "")
    .replace(/\s*\((?:hbo|max)(?:\s+original)?[^)]*\)\s*$/i, "")
    .trim()
}

function inferContentType(title: string, raw: string): string {
  const text = `${title} ${raw}`.toLowerCase()

  if (text.includes("documentary") || text.includes("docuseries")) return "documentary"
  if (text.includes("special")) return "special"
  if (text.includes("season") || text.includes("series") || text.includes("episode")) return "series"
  if (
    text.includes("feature film") ||
    text.includes("movie") ||
    text.includes("film") ||
    /,\s*\d{4}\b/.test(raw)
  ) {
    return "movie"
  }

  return "unknown"
}

export function parseMaxWhatsNew(
  html: string,
  sourceUrl: string,
  fallbackYear: number
): PlatformReleaseCandidate[] {
  const $ = load(html)
  const root = pickContentRoot($)
  const candidates: PlatformReleaseCandidate[] = []
  let currentDate: string | null = null
  let blockedSection = false

  root.find("p, li, h2, h3, h4").each((_index, element) => {
    const tagName = element.tagName?.toLowerCase()
    const raw = cleanPlatformText($(element).text())
    if (!raw) return

    if (tagName === "h2" || tagName === "h3" || tagName === "h4") {
      if (BLOCKED_SECTION_PATTERN.test(raw)) {
        blockedSection = true
        currentDate = null
        return
      }

      if (RELEASE_SECTION_PATTERN.test(raw)) {
        blockedSection = false
        currentDate = null
        return
      }

      return
    }

    const parsedDate = parseEnglishReleaseDate(raw, fallbackYear)
    if (parsedDate) {
      if (blockedSection) return
      currentDate = parsedDate
      return
    }

    if (RESET_SECTION_PATTERN.test(raw)) {
      currentDate = null
      return
    }

    if (blockedSection || !currentDate || SKIP_ENTRY_PATTERN.test(raw)) return

    const title = cleanPlatformText(titleFromRaw(raw))
    if (!title) return

    candidates.push({
      title,
      sourceContentType: inferContentType(title, raw),
      releaseDate: currentDate,
      description: raw,
      labels: [],
      sourceUrl
    })
  })

  if (candidates.length === 0) {
    throw new Error("Max press 页面没有可解析条目")
  }

  return candidates
}
