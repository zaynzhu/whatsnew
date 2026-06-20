import ExcelJS, { type Cell } from "exceljs"

const REQUIRED_COLUMNS = [
  "week",
  "category",
  "weekly_rank",
  "show_title",
  "season_title",
  "weekly_hours_viewed",
  "runtime",
  "weekly_views",
  "cumulative_weeks_in_top_10"
] as const

export type NetflixTop10Row = {
  week: string
  category: string
  weeklyRank: number
  showTitle: string
  seasonTitle: string | null
  weeklyHoursViewed: number | null
  runtime: number | null
  weeklyViews: number | null
  cumulativeWeeksInTop10: number | null
}

function cellValue(cell: Cell): unknown {
  const value = cell.value
  if (value && typeof value === "object" && "result" in value) {
    return value.result
  }
  return value
}

function cellText(cell: Cell): string {
  const value = cellValue(cell)
  if (value instanceof Date) return value.toISOString()
  return cell.text.trim()
}

function cellNumber(cell: Cell): number | null {
  const value = cellValue(cell)
  if (typeof value === "number" && Number.isFinite(value)) return value

  const parsed = Number(cellText(cell).replaceAll(",", ""))
  return Number.isFinite(parsed) ? parsed : null
}

function cellWeek(cell: Cell): string | null {
  const value = cellValue(cell)
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const text = cellText(cell)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

export async function parseNetflixTop10Workbook(
  buffer: Buffer
): Promise<NetflixTop10Row[]> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer)
  } catch {
    throw new Error("Netflix Top 10 文件无法解析")
  }

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error("Netflix Top 10 文件无法解析")

  const columns = new Map<string, number>()
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    const name = cellText(cell)
    if (name) columns.set(name, columnNumber)
  })

  for (const column of REQUIRED_COLUMNS) {
    if (!columns.has(column)) {
      throw new Error(`Netflix Top 10 缺少列: ${column}`)
    }
  }

  const rows: NetflixTop10Row[] = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const get = (column: typeof REQUIRED_COLUMNS[number]) => {
      return row.getCell(columns.get(column) as number)
    }
    const week = cellWeek(get("week"))
    if (!week) continue

    const category = cellText(get("category"))
    const weeklyRank = cellNumber(get("weekly_rank"))
    const showTitle = cellText(get("show_title"))
    if (!category || weeklyRank == null || !showTitle) continue

    rows.push({
      week,
      category,
      weeklyRank,
      showTitle,
      seasonTitle: cellText(get("season_title")) || null,
      weeklyHoursViewed: cellNumber(get("weekly_hours_viewed")),
      runtime: cellNumber(get("runtime")),
      weeklyViews: cellNumber(get("weekly_views")),
      cumulativeWeeksInTop10: cellNumber(get("cumulative_weeks_in_top_10"))
    })
  }

  if (rows.length === 0) throw new Error("Netflix Top 10 没有有效周次")

  const latestWeek = rows.reduce((latest, row) => {
    return row.week > latest ? row.week : latest
  }, rows[0].week)

  return rows
    .filter((row) => row.week === latestWeek)
    .sort((left, right) => {
      return left.category.localeCompare(right.category) || left.weeklyRank - right.weeklyRank
    })
}
