import { load, type Cheerio, type CheerioAPI } from "cheerio"
import type { AnyNode } from "domhandler"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  stripSeasonQualifier,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

function inferContentType(title: string, labels: string[]): string {
  const text = [title, ...labels].join(" ").toLowerCase()

  if (text.includes("movie") || text.includes("film") || /\(\d{4}\)/.test(title)) return "movie"
  if (text.includes("season") || text.includes("series") || text.includes("episode")) return "series"
  if (text.includes("documentary")) return "documentary"
  if (text.includes("special")) return "special"

  return "unknown"
}

function cleanHuluTitle(value: string): {
  title: string
  titleAliases: string[]
  originalReleaseYear: number | null
} {
  const yearMatch = value.match(/\s*\(((?:19|20)\d{2})\)\s*$/)
  if (!yearMatch) {
    const title = stripSeasonQualifier(value)
    return {
      title,
      titleAliases: title === value ? [] : [value],
      originalReleaseYear: null
    }
  }

  const title = stripSeasonQualifier(value.slice(0, yearMatch.index).trim())
  const baseTitle = title.replace(/\s+en\s+espanol$/i, "").trim()
  const titleAliases = [...(baseTitle !== title ? [baseTitle] : []), value]
  return { title, titleAliases, originalReleaseYear: Number(yearMatch[1]) }
}

function releasePattern(title: string, labels: string[]): string {
  const status = [title, ...labels].join(" ").toLowerCase()
  return /\b(?:premiere|debut)\b/.test(status) ? "platform_premiere" : "catalog_addition"
}

function cellTexts(htmlRow: Cheerio<AnyNode>, $: CheerioAPI): string[] {
  return htmlRow
    .find("td")
    .map((_index, cell) => cleanPlatformText($(cell).text()))
    .get()
    .filter((value): value is string => value != null)
}

function headerTexts(table: Cheerio<AnyNode>, $: CheerioAPI): string[] {
  return table
    .find("tr")
    .first()
    .find("th, td")
    .map((_index, cell) => cleanPlatformText($(cell).text())?.toLowerCase())
    .get()
    .filter((value): value is string => value != null)
}

function isScheduleTable(table: Cheerio<AnyNode>, $: CheerioAPI): boolean {
  const headers = headerTexts(table, $)
  return headers.includes("date") && (headers.includes("title") || headers.includes("show"))
}

export function parseHuluSchedule(
  html: string,
  sourceUrl: string,
  fallbackYear: number
): PlatformReleaseCandidate[] {
  const $ = load(html)
  const candidates: PlatformReleaseCandidate[] = []

  $("table").each((_index, table) => {
    const htmlTable = $(table)
    if (!isScheduleTable(htmlTable, $)) return

    htmlTable.find("tr").each((_rowIndex, row) => {
      const cells = cellTexts($(row), $)
      if (cells.length < 2) return

      const releaseDate = parseEnglishReleaseDate(cells[0], fallbackYear)
      const rawTitle = cleanPlatformText(cells[1])
      if (!releaseDate || !rawTitle) return

      const labels = cells.slice(2)
      const normalizedTitle = cleanHuluTitle(rawTitle)
      candidates.push({
        title: normalizedTitle.title,
        titleAliases: normalizedTitle.titleAliases,
        sourceContentType: inferContentType(rawTitle, labels),
        releaseDate,
        originalReleaseYear: normalizedTitle.originalReleaseYear,
        releasePattern: releasePattern(rawTitle, labels),
        description: labels.length > 0 ? labels.join(" · ") : null,
        labels,
        sourceUrl
      })
    })
  })

  if (candidates.length === 0) {
    throw new Error("Hulu schedule 没有可解析条目")
  }

  return candidates
}
