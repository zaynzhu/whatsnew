import { load, type Cheerio, type CheerioAPI } from "cheerio"
import type { AnyNode } from "domhandler"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

const SKIP_ENTRY_PATTERN = /\b(?:coming later|check back|streaming now|last chance|leaving|expires?)\b/i
const RESET_SECTION_PATTERN = /\b(?:check back|streaming now|expires?)\b/i
const BLOCKED_SECTION_PATTERN = /\b(?:last chance|leaving(?: this month)?|coming later|worth the wait)\b/i
const RELEASE_SECTION_PATTERN = /\b(?:what'?s new|available|premieres?)\b/i
const METADATA_LINE_PATTERN =
  /^(?:\d+\s+episodes?|logline|cast|credits?|starring|director|producers?|executive producers?|press assets|download images|synopsis|about|this list may not be comprehensive|all dates)\b/i
const MAX_TITLE_LENGTH = 191

type PressToken = {
  raw: string
  isHeading: boolean
  blockIndex: number
  lineCount: number
}

function elementLines(element: Cheerio<AnyNode>, html: CheerioAPI): string[] {
  const htmlText = element.html()
  if (!htmlText) {
    const text = cleanPlatformText(element.text())
    return text ? [text] : []
  }

  const withBreaks = htmlText.replace(/<br\s*\/?>/gi, "\n")
  const text = html(`<div>${withBreaks}</div>`).text()

  return text
    .split(/\n+/)
    .map((line) => cleanPlatformText(line))
    .filter((line): line is string => Boolean(line))
}

function rootHasReleaseSignal(root: Cheerio<AnyNode>, html: CheerioAPI, fallbackYear: number): boolean {
  let hasSignal = false

  root.find("p, li, h1, h2, h3, h4").each((_index, element) => {
    if (hasSignal) return

    for (const line of elementLines(html(element), html)) {
      if (parseEnglishReleaseDate(line, fallbackYear)) {
        hasSignal = true
        return
      }
    }
  })

  return hasSignal
}

function firstRootWithReleaseSignal(
  html: CheerioAPI,
  selector: string,
  fallbackYear: number
): Cheerio<AnyNode> | null {
  for (const element of html(selector).toArray()) {
    const root = html(element)
    if (rootHasReleaseSignal(root, html, fallbackYear)) return root
  }

  return null
}

function pickContentRoot(html: CheerioAPI, fallbackYear: number): Cheerio<AnyNode> {
  const pressroomContent = firstRootWithReleaseSignal(html, ".pressroom-content", fallbackYear)
  if (pressroomContent) return pressroomContent

  const mediaReleaseContent = firstRootWithReleaseSignal(html, ".p-media-release__content", fallbackYear)
  if (mediaReleaseContent) return mediaReleaseContent

  const article = firstRootWithReleaseSignal(html, "article", fallbackYear)
  if (article) return article

  const main = firstRootWithReleaseSignal(html, "main", fallbackYear)
  if (main) return main

  const fallbackArticle = html("article").first()
  if (fallbackArticle.length > 0) return fallbackArticle

  const fallbackMain = html("main").first()
  if (fallbackMain.length > 0) return fallbackMain

  const body = html("body").first()
  if (body.length > 0) return body

  return html.root()
}

function pressTokens(root: Cheerio<AnyNode>, html: CheerioAPI): PressToken[] {
  const tokens: PressToken[] = []
  let blockIndex = 0

  root.find("p, li, h1, h2, h3, h4").each((_index, element) => {
    const tagName = (element as { tagName?: string }).tagName?.toLowerCase() ?? ""
    const isHeading = tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "h4"
    const lines = elementLines(html(element), html)

    for (const raw of lines) {
      tokens.push({ raw, isHeading, blockIndex, lineCount: lines.length })
    }
    blockIndex += 1
  })

  return tokens
}

function titleFromRaw(value: string): string {
  return value
    .replace(/^feature film:\s*/i, "")
    .replace(/,\s*\d{4}\b.*$/, "")
    .replace(/\s*\((?:hbo|max)(?:\s+original)?[^)]*\)\s*$/i, "")
    .trim()
}

function contentTypeFromCategory(raw: string): string | null {
  const text = raw.toLowerCase()

  if (/^(?:films?|movies?|feature films?)$/.test(text)) return "movie"
  if (/^(?:series|shows?|tv shows?)$/.test(text)) return "series"
  if (/^(?:documentaries|documentary films?|documentary series|docs?)$/.test(text)) return "documentary"
  if (/^(?:specials?)$/.test(text)) return "special"

  return null
}

function contentTypeFromDescriptor(raw: string): string | null {
  if (raw.includes(":")) return null

  const text = raw.toLowerCase()
  const isDescriptor =
    /^(?:max|hbo|cnn|discovery|warner bros\.?|lionsgate|a24|sony|paramount|universal|focus features|magnolia|neon|adult swim|cartoon network)\b/.test(text) ||
    /^(?:original|classic|library)\b/.test(text)

  if (!isDescriptor) return null
  if (/\b(?:documentary|docuseries)\b/.test(text)) return "documentary"
  if (/\b(?:film|movie)\b/.test(text)) return "movie"
  if (/\b(?:series|season|episode)\b/.test(text)) return "series"
  if (/\bspecial\b/.test(text)) return "special"

  return null
}

function inferContentType(title: string, raw: string, fallbackType: string | null): string {
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

  return fallbackType ?? "unknown"
}

export function parseMaxWhatsNew(
  html: string,
  sourceUrl: string,
  fallbackYear: number
): PlatformReleaseCandidate[] {
  const $ = load(html)
  const root = pickContentRoot($, fallbackYear)
  const candidates: PlatformReleaseCandidate[] = []
  let currentDate: string | null = null
  let blockedSection = false
  let currentContentType: string | null = null
  let consumedRichBlock: number | null = null

  for (const { raw, isHeading, blockIndex, lineCount } of pressTokens(root, $)) {
    if (consumedRichBlock === blockIndex) continue

    if (isHeading && RELEASE_SECTION_PATTERN.test(raw)) {
      blockedSection = false
      currentDate = null
      currentContentType = null
      continue
    }

    if (BLOCKED_SECTION_PATTERN.test(raw)) {
      blockedSection = true
      currentDate = null
      currentContentType = null
      continue
    }

    const parsedDate = parseEnglishReleaseDate(raw, fallbackYear)
    if (parsedDate) {
      if (blockedSection) continue
      currentDate = parsedDate
      continue
    }

    const categoryType = contentTypeFromCategory(raw)
    if (categoryType) {
      currentContentType = categoryType
      continue
    }

    if (isHeading) {
      continue
    }

    const descriptorType = contentTypeFromDescriptor(raw)
    if (descriptorType) {
      currentContentType = descriptorType
      continue
    }

    if (RESET_SECTION_PATTERN.test(raw)) {
      currentDate = null
      currentContentType = null
      continue
    }

    if (blockedSection || !currentDate || SKIP_ENTRY_PATTERN.test(raw) || METADATA_LINE_PATTERN.test(raw)) {
      continue
    }

    const title = cleanPlatformText(titleFromRaw(raw))
    if (!title) continue
    if (title.length > MAX_TITLE_LENGTH) continue

    candidates.push({
      title,
      sourceContentType: inferContentType(title, raw, currentContentType),
      releaseDate: currentDate,
      description: raw,
      labels: [],
      sourceUrl
    })
    if (lineCount > 1) consumedRichBlock = blockIndex
  }

  if (candidates.length === 0) {
    throw new Error("Max press 页面没有可解析条目")
  }

  return candidates
}
