import { MEDIA_STATUS, type MediaStatus } from "@whatsnew/shared/media"

const EXACT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validStatus(value: string | null | undefined): MediaStatus {
  return MEDIA_STATUS.includes(value as MediaStatus) ? value as MediaStatus : "unknown"
}

export function normalizeMediaStatusForDate(
  status: string | null | undefined,
  firstReleaseDate: string | null,
  today: string
): MediaStatus {
  const normalizedStatus = validStatus(status)
  if (!firstReleaseDate || !EXACT_DATE_PATTERN.test(firstReleaseDate)) return normalizedStatus

  if (firstReleaseDate > today) return "upcoming"
  if (normalizedStatus === "upcoming" || normalizedStatus === "unknown") return "released"
  return normalizedStatus
}
