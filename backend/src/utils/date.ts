export function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-")
}

export function getUpcomingDateWindow(now = new Date()): { from: string, to: string } {
  const end = new Date(now)
  end.setDate(end.getDate() + 13)

  return {
    from: formatLocalDate(now),
    to: formatLocalDate(end)
  }
}
