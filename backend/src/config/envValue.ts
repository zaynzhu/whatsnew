export function parseEnvBoolean(value: unknown): unknown {
  if (typeof value !== "string") return value

  const normalized = value.trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off"].includes(normalized)) return false
  return value
}
