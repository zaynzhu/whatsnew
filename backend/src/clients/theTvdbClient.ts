import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import {
  RuntimeSettingsService,
  runtimeSettings
} from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import {
  SourceHttpClient,
  SourceHttpError,
  sourceHttpClient
} from "../utils/sourceHttpClient.js"

export type TheTvdbUpdateType = "movies" | "series"

export type TheTvdbUpdate = {
  recordId: number
  methodInt: 1 | 2 | 3
  timeStamp: number
  mergeToId?: number | null
  mergeToEntityType?: string | null
}

export type TheTvdbUpdatesResponse = {
  status: string
  data: TheTvdbUpdate[]
  links?: { next?: string | null }
}

export type TheTvdbAlias = { language?: string | null, name?: string | null }
export type TheTvdbGenre = { id: number, name?: string | null }
export type TheTvdbRemoteId = { id?: string | null, sourceName?: string | null }
export type TheTvdbRelease = { country?: string | null, date?: string | null, detail?: string | null }

export type TheTvdbMovie = {
  id: number
  name?: string | null
  slug?: string | null
  year?: string | null
  aliases?: TheTvdbAlias[]
  genres?: TheTvdbGenre[]
  image?: string | null
  originalCountry?: string | null
  originalLanguage?: string | null
  first_release?: TheTvdbRelease | null
  releases?: TheTvdbRelease[]
  remoteIds?: TheTvdbRemoteId[]
  status?: { name?: string | null } | null
  score?: number | null
}

export type TheTvdbSeries = {
  id: number
  name?: string | null
  slug?: string | null
  aliases?: TheTvdbAlias[]
  genres?: TheTvdbGenre[]
  image?: string | null
  country?: string | null
  originalCountry?: string | null
  originalLanguage?: string | null
  firstAired?: string | null
  nextAired?: string | null
  remoteIds?: TheTvdbRemoteId[]
  status?: { name?: string | null } | null
  score?: number | null
}

export type TheTvdbClient = {
  getUpdates(type: TheTvdbUpdateType, since: number, page: number): Promise<TheTvdbUpdatesResponse>
  getMovie(id: number): Promise<TheTvdbMovie>
  getSeries(id: number): Promise<TheTvdbSeries>
}

type TheTvdbClientOptions = {
  apiKey?: string
  pin?: string
  baseUrl?: string
  minIntervalMs?: number
  timeoutMs?: number
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

type RequestContext = {
  apiKey: string
  pin: string
  baseUrl: string
  settingsOverride: Record<string, string>
}

type TheTvdbEnvelope<T> = {
  status: string
  data?: T
}

export function createTheTvdbClient(options: TheTvdbClientOptions = {}): TheTvdbClient {
  const settings = options.settings ?? runtimeSettings
  const httpClient = options.httpClient ?? sourceHttpClient
  const limiter = new RateLimiter(options.minIntervalMs ?? 2000)
  const timeoutMs = options.timeoutMs ?? 30000
  let token: string | null = null
  let loginPromise: Promise<string> | null = null

  function requestContext(): RequestContext {
    const current = settings.view()
    const apiKey = options.apiKey ?? current.get("THETVDB_API_KEY")
    const pin = options.pin ?? current.get("THETVDB_PIN")
    const configuredBaseUrl = options.baseUrl ?? current.get("THETVDB_BASE_URL")
    const baseUrl = (configuredBaseUrl || "https://api4.thetvdb.com/v4").replace(/\/$/, "")
    if (!apiKey) throw new Error("TheTVDB 凭据未配置")

    return {
      apiKey,
      pin,
      baseUrl,
      settingsOverride: captureSourceProxySettings(current, "thetvdb")
    }
  }

  async function login(context: RequestContext): Promise<string> {
    if (token) return token
    if (loginPromise) return loginPromise

    loginPromise = limiter.run(async () => {
      const body = context.pin
        ? { apikey: context.apiKey, pin: context.pin }
        : { apikey: context.apiKey }
      const response = await httpClient.fetchJson<TheTvdbEnvelope<{ token?: string }>>(
        "thetvdb",
        `${context.baseUrl}/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          timeoutMs,
          settingsOverride: context.settingsOverride
        }
      )
      const nextToken = response.data?.token
      if (!nextToken) throw new Error("TheTVDB 登录响应缺少 Token")
      token = nextToken
      return nextToken
    }).finally(() => {
      loginPromise = null
    })

    return loginPromise
  }

  async function request<T>(context: RequestContext, path: string, retried = false): Promise<T> {
    const currentToken = await login(context)
    try {
      return await limiter.run(() => httpClient.fetchJson<T>("thetvdb", `${context.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${currentToken}` },
        timeoutMs,
        settingsOverride: context.settingsOverride
      }))
    } catch (error) {
      if (retried || !(error instanceof SourceHttpError) || error.statusCode !== 401) throw error
      token = null
      await login(context)
      return request<T>(context, path, true)
    }
  }

  async function getData<T>(context: RequestContext, path: string): Promise<T> {
    const response = await request<TheTvdbEnvelope<T>>(context, path)
    if (response.data === undefined) throw new Error(`TheTVDB ${path} 响应缺少 data`)
    return response.data
  }

  return {
    async getUpdates(type, since, page) {
      const context = requestContext()
      const path = `/updates?since=${since}&type=${type}&page=${page}`
      const response = await request<TheTvdbUpdatesResponse>(context, path)
      if (response.data === undefined) throw new Error(`TheTVDB ${path} 响应缺少 data`)
      return response
    },
    async getMovie(id) {
      const context = requestContext()
      return getData<TheTvdbMovie>(context, `/movies/${id}/extended?short=true`)
    },
    async getSeries(id) {
      const context = requestContext()
      return getData<TheTvdbSeries>(context, `/series/${id}/extended?short=true`)
    }
  }
}
