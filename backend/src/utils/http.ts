export async function fetchJson<T>(
  url: string,
  options: RequestInit & { timeoutMs: number }
): Promise<T> {
  const { timeoutMs, ...fetchOptions } = options
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}
