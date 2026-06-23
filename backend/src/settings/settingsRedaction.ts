import { RuntimeSettingsService } from "./runtimeSettingsService.js"
import { KNOWN_SETTING_KEYS, isSensitiveKey } from "./settingsFields.js"

function sensitiveVariants(value: string): string[] {
  const values = [value]
  try {
    const url = new URL(value)
    values.push(url.origin, url.host, url.hostname, url.username, url.password)
  } catch {
    // 非 URL 敏感值按原值脱敏
  }
  return values.filter(Boolean)
}

export function redactStoredError(message: string | null, settings: RuntimeSettingsService): string | null {
  if (!message) return null
  const sensitiveValues = [...KNOWN_SETTING_KEYS]
    .filter((key) => isSensitiveKey(key))
    .flatMap((key) => sensitiveVariants(settings.get(key)))
    .sort((left, right) => right.length - left.length)
  return sensitiveValues
    .reduce((current, value) => current.replaceAll(value, "[REDACTED]"), message)
    .replace(/([?&](?:api_key|key|token|access_token)=)[^&\s)]+/gi, "$1[REDACTED]")
    .replace(/:\/\/[^/@\s]+@/g, "://[REDACTED]@")
    .slice(0, 500)
}
