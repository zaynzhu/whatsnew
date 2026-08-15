const TRUSTED_CHINESE_TITLE_SOURCES = new Set([
  "bilibili",
  "douban",
  "iqiyi",
  "mgtv",
  "tencent",
  "tmdb",
  "youku"
])

const HAN_CHARACTER = /\p{Script=Han}/u
const NON_CHINESE_EAST_ASIAN_SCRIPT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

export function normalizeChineseTitle(value: string | null | undefined): string | null {
  const title = value?.trim()
  if (!title || !HAN_CHARACTER.test(title) || NON_CHINESE_EAST_ASIAN_SCRIPT.test(title)) return null
  return title
}

export function sourceChineseTitle(
  source: string,
  titleDisplay: string
): { title: string; source: string } | null {
  if (!TRUSTED_CHINESE_TITLE_SOURCES.has(source)) return null
  const title = normalizeChineseTitle(titleDisplay)
  return title ? { title, source } : null
}
