import { chmod, copyFile, readFile, rename, unlink, writeFile } from "node:fs/promises"
import dotenv from "dotenv"

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function serializeValue(value: string): string {
  if (/[\s#'"]/.test(value)) return JSON.stringify(value)
  return value
}

function assertSingleLine(value: string): void {
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error("配置值不能包含换行")
  }
}

export class EnvFileStore {
  constructor(private readonly envPath: string) {}

  async read(): Promise<Record<string, string>> {
    try {
      return dotenv.parse(await readFile(this.envPath, "utf8"))
    } catch (error) {
      if (isMissingFile(error)) return {}
      throw error
    }
  }

  async update(values: Record<string, string>): Promise<void> {
    for (const value of Object.values(values)) assertSingleLine(value)

    let currentContent = ""
    let fileExists = true
    try {
      currentContent = await readFile(this.envPath, "utf8")
    } catch (error) {
      if (!isMissingFile(error)) throw error
      fileExists = false
    }

    const backupPath = `${this.envPath}.backup.local`
    const temporaryPath = `${this.envPath}.tmp`

    if (fileExists) {
      await copyFile(this.envPath, backupPath)
      await chmod(backupPath, 0o600)
    }

    const lines = currentContent.replace(/\r\n/g, "\n").split("\n")
    if (lines.at(-1) === "") lines.pop()
    const updatedKeys = new Set<string>()
    const updatedLines = lines.map((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
      const key = match?.[1]
      if (!key || !(key in values)) return line
      updatedKeys.add(key)
      return `${key}=${serializeValue(values[key])}`
    })

    for (const [key, value] of Object.entries(values)) {
      if (!updatedKeys.has(key)) updatedLines.push(`${key}=${serializeValue(value)}`)
    }

    const nextContent = updatedLines.length > 0 ? `${updatedLines.join("\n")}\n` : ""

    try {
      await writeFile(temporaryPath, nextContent, { encoding: "utf8", mode: 0o600 })
      await chmod(temporaryPath, 0o600)
      await rename(temporaryPath, this.envPath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}
