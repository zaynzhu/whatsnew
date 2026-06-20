export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`)
  }

  return response.json() as Promise<T>
}

export async function apiRequest<T>(
  path: string,
  method: "POST" | "PUT",
  body: unknown
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`)
  }

  return response.json() as Promise<T>
}
