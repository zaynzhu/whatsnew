import { load } from "cheerio"
import {
  cleanPlatformText,
  parseEnglishReleaseDate,
  stripSeasonQualifier,
  type PlatformReleaseCandidate
} from "./platformPageUtils.js"

const MONTH_ORDER: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
}

const MONTHLY_TITLE_PATTERN = /what['’]?s new on prime video in ([a-z]+) (\d{4})/i

function articlePeriod(value: string | null): { year: number, month: number } | null {
  const match = value?.match(MONTHLY_TITLE_PATTERN)
  if (!match) return null

  const month = MONTH_ORDER[match[1].toLowerCase()]
  const year = Number(match[2])
  if (!month || !Number.isInteger(year)) return null

  return { year, month }
}

function cleanPrimeTitle(value: string): { title: string, aliases: string[] } | null {
  const cleaned = cleanPlatformText(value)
    ?.replace(/^[‘“'"]+/, "")
    .replace(/[’”'"](?=\s+(?:season|series)\b)/i, "")
    .replace(/[’”'"]+$/, "")
    .trim()
  if (!cleaned) return null

  const title = stripSeasonQualifier(cleaned)
  return {
    title,
    aliases: title === cleaned ? [] : [cleaned]
  }
}

function absoluteUrl(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return null
  }
}

function originalContentType(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase()
  if (/\b(?:documentary|docuseries)\b/.test(text)) return "documentary_series"
  if (/\b(?:movie|film)\b/.test(text)) return "movie"
  if (/\b(?:series|season|episodes?)\b/.test(text)) return "series"
  if (/\breality\b/.test(text)) return "reality"
  return "unknown"
}

function catalogLines(html: string): string[] {
  return html.split(/<br\s*\/?\s*>/i).filter(Boolean)
}

function candidateKey(candidate: PlatformReleaseCandidate): string {
  return `${candidate.title.toLowerCase()}|${candidate.releaseDate ?? ""}`
}

export function isPrimeVideoMonthlyArticle(html: string): boolean {
  const $ = load(html)
  return articlePeriod(cleanPlatformText($("h1").first().text())) != null
}

export function findLatestPrimeVideoArticle(indexHtml: string, indexUrl: string): string {
  const $ = load(indexHtml)
  const candidates: Array<{ url: string, score: number }> = []

  $("a[href]").each((_index, element) => {
    const period = articlePeriod(cleanPlatformText($(element).text()))
    const url = absoluteUrl($(element).attr("href"), indexUrl)
    if (!period || !url) return

    const parsed = new URL(url)
    if (!/(^|\.)aboutamazon\.com$/i.test(parsed.hostname)) return
    if (!parsed.pathname.startsWith("/news/entertainment/")) return

    candidates.push({
      url,
      score: period.year * 100 + period.month
    })
  })

  const latest = candidates.sort((left, right) => right.score - left.score)[0]
  if (!latest) throw new Error("Prime Video 官方娱乐页没有找到月度上新文章")

  return latest.url
}

export function parsePrimeVideoMonthlyArticle(
  html: string,
  articleUrl: string
): PlatformReleaseCandidate[] {
  const $ = load(html)
  const period = articlePeriod(cleanPlatformText($("h1").first().text()))
  if (!period) throw new Error("Prime Video 月度文章标题缺少月份或年份")

  const leadImage = absoluteUrl(
    $(".article-header-v2__img-content img, .lead-image-section img").first().attr("src"),
    articleUrl
  )
  const originals: PlatformReleaseCandidate[] = []
  const catalog: PlatformReleaseCandidate[] = []
  let section: "none" | "originals" | "catalog" = "none"
  let currentDate: string | null = null
  let pendingOriginal: {
    title: string
    titleAliases: string[]
    posterUrl: string | null
  } | null = null

  $(".ArticlePage-articleBody .contentContainer").each((_index, element) => {
    const container = $(element)
    const heading = cleanPlatformText(container.find("h2, h3, h4").first().text())
    const tagName = container.find("h2, h3, h4").first().get(0)?.tagName.toLowerCase()

    if (heading && /^full list of what['’]?s new$/i.test(heading)) {
      section = "catalog"
      currentDate = null
      pendingOriginal = null
      return
    }

    if (section === "catalog" && heading) {
      const date = parseEnglishReleaseDate(heading, period.year)
      if (date) {
        currentDate = date
        return
      }
    }

    if (heading && /^spotlight\s*:/i.test(heading)) {
      const normalized = cleanPrimeTitle(heading.replace(/^spotlight\s*:\s*/i, ""))
      section = "originals"
      pendingOriginal = normalized
        ? { title: normalized.title, titleAliases: normalized.aliases, posterUrl: leadImage }
        : null
      return
    }

    if (heading && /^more prime originals$/i.test(heading)) {
      section = "originals"
      pendingOriginal = null
      return
    }

    if (heading && /^(?:live music|live sports)$/i.test(heading)) {
      section = "none"
      pendingOriginal = null
      return
    }

    if (section === "originals" && heading && tagName === "h3") {
      const normalized = cleanPrimeTitle(heading)
      pendingOriginal = normalized
        ? { title: normalized.title, titleAliases: normalized.aliases, posterUrl: null }
        : null
      return
    }

    if (section === "originals" && pendingOriginal) {
      const image = absoluteUrl(container.find("img").first().attr("src"), articleUrl)
      if (image) {
        pendingOriginal.posterUrl = image
        return
      }

      const description = cleanPlatformText(container.text())
      const releaseDate = description ? parseEnglishReleaseDate(description, period.year) : null
      if (!description || !releaseDate) return

      originals.push({
        title: pendingOriginal.title,
        titleAliases: pendingOriginal.titleAliases,
        sourceContentType: originalContentType(
          [pendingOriginal.title, ...pendingOriginal.titleAliases].join(" "),
          description
        ),
        releaseDate,
        releasePattern: "platform_premiere",
        description,
        labels: ["Prime Original"],
        sourceUrl: articleUrl,
        posterUrl: pendingOriginal.posterUrl
      })
      pendingOriginal = null
      return
    }

    if (section !== "catalog" || !currentDate) return
    const blockHtml = container.find(".contentItem-role-text").html()
    if (!blockHtml) return

    for (const line of catalogLines(blockHtml)) {
      const fragment = load(line)
      const anchor = fragment("a[href*='/gp/video/detail/']").first()
      const title = cleanPlatformText(anchor.text())
      const label = cleanPlatformText(fragment.root().text())
      const sourceUrl = absoluteUrl(anchor.attr("href"), articleUrl)
      if (!title || !label || !sourceUrl) continue

      const suffix = label.slice(title.length).trim()
      const yearMatch = suffix.match(/\((\d{4})\)\s*$/)
      const originalReleaseYear = yearMatch ? Number(yearMatch[1]) : null
      const isSeries = /\bS\d+(?:\s*[–-]\s*\d+)?\b|\bseasons?\b/i.test(suffix)
      catalog.push({
        title,
        titleAliases: label === title ? [] : [label],
        sourceContentType: isSeries ? "series" : "movie",
        releaseDate: currentDate,
        originalReleaseYear,
        releasePattern: "catalog_addition",
        description: null,
        labels: [isSeries ? "Series" : "Movie"],
        sourceUrl,
        posterUrl: null
      })
    }
  })

  const catalogByKey = new Map(catalog.map((candidate) => [candidateKey(candidate), candidate]))
  const resolvedOriginals = originals.map((candidate) => {
    if (candidate.sourceContentType !== "unknown") return candidate
    const catalogMatch = catalogByKey.get(candidateKey(candidate))
    if (!catalogMatch) return candidate

    return {
      ...candidate,
      sourceContentType: catalogMatch.sourceContentType,
      originalReleaseYear: catalogMatch.originalReleaseYear
    }
  })
  const unique = new Map<string, PlatformReleaseCandidate>()
  for (const candidate of [...resolvedOriginals, ...catalog]) {
    if (candidate.sourceContentType === "unknown") continue
    const key = candidateKey(candidate)
    if (!unique.has(key)) unique.set(key, candidate)
  }

  const candidates = [...unique.values()]
  if (candidates.length === 0) throw new Error("Prime Video 月度文章没有可解析的电影或剧集")

  return candidates
}
