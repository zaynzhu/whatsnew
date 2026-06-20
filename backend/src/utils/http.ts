import type { Response as UndiciResponse } from "undici"
import { runtimeSettings } from "../settings/runtimeSettingsService.js"
import {
  SourceHttpClient,
  type SourceRequestOptions,
  type SourceTransport
} from "./sourceHttpClient.js"

const compatibilityTransport: SourceTransport = async (url, options) => {
  return globalThis.fetch(url, options as RequestInit) as unknown as Promise<UndiciResponse>
}

const compatibilityHttpClient = new SourceHttpClient(runtimeSettings, compatibilityTransport)

function sourceIdForUrl(url: string): "tvmaze" | "tmdb" {
  return new URL(url).hostname.includes("tvmaze") ? "tvmaze" : "tmdb"
}

export async function fetchJson<T>(url: string, options: SourceRequestOptions): Promise<T> {
  return compatibilityHttpClient.fetchJson<T>(sourceIdForUrl(url), url, options)
}
