import {
  sourceHttpClient,
  type SourceRequestOptions
} from "./sourceHttpClient.js"

function sourceIdForUrl(url: string): "tvmaze" | "tmdb" {
  return new URL(url).hostname.includes("tvmaze") ? "tvmaze" : "tmdb"
}

export async function fetchJson<T>(url: string, options: SourceRequestOptions): Promise<T> {
  return sourceHttpClient.fetchJson<T>(sourceIdForUrl(url), url, options)
}
