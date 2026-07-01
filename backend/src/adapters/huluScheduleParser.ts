import { load, type Cheerio, type CheerioAPI } from "cheerio"
import type { AnyNode } from "domhandler"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

function inferContentType(title: string, labels: string[]): string {
  const text = [title, ...labels].join(" ").toLowerCase()

  if (text.includes("movie") || text.includes("film")) return "movie"
  if (text.includes("season") || text.includes("series") || text.includes("episode")) return "series"
  if (text.includes("documentary")) return "documentary"
  if (text.includes("special")) return "special"

  return "unknown"
}

function cellTexts(htmlRow: Cheerio<AnyNode>, $: CheerioAPI): string[] {
  return htmlRow
    .find("td")
    .map((_index, cell) => cleanPlatformText($(cell).text()))
    .get()
    .filter((value): value is string => value != null)
}

export function parseHuluSchedule(
  html: string,
  sourceUrl: string,
  fallbackYear: number
): PlatformReleaseCandidate[] {
  const $ = load(html)
  const candidates: PlatformReleaseCandidate[] = []

  $("tr").each((_index, row) => {
    const cells = cellTexts($(row), $)
    if (cells.length < 2) return

    const releaseDate = parseEnglishReleaseDate(cells[0], fallbackYear)
    const title = cleanPlatformText(cells[1])
    if (!releaseDate || !title) return

    const labels = cells.slice(2)
    candidates.push({
      title,
      sourceContentType: inferContentType(title, labels),
      releaseDate,
      description: labels.length > 0 ? labels.join(" · ") : null,
      labels,
      sourceUrl
    })
  })

  if (candidates.length === 0) {
    throw new Error("Hulu schedule 没有可解析条目")
  }

  return candidates
}
