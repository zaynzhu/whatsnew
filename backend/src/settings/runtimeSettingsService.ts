import path from "node:path"
import type { ProxyMode, SettingsFieldView } from "@whatsnew/shared/settings"
import { EnvFileStore } from "./envFileStore.js"
import { getSourceDefinition } from "./sourceCatalog.js"
import {
  KNOWN_SETTING_KEYS,
  SOURCE_PROXY_MODES,
  getSettingFieldDefinition,
  sourceEnvKey
} from "./settingsFields.js"

const VALID_PROXY_MODES = new Set<ProxyMode>(SOURCE_PROXY_MODES)

export type SettingsReader = {
  get(key: string, fallback?: string): string
  getBoolean(key: string, fallback: boolean): boolean
  sourceProxyMode(sourceId: string): ProxyMode
}

function valueFrom(values: Readonly<Record<string, string>>, key: string, fallback = ""): string {
  return values[key] ?? fallback
}

function booleanFrom(values: Readonly<Record<string, string>>, key: string, fallback: boolean): boolean {
  const value = values[key]?.trim().toLowerCase()
  if (value === undefined || value === "") return fallback
  if (["true", "1", "yes", "on"].includes(value)) return true
  if (["false", "0", "no", "off"].includes(value)) return false
  return fallback
}

function proxyModeFrom(values: Readonly<Record<string, string>>, sourceId: string): ProxyMode {
  const definition = getSourceDefinition(sourceId)
  const configuredMode = valueFrom(values, sourceEnvKey(sourceId, "PROXY_MODE")) as ProxyMode
  return VALID_PROXY_MODES.has(configuredMode) ? configuredMode : definition.defaultProxyMode
}

function validateChanges(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!KNOWN_SETTING_KEYS.has(key)) throw new Error(`未知配置项: ${key}`)
    if (value.includes("\n") || value.includes("\r")) throw new Error("配置值不能包含换行")
    if (key.endsWith("_PROXY_MODE") && !VALID_PROXY_MODES.has(value as ProxyMode)) {
      throw new Error(`代理模式无效: ${value}`)
    }
    if (key.endsWith("_ENABLED") && !["true", "false"].includes(value)) {
      throw new Error(`启用状态无效: ${value}`)
    }
  }
}

function createReader(values: Readonly<Record<string, string>>): SettingsReader {
  return {
    get(key: string, fallback = "") {
      return valueFrom(values, key, fallback)
    },
    getBoolean(key: string, fallback: boolean) {
      return booleanFrom(values, key, fallback)
    },
    sourceProxyMode(sourceId: string) {
      return proxyModeFrom(values, sourceId)
    }
  }
}

function maskSensitiveValue(value: string): string {
  if (value.length <= 4) return "••••••••"
  return `••••••••${value.slice(-4)}`
}

export class RuntimeSettingsService implements SettingsReader {
  private readonly initialValues: Record<string, string>
  private values: Readonly<Record<string, string>>
  private updateQueue: Promise<void> = Promise.resolve()

  constructor(private readonly store: EnvFileStore, initialValues: Record<string, string> = {}) {
    this.initialValues = { ...initialValues }
    this.values = Object.freeze({ ...initialValues })
  }

  async load(): Promise<void> {
    this.values = Object.freeze({ ...this.initialValues, ...await this.store.read() })
  }

  snapshot(): Readonly<Record<string, string>> {
    return this.values
  }

  get(key: string, fallback = ""): string {
    return valueFrom(this.values, key, fallback)
  }

  getBoolean(key: string, fallback: boolean): boolean {
    return booleanFrom(this.values, key, fallback)
  }

  view(overrides: Record<string, string> = {}): SettingsReader {
    validateChanges(overrides)
    return createReader(Object.freeze({ ...this.values, ...overrides }))
  }

  sourceProxyMode(sourceId: string): ProxyMode {
    return proxyModeFrom(this.values, sourceId)
  }

  sourceEnabled(sourceId: string): boolean {
    const definition = getSourceDefinition(sourceId)
    if (definition.implementationStatus !== "active" || !definition.supportsEnable) return false
    return this.getBoolean(sourceEnvKey(sourceId, "ENABLED"), true)
  }

  fieldView(key: string, label?: string): SettingsFieldView {
    const definition = getSettingFieldDefinition(key, label)
    const value = this.get(key)
    const configured = value.length > 0
    return {
      ...definition,
      configured,
      maskedValue: configured && definition.sensitive ? maskSensitiveValue(value) : null,
      value: definition.sensitive || !configured ? null : value
    }
  }

  async update(values: Record<string, string>, clearKeys: string[]): Promise<void> {
    const requestedValues = { ...values }
    const requestedClearKeys = [...clearKeys]
    const operation = this.updateQueue.then(() => this.persistUpdate(requestedValues, requestedClearKeys))
    this.updateQueue = operation.catch(() => undefined)
    return operation
  }

  private async persistUpdate(values: Record<string, string>, clearKeys: string[]): Promise<void> {
    const clearedValues = Object.fromEntries(clearKeys.map((key) => [key, ""]))
    validateChanges(values)
    validateChanges(clearedValues)

    const changes = { ...values, ...clearedValues }
    if (Object.keys(changes).length === 0) return

    const nextValues = Object.freeze({ ...this.values, ...changes })
    await this.store.update(changes)
    this.values = nextValues
  }
}

export const runtimeSettings = new RuntimeSettingsService(
  new EnvFileStore(path.resolve(process.cwd(), ".env")),
  process.env as Record<string, string>
)
