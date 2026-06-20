import { access, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { EnvFileStore } from "../src/settings/envFileStore.js"
import { RuntimeSettingsService } from "../src/settings/runtimeSettingsService.js"

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "whatsnew-settings-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function fixtureSettings(content: string): Promise<RuntimeSettingsService> {
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, content)
  const settings = new RuntimeSettingsService(new EnvFileStore(envPath))
  await settings.load()
  return settings
}

it("preserves comments and swaps the runtime snapshot only after an atomic save", async () => {
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, "# proxy\nHTTPS_PROXY=http://old.test:7890\nTMDB_API_KEY=secret-old\n")
  const settings = new RuntimeSettingsService(new EnvFileStore(envPath))
  await settings.load()

  await settings.update({ HTTPS_PROXY: "http://new.test:7890" }, [])

  expect(await readFile(envPath, "utf8")).toContain("# proxy")
  expect(await readFile(envPath, "utf8")).toContain("HTTPS_PROXY=http://new.test:7890")
  expect(settings.get("HTTPS_PROXY")).toBe("http://new.test:7890")
  expect(await readFile(`${envPath}.backup.local`, "utf8")).toContain("http://old.test:7890")
  expect((await stat(envPath)).mode & 0o777).toBe(0o600)
  expect((await stat(`${envPath}.backup.local`)).mode & 0o777).toBe(0o600)
})

it("never returns a sensitive value and keeps it when omitted", async () => {
  const settings = await fixtureSettings("TMDB_API_KEY=abcd-secret-1234\n")
  const field = settings.fieldView("TMDB_API_KEY")

  expect(field.value).toBeNull()
  expect(field.configured).toBe(true)
  expect(field.maskedValue).toBe("••••••••1234")

  await settings.update({}, [])
  expect(settings.get("TMDB_API_KEY")).toBe("abcd-secret-1234")
})

it("does not reveal a short sensitive value in its mask", async () => {
  const settings = await fixtureSettings("TMDB_API_KEY=1234\n")
  const field = settings.fieldView("TMDB_API_KEY")

  expect(field.maskedValue).toBe("••••••••")
  expect(JSON.stringify(field)).not.toContain("1234")
})

it("clears a sensitive value only when clearKeys explicitly includes it", async () => {
  const settings = await fixtureSettings("TMDB_API_KEY=abcd-secret-1234\n")
  await settings.update({}, ["TMDB_API_KEY"])
  expect(settings.get("TMDB_API_KEY")).toBe("")
})

it("rejects unknown keys and newline injection", async () => {
  const settings = await fixtureSettings("SYNC_ON_START=false\n")
  await expect(settings.update({ UNKNOWN_KEY: "x" }, [])).rejects.toThrow("未知配置项")
  await expect(settings.update({ HTTPS_PROXY: "ok\nINJECTED=yes" }, [])).rejects.toThrow("配置值不能包含换行")
  await expect(settings.update({ SOURCE_TMDB_PROXY_MODE: "sometimes" }, [])).rejects.toThrow("代理模式无效")
})

it("keeps the old snapshot when persistence fails", async () => {
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, "HTTPS_PROXY=http://old.test:7890\n")
  const store = new EnvFileStore(envPath)
  const settings = new RuntimeSettingsService(store)
  await settings.load()
  vi.spyOn(store, "update").mockRejectedValueOnce(new Error("write failed"))

  await expect(settings.update({ HTTPS_PROXY: "http://new.test:7890" }, [])).rejects.toThrow("write failed")
  expect(settings.get("HTTPS_PROXY")).toBe("http://old.test:7890")
})

it("applies read-only overrides without mutating the live snapshot", async () => {
  const settings = await fixtureSettings("SOURCE_TMDB_PROXY_MODE=inherit\n")
  const view = settings.view({ SOURCE_TMDB_PROXY_MODE: "direct" })

  expect(view.sourceProxyMode("tmdb")).toBe("direct")
  expect(settings.sourceProxyMode("tmdb")).toBe("inherit")
})

