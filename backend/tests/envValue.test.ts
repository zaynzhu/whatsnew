import { describe, expect, it } from "vitest"
import { parseEnvBoolean } from "../src/config/envValue.js"

describe("parseEnvBoolean", () => {
  it.each(["false", "0", "no", "off", " FALSE "])("parses %s as false", (value) => {
    expect(parseEnvBoolean(value)).toBe(false)
  })

  it.each(["true", "1", "yes", "on", " TRUE "])("parses %s as true", (value) => {
    expect(parseEnvBoolean(value)).toBe(true)
  })

  it("leaves unsupported values for schema validation", () => {
    expect(parseEnvBoolean("sometimes")).toBe("sometimes")
  })
})
