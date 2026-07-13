function absoluteIqiyiUrl(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  if (text.startsWith("//")) return `https:${text}`

  return text
}

function isIqiyiImageUrl(value: string): boolean {
  try {
    return /(^|\.)iqiyipic\.com$/i.test(new URL(value).hostname)
  } catch {
    return false
  }
}

export function normalizeIqiyiPosterUrl(value: string | null | undefined): string | null {
  const url = absoluteIqiyiUrl(value)
  if (!url) return null

  if (!isIqiyiImageUrl(url)) return url

  return url.replace(
    /_(?:120_160|141_188)(?=\.(?:jpe?g|webp|png)(?:[?#]|$))/i,
    "_579_772"
  )
}

export function isIqiyiPosterUpgrade(
  currentUrl: string | null,
  candidateUrl: string | null
): boolean {
  if (!currentUrl || !candidateUrl) return false
  const normalized = normalizeIqiyiPosterUrl(currentUrl)
  if (normalized === currentUrl) return false
  if (normalized === candidateUrl) return true
  if (!isIqiyiImageUrl(candidateUrl)) return false

  const candidateNormalized = normalizeIqiyiPosterUrl(candidateUrl)
  if (candidateNormalized !== candidateUrl || !/_579_772(?=\.(?:jpe?g|webp|png)(?:[?#]|$))/i.test(candidateUrl)) {
    return false
  }
  const currentAssetId = currentUrl.match(/\/([av]_\d+)_/i)?.[1]
  const candidateAssetId = candidateUrl.match(/\/([av]_\d+)_/i)?.[1]

  return currentAssetId != null && currentAssetId === candidateAssetId
}