it("keeps non-active sources disabled regardless of environment values", async () => {
  const settings = await fixtureSettings("SOURCE_TRAKT_ENABLED=true\nSOURCE_TMDB_ENABLED=true\n")

  expect(settings.sourceEnabled("trakt")).toBe(false)
  expect(settings.sourceEnabled("tmdb")).toBe(true)
  expect(settings.sourceProxyMode("youku")).toBe("direct")
})

it("masks proxy URLs without treating proxy mode as a secret", async () => {
  const settings = await fixtureSettings([
    "SOURCE_TMDB_PROXY_MODE=custom",
    "SOURCE_TMDB_HTTPS_PROXY=http://secret.test:7890"
  ].join("\n"))

  expect(settings.fieldView("SOURCE_TMDB_PROXY_MODE").sensitive).toBe(false)
  expect(settings.fieldView("SOURCE_TMDB_PROXY_MODE").value).toBe("custom")
  expect(settings.fieldView("SOURCE_TMDB_HTTPS_PROXY").value).toBeNull()
})

it("round-trips spaces, quotes, and hash characters", async () => {
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, "DOUBAN_COOKIE=old\n")
  const store = new EnvFileStore(envPath)
  const cookie = "sid='a b'#fragment"

  await store.update({ DOUBAN_COOKIE: cookie })

  expect((await store.read()).DOUBAN_COOKIE).toBe(cookie)
  expect(await readFile(envPath, "utf8")).toContain(`DOUBAN_COOKIE=${JSON.stringify(cookie)}`)
})

it("preserves export prefixes and inline comments", async () => {
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, [
    "export HTTPS_PROXY=http://old.test:7890 # network route",
    "TMDB_BASE_URL=https://old.test/3#api-route"
  ].join("\n"))
  const store = new EnvFileStore(envPath)

  await store.update({
    HTTPS_PROXY: "http://new.test:7890",
    TMDB_BASE_URL: "https://new.test/3"
  })

  const content = await readFile(envPath, "utf8")
  expect(content).toContain("export HTTPS_PROXY=http://new.test:7890 # network route")
  expect(content).toContain("TMDB_BASE_URL=https://new.test/3#api-route")
})

it("keeps the original file when the atomic temporary write fails", async () => {
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, "HTTPS_PROXY=http://old.test:7890\n")
  await symlink(tempDir, `${envPath}.tmp`)
  const store = new EnvFileStore(envPath)

  await expect(store.update({ HTTPS_PROXY: "http://new.test:7890" })).rejects.toThrow()
  expect(await readFile(envPath, "utf8")).toContain("http://old.test:7890")
  expect(await readFile(`${envPath}.backup.local`, "utf8")).toContain("http://old.test:7890")
  await expect(access(`${envPath}.tmp`)).rejects.toThrow()
})

it("serializes concurrent updates without losing an earlier change", async () => {
  const envPath = join(tempDir, ".env")
  await writeFile(envPath, "HTTPS_PROXY=\nSOURCE_TMDB_PROXY_MODE=inherit\n")
  const store = new EnvFileStore(envPath)
  const settings = new RuntimeSettingsService(store)
  await settings.load()

  let releaseFirstWrite: () => void = () => undefined
  const firstWriteBlocked = new Promise<void>((resolve) => {
    releaseFirstWrite = resolve
  })
  let writeCount = 0
  vi.spyOn(store, "update").mockImplementation(async () => {
    writeCount += 1
    if (writeCount === 1) await firstWriteBlocked
  })

  const firstUpdate = settings.update({ HTTPS_PROXY: "http://proxy.test:7890" }, [])
  await vi.waitFor(() => expect(writeCount).toBe(1))
  const secondUpdate = settings.update({ SOURCE_TMDB_PROXY_MODE: "direct" }, [])
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(settings.get("HTTPS_PROXY")).toBe("")
  expect(settings.sourceProxyMode("tmdb")).toBe("inherit")
  releaseFirstWrite()
  await Promise.all([firstUpdate, secondUpdate])

  expect(settings.get("HTTPS_PROXY")).toBe("http://proxy.test:7890")
  expect(settings.sourceProxyMode("tmdb")).toBe("direct")
})
