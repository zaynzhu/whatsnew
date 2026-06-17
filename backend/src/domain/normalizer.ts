export function normalizeTitle(title: string): string {
  return title
    .trim()
    .replace(/[：:]/g, " ")
    .replace(/[，,。.!！?？'"]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
}

export function normalizePlatform(platform: string): string {
  const trimmed = platform.trim()
  const known: Record<string, string> = {
    youku: "Youku",
    优酷: "Youku",
    iqiyi: "iQIYI",
    爱奇艺: "iQIYI",
    tencent: "Tencent Video",
    腾讯视频: "Tencent Video",
    tmdb: "TMDb",
    tvmaze: "TVmaze",
    trakt: "Trakt"
  }

  return known[trimmed] ?? known[trimmed.toLowerCase()] ?? trimmed
}

export function toJsonArray(values: string[]): string {
  return JSON.stringify([...new Set(values.filter(Boolean))])
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}
