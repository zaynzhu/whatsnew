import { load } from "cheerio"

export type ParsedRating = {
  value: number | null
  voteCount: number | null
}

export type ParsedRottenTomatoesScores = {
  critics: number | null
  audience: number | null
}

export type RottenTomatoesKind = "movie" | "series"

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null

  const match = value.replaceAll(",", "").match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function positiveInteger(value: unknown): number | null {
  const parsed = finiteNumber(value)
  if (parsed == null || !Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function validRating(value: unknown, scale: number): number | null {
  const parsed = finiteNumber(value)
  if (parsed == null || parsed <= 0 || parsed > scale) return null
  return parsed
}

export function parseDoubanRating(payload: unknown): ParsedRating {
  if (!payload || typeof payload !== "object") return { value: null, voteCount: null }
  const rating = (payload as { rating?: unknown }).rating
  if (!rating || typeof rating !== "object") return { value: null, voteCount: null }

  const values = rating as { value?: unknown; count?: unknown }
  return {
    value: validRating(values.value, 10),
    voteCount: positiveInteger(values.count)
  }
}

export function parseTmdbRating(payload: unknown): ParsedRating {
  if (!payload || typeof payload !== "object") return { value: null, voteCount: null }
  const values = payload as { vote_average?: unknown; vote_count?: unknown }
  return {
    value: validRating(values.vote_average, 10),
    voteCount: positiveInteger(values.vote_count)
  }
}

export type ParsedOmdbRating = ParsedRating & {
  imdbId: string | null
  title: string | null
  rottenTomatoes: number | null
}

export function parseOmdbRating(payload: unknown, expectedImdbId: string): ParsedOmdbRating {
  if (!payload || typeof payload !== "object") {
    return { value: null, voteCount: null, imdbId: null, title: null, rottenTomatoes: null }
  }

  const values = payload as {
    Response?: unknown
    imdbID?: unknown
    Title?: unknown
    imdbRating?: unknown
    imdbVotes?: unknown
    Ratings?: unknown
  }
  const imdbId = typeof values.imdbID === "string" && values.imdbID.trim() === expectedImdbId
    ? expectedImdbId
    : null
  const ratings = Array.isArray(values.Ratings) ? values.Ratings : []
  const rotten = ratings.find((item) => {
    if (!item || typeof item !== "object") return false
    return (item as { Source?: unknown }).Source === "Rotten Tomatoes"
  })
  const rottenValue = rotten && typeof rotten === "object"
    ? validRating((rotten as { Value?: unknown }).Value, 100)
    : null
  const responseValid = values.Response !== "False" && imdbId != null

  return {
    value: responseValid ? validRating(values.imdbRating, 10) : null,
    voteCount: responseValid ? positiveInteger(values.imdbVotes) : null,
    imdbId,
    title: !responseValid
      ? null
      : typeof values.Title === "string" && values.Title.trim()
        ? values.Title.trim()
        : null,
    rottenTomatoes: responseValid ? rottenValue : null
  }
}

export function normalizeRottenTomatoesTitle(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|and|of|in|on|at|for|to|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

type RottenTomatoesCandidate = {
  href: string
  score: number
  ratio: number
  index: number
}

export function findRottenTomatoesPath(
  html: string,
  title: string,
  kind: RottenTomatoesKind
): string | null {
  const normalizedTitle = normalizeRottenTomatoesTitle(title)
  const searchWords = new Set(normalizedTitle.split(" ").filter(Boolean))
  if (searchWords.size === 0) return null

  const $ = load(html)
  const candidates: RottenTomatoesCandidate[] = []
  $("a[data-qa=\"info-name\"]").each((index, element) => {
    const href = $(element).attr("href")?.trim()
    const text = $(element).text().trim()
    if (!href || !text) return

    const isTv = href.includes("/tv/")
    const isMovie = href.includes("/m/")
    if ((kind === "series" && !isTv) || (kind === "movie" && !isMovie)) return

    const normalizedResult = normalizeRottenTomatoesTitle(text)
    const resultWords = new Set(normalizedResult.split(" ").filter(Boolean))
    const hits = [...searchWords].filter((word) => resultWords.has(word)).length
    const ratio = hits / searchWords.size
    if (ratio < 0.5) return

    const score = normalizedResult === normalizedTitle
      ? 3
      : normalizedResult.startsWith(normalizedTitle) || normalizedTitle.startsWith(normalizedResult)
        ? 2
        : 1
    candidates.push({
      href,
      score,
      ratio,
      index
    })
  })

  const best = candidates.sort((left, right) => (
    right.score - left.score
    || right.ratio - left.ratio
    || left.index - right.index
  ))[0]
  if (!best) return null

  try {
    const url = new URL(best.href, "https://www.rottentomatoes.com")
    if (url.protocol !== "https:") return null
    if (url.hostname !== "www.rottentomatoes.com" && !url.hostname.endsWith(".rottentomatoes.com")) return null
    return url.toString()
  } catch {
    return null
  }
}

function scoreFromValue(value: unknown): number | null {
  if (typeof value === "number" || typeof value === "string") return validRating(value, 100)
  if (!value || typeof value !== "object") return null

  const object = value as { score?: unknown; value?: unknown }
  return validRating(object.score ?? object.value, 100)
}

function scoreNode(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 12 || !value || typeof value !== "object") return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = scoreNode(item, depth + 1)
      if (found) return found
    }
    return null
  }

  const object = value as Record<string, unknown>
  if (object.audienceScore != null && object.criticsScore != null) return object
  for (const child of Object.values(object)) {
    const found = scoreNode(child, depth + 1)
    if (found) return found
  }
  return null
}

function scoreBoardScores(html: string): ParsedRottenTomatoesScores {
  const $ = load(html)
  const board = $("score-board, score-board-deprecated").first()
  if (board.length === 0) return { critics: null, audience: null }

  return {
    critics: scoreFromValue(board.attr("tomatometerscore") ?? board.attr("tomatometerScore")),
    audience: scoreFromValue(board.attr("audiencescore") ?? board.attr("audienceScore"))
  }
}

export function parseRottenTomatoesScores(html: string): ParsedRottenTomatoesScores {
  const $ = load(html)
  const scripts = $("script[type=\"application/json\"]")
  for (let index = 0; index < scripts.length; index += 1) {
    const text = $(scripts[index]).text().trim()
    if (!text) continue
    try {
      const node = scoreNode(JSON.parse(text))
      if (!node) continue
      const scores = {
        critics: scoreFromValue(node.criticsScore),
        audience: scoreFromValue(node.audienceScore)
      }
      if (scores.critics != null || scores.audience != null) return scores
    } catch {
      // 单个页面节点损坏时继续尝试旧版 score-board
    }
  }

  return scoreBoardScores(html)
}
