function absoluteDoubanUrl(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  if (text.startsWith("//")) return `https:${text}`

  return text
}

function isDoubanImageUrl(value: string): boolean {
  try {
    return /(^|\.)doubanio\.com$/i.test(new URL(value).hostname)
  } catch {
    return false
  }
}

export function isDoubanPlaceholderPosterUrl(value: string | null | undefined): boolean {
  const url = absoluteDoubanUrl(value)
  if (!url || !isDoubanImageUrl(url)) return false

  try {
    return /\/pics\/subject\/(?:movie|tv)(?:_[^/]+)?\.(?:jpe?g|png|webp)$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

export function normalizeDoubanPosterUrl(value: string | null | undefined): string | null {
  const url = absoluteDoubanUrl(value)
  if (!url) return null
  if (!isDoubanImageUrl(url)) return url
  if (isDoubanPlaceholderPosterUrl(url)) return null

  return url.replace("/view/photo/s_ratio_poster/", "/view/photo/l_ratio_poster/")
}

export function isDoubanPosterUpgrade(
  currentUrl: string | null,
  candidateUrl: string | null
): boolean {
  if (!currentUrl || !candidateUrl) return false
  const normalized = normalizeDoubanPosterUrl(currentUrl)

  return normalized !== currentUrl && normalized === candidateUrl
}
