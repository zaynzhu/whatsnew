import { RELEASE_STATUS, type ReleaseStatus } from "@whatsnew/shared/media"

const EXACT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DATE_INDEPENDENT_STATUSES = new Set<ReleaseStatus>(["delayed", "ended"])

function validStatus(value: string | null | undefined): ReleaseStatus {
  return RELEASE_STATUS.includes(value as ReleaseStatus) ? value as ReleaseStatus : "unknown"
}

export function normalizeReleaseStatusForDate(
  status: string | null | undefined,
  releaseDate: string | null,
  today: string
): ReleaseStatus {
  const normalizedStatus = validStatus(status)
  if (!releaseDate || !EXACT_DATE_PATTERN.test(releaseDate)) return normalizedStatus
  if (DATE_INDEPENDENT_STATUSES.has(normalizedStatus)) return normalizedStatus

  if (releaseDate > today) return "upcoming"
  if (releaseDate === today && normalizedStatus === "available") return "available"
  if (releaseDate === today) return "airing_today"
  return "available"
}
