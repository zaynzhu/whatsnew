import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import { createGunzip } from "node:zlib"
import {
  imdbTitleBasicsFromParsedRow,
  imdbTitleRatingFromParsedRow,
  type ImdbTitleBasicsRow,
  type ImdbTitleRatingRow,
  type ParsedImdbTsvRow
} from "./imdbDatasetsParser.js"

const BASICS_FIELDS = [
  "tconst",
  "titleType",
  "primaryTitle",
  "originalTitle",
  "isAdult",
  "startYear",
  "endYear",
  "runtimeMinutes",
  "genres"
]
const RATINGS_FIELDS = ["tconst", "averageRating", "numVotes"]

function imdbNull(value: string | undefined): string | null {
  if (value == null || value === "" || value === "\\N") return null
  return value
}

async function* streamGzipTsvRows<T>(
  filePath: string,
  requiredFields: string[],
  mapRow: (row: ParsedImdbTsvRow) => T
): AsyncGenerator<T> {
  const lines = createInterface({
    input: createReadStream(filePath).pipe(createGunzip()),
    crlfDelay: Infinity
  })
  let headers: string[] | null = null

  for await (const line of lines) {
    const cleanLine = line.replace(/\r$/, "")
    if (cleanLine.length === 0) continue

    if (!headers) {
      headers = cleanLine.split("\t")
      for (const field of requiredFields) {
        if (!headers.includes(field)) throw new Error(`IMDb TSV 缺少必需字段: ${field}`)
      }
      continue
    }

    const values = cleanLine.split("\t")
    const row = Object.fromEntries(headers.map((header, index) => [
      header,
      imdbNull(values[index])
    ])) as ParsedImdbTsvRow
    yield mapRow(row)
  }

  if (!headers) throw new Error("IMDb TSV 缺少表头")
}

export function streamImdbTitleBasics(filePath: string): AsyncGenerator<ImdbTitleBasicsRow> {
  return streamGzipTsvRows(filePath, BASICS_FIELDS, imdbTitleBasicsFromParsedRow)
}

export function streamImdbTitleRatings(filePath: string): AsyncGenerator<ImdbTitleRatingRow> {
  return streamGzipTsvRows(filePath, RATINGS_FIELDS, imdbTitleRatingFromParsedRow)
}
