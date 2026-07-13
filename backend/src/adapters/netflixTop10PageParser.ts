const GRAPHQL_MARKER = "netflix.reactContext.models.graphql = JSON.parse('"

const CATEGORY_LABELS: Record<string, string> = {
  ENGLISH_MOVIES: "Films (English)",
  NONENGLISH_MOVIES: "Films (Non-English)",
  ENGLISH_SERIES: "TV (English)",
  NONENGLISH_SERIES: "TV (Non-English)"
}

export type NetflixTop10PageRow = {
  week: string
  category: string
  weeklyRank: number
  showTitle: string
  weeklyHoursViewed: number | null
  runtime: number | null
  weeklyViews: number | null
  cumulativeWeeksInTop10: number | null
  videoId: number
  releaseYear: number | null
  synopsis: string | null
  displayTitle: string | null
  titlePageSlug: string | null
  artworkUrl: string | null
}

function decodeJavaScriptString(value: string): string {
  let decoded = ""

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character !== "\\") {
      decoded += character
      continue
    }

    index += 1
    if (index >= value.length) throw new Error("Netflix Top 10 页面状态无法解析")
    const escape = value[index]
    if (escape === "n") decoded += "\n"
    else if (escape === "r") decoded += "\r"
    else if (escape === "t") decoded += "\t"
    else if (escape === "b") decoded += "\b"
    else if (escape === "f") decoded += "\f"
    else if (escape === "v") decoded += "\v"
    else if (escape === "0") decoded += "\0"
    else if (escape === "\n") continue
    else if (escape === "x") {
      const code = value.slice(index + 1, index + 3)
      if (!/^[a-f0-9]{2}$/i.test(code)) throw new Error("Netflix Top 10 页面状态无法解析")
      decoded += String.fromCharCode(Number.parseInt(code, 16))
      index += 2
    } else if (escape === "u") {
      const code = value.slice(index + 1, index + 5)
      if (!/^[a-f0-9]{4}$/i.test(code)) throw new Error("Netflix Top 10 页面状态无法解析")
      decoded += String.fromCharCode(Number.parseInt(code, 16))
      index += 4
    } else {
      decoded += escape
    }
  }

  return decoded
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function imageUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  for (const [key, candidates] of Object.entries(value)) {
    if (!key.startsWith("urlsSized(") || !Array.isArray(candidates)) continue
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue
      const url = text((candidate as Record<string, unknown>).url)
      if (url) return url
    }
  }
  return null
}

function rowFromEntity(value: unknown): NetflixTop10PageRow | null {
  if (!value || typeof value !== "object") return null
  const entity = value as Record<string, unknown>
  if (entity.__typename !== "PulseTop10ItemEntity") return null

  const top10 = record(entity.top10)
  const top10Video = record(entity.top10Video)
  const displayVideo = record(entity.displayVideo)
  const artwork = record(entity.artwork)
  const category = CATEGORY_LABELS[text(top10.category) ?? ""]
  const week = text(top10.weekEndDate)
  const weeklyRank = finiteNumber(top10.weeklyRank)
  const videoId = finiteNumber(top10.videoId)
  const showTitle = text(top10Video.title)
  if (!category || !week || weeklyRank == null || videoId == null || !showTitle) return null

  return {
    week,
    category,
    weeklyRank,
    showTitle,
    weeklyHoursViewed: finiteNumber(top10.weeklyHoursViewed),
    runtime: finiteNumber(top10.runtime),
    weeklyViews: finiteNumber(top10.weeklyViews),
    cumulativeWeeksInTop10: finiteNumber(top10.cumulativeWeeksInTop10),
    videoId,
    releaseYear: finiteNumber(top10Video.releaseYear),
    synopsis: text(top10Video.shortSynopsis),
    displayTitle: text(displayVideo.title),
    titlePageSlug: text(displayVideo.titlePageSlug),
    artworkUrl: imageUrl(artwork.sdpArt)
  }
}

export function parseNetflixTop10Page(html: string): NetflixTop10PageRow[] {
  const start = html.indexOf(GRAPHQL_MARKER)
  if (start < 0) throw new Error("Netflix Top 10 页面缺少榜单状态")
  const payloadStart = start + GRAPHQL_MARKER.length
  const payloadEnd = html.indexOf("');", payloadStart)
  if (payloadEnd < 0) throw new Error("Netflix Top 10 页面状态无法解析")

  let envelope: { data?: Record<string, unknown> }
  try {
    envelope = JSON.parse(decodeJavaScriptString(html.slice(payloadStart, payloadEnd)))
  } catch {
    throw new Error("Netflix Top 10 页面状态无法解析")
  }

  const parsedRows = Object.values(envelope.data ?? {})
    .map(rowFromEntity)
    .filter((row): row is NetflixTop10PageRow => row != null)
  const deduplicatedRows = [...new Map(parsedRows.map((row) => [
    `${row.week}:${row.category}:${row.videoId}`,
    row
  ])).values()]
  const latestWeek = deduplicatedRows.reduce(
    (latest, row) => row.week > latest ? row.week : latest,
    ""
  )
  const rows = deduplicatedRows
    .filter((row) => row.week === latestWeek)
    .sort((left, right) => (
      left.category.localeCompare(right.category)
      || left.weeklyRank - right.weeklyRank
    ))
  if (rows.length === 0) throw new Error("Netflix Top 10 页面没有有效榜单")
  return rows
}
