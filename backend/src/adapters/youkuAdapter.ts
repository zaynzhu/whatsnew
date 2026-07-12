import { createHash } from "node:crypto"
import type { ReleaseForm } from "@whatsnew/shared/media"
import { classifyMedia } from "../domain/mediaClassifier.js"
import type { AdapterItem, PopularitySignalInput, ReleaseInput, SourceAdapter, SourceFetchBatch } from "../domain/types.js"
import { captureSourceProxySettings } from "../settings/proxyResolver.js"
import { RuntimeSettingsService, runtimeSettings } from "../settings/runtimeSettingsService.js"
import { RateLimiter } from "../utils/rateLimiter.js"
import { SourceHttpClient, sourceHttpClient } from "../utils/sourceHttpClient.js"

type YoukuNodeText = {
  title?: string | null
}

type YoukuNodeData = {
  title?: string | null
  desc?: string | null
  img?: string | null
  onlineDesc?: string | null
  reason?: {
    text?: YoukuNodeText | null
  } | null
  lbTexts?: YoukuNodeText[]
  tags?: Array<{
    uiType?: number | null
    text?: YoukuNodeText | null
  }>
  reserve?: {
    count?: number | null
  } | null
  action?: {
    type?: string | null
    value?: string | null
  } | null
  session?: Record<string, unknown> | null
}

type YoukuNode = {
  typeName?: string | null
  more?: boolean | null
  data?: YoukuNodeData | null
  nodes?: YoukuNode[]
}

type YoukuMtopResponse = {
  ret?: string[]
  data?: Record<string, {
    data?: YoukuNode | null
  }>
}

type YoukuFeed = {
  entityId: number
  category: "电视剧" | "电影"
  referer: string
}

type YoukuAdapterOptions = {
  endpoint?: string
  feeds?: YoukuFeed[]
  minIntervalMs?: number
  today?: () => string
  httpClient?: SourceHttpClient
  settings?: RuntimeSettingsService
}

type MtopSession = {
  cookies: string
  token: string
}

const DEFAULT_FEEDS: YoukuFeed[] = [
  { entityId: 22916606, category: "电视剧", referer: "https://tv.youku.com/" },
  { entityId: 22861692, category: "电影", referer: "https://movie.youku.com/" }
]
const DEFAULT_MTOP_ENDPOINT = "https://acs.youku.com/h5/mtop.youku.columbus.gateway.new.execute/1.0/"
const MTOP_API = "mtop.youku.columbus.gateway.new.execute"
const MTOP_APP_KEY = "24679788"
const MTOP_MS_CODE = "2019041100"
const MTOP_BIZ_KEY = "kuflix_node_page"
const MTOP_NODE_KEY = "PIANDAN_HEATLIST"
const MAX_PAGES = 20
const EXTERNAL_SERVICE_INTERVAL_MS = 2000
const YOUKU_TIMEOUT_MS = 30000
const USER_AGENT = "Mozilla/5.0 WhatsNewBot/0.1"

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function todayLocalDate(): string {
  return formatLocalDate(new Date())
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()

  return trimmed || null
}

function sourceUrl(showId: string): string {
  return `https://www.youku.com/show_page/id_${showId}.html`
}

function cookiePairs(response: { headers: { get(name: string): string | null, getSetCookie?: () => string[] } }): string[] {
  const headers = response.headers
  const values = headers.getSetCookie?.() ?? [headers.get("set-cookie") ?? ""]

  return [...new Set(values.flatMap((value) => (
    value.match(/_m_h5_tk(?:_enc)?=[^;,\s]+/g) ?? []
  )))]
}

function tokenFromCookies(cookies: string[]): string | null {
  const pair = cookies.find((cookie) => cookie.startsWith("_m_h5_tk="))
  const value = pair?.slice("_m_h5_tk=".length).split("_")[0]

  return cleanText(value)
}

function mtopParams(feed: YoukuFeed, pageNo: number, session: Record<string, unknown> | null) {
  const params: Record<string, unknown> = {
    debug: 0,
    utdid: "",
    appPackageKey: "com.youku.pcweb",
    ip: "127.0.0.1",
    reqSubNode: 0,
    gray: 0,
    pageNo,
    bizKey: MTOP_BIZ_KEY,
    showNodeList: 0,
    nodeKey: MTOP_NODE_KEY,
    appKey: MTOP_APP_KEY,
    bizContext: JSON.stringify({ entityId: feed.entityId, entityType: "scg" })
  }
  if (session) params.session = JSON.stringify(session)

  return params
}

function mtopSystemInfo() {
  return {
    appPackageKey: "com.youku.pcweb",
    device: "pcweb",
    os: "pcweb",
    ver: "1.0.0.0",
    userAgent: USER_AGENT,
    guid: "1590141704165YXe",
    young: 0,
    brand: "",
    network: "",
    ouid: "",
    idfa: "",
    scale: "",
    operator: "",
    resolution: "",
    pid: "",
    childGender: 0,
    zx: 0,
    appkey: MTOP_APP_KEY
  }
}

function mtopData(feed: YoukuFeed, pageNo: number, session: Record<string, unknown> | null): string {
  return JSON.stringify({
    ms_codes: MTOP_MS_CODE,
    params: JSON.stringify(mtopParams(feed, pageNo, session)),
    system_info: JSON.stringify(mtopSystemInfo())
  })
}

function mtopUrl(endpoint: string, data: string, timestamp: string, sign: string): string {
  const url = new URL(endpoint)
  const query = {
    jsv: "2.7.2",
    appKey: MTOP_APP_KEY,
    t: timestamp,
    sign,
    api: MTOP_API,
    v: "1.0",
    type: "originaljson",
    dataType: "json",
    data
  }
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

  return url.toString()
}

function resolveMtopEndpoint(configured: string | null | undefined): string {
  const value = cleanText(configured)
  if (!value) return DEFAULT_MTOP_ENDPOINT
  if (value.includes(`/h5/${MTOP_API}/`)) return value

  return `${value.replace(/\/$/, "")}/h5/${MTOP_API}/1.0/`
}

function mtopSign(token: string, timestamp: string, data: string): string {
  return createHash("md5")
    .update(`${token}&${timestamp}&${MTOP_APP_KEY}&${data}`)
    .digest("hex")
}

function successfulResponse(response: YoukuMtopResponse): boolean {
  return response.ret?.some((value) => value.startsWith("SUCCESS")) ?? false
}

function tokenFailed(response: YoukuMtopResponse): boolean {
  return response.ret?.some((value) => value.includes("TOKEN")) ?? false
}

function findReserveComponent(node: YoukuNode | null | undefined): YoukuNode | null {
  if (!node) return null
  if (node.typeName === "KU_FLIX_V_GRID_PIANDAN_COMPONENT") return node

  for (const child of node.nodes ?? []) {
    const component = findReserveComponent(child)
    if (component) return component
  }

  return null
}

function releaseLabel(data: YoukuNodeData): string | null {
  return cleanText(data.reason?.text?.title)
    ?? data.lbTexts?.map((text) => cleanText(text.title)).find(Boolean)
    ?? cleanText(data.onlineDesc)
    ?? null
}

function parseReleaseDate(label: string | null, today: string): { releaseDate: string | null, releaseTime: string | null } {
  if (!label) return { releaseDate: null, releaseTime: null }

  const relativeMatch = label.match(/(今天|今日|明天|明日)(?:\s*(\d{1,2}):(\d{2}))?/)
  if (relativeMatch) {
    const date = new Date(`${today}T00:00:00`)
    if (["明天", "明日"].includes(relativeMatch[1])) date.setDate(date.getDate() + 1)

    return {
      releaseDate: formatLocalDate(date),
      releaseTime: relativeMatch[2] && relativeMatch[3]
        ? `${relativeMatch[2].padStart(2, "0")}:${relativeMatch[3]}`
        : null
    }
  }

  const dateMatch = label.match(/(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/)
  if (!dateMatch) return { releaseDate: null, releaseTime: null }

  let year = Number(today.slice(0, 4))
  const month = dateMatch[1].padStart(2, "0")
  const day = dateMatch[2].padStart(2, "0")
  if (`${year}-${month}-${day}` < today) year += 1

  return {
    releaseDate: `${year}-${month}-${day}`,
    releaseTime: dateMatch[3] && dateMatch[4]
      ? `${dateMatch[3].padStart(2, "0")}:${dateMatch[4]}`
      : null
  }
}

function genresFromNode(data: YoukuNodeData, fallbackCategory: string): string[] {
  const genres = (data.tags ?? [])
    .flatMap((tag) => cleanText(tag.text?.title)?.split("·") ?? [])
    .map((genre) => genre.trim())
    .filter((genre) => genre && genre !== "预告")

  return [...new Set(genres.length > 0 ? genres : [fallbackCategory])]
}

function releaseFromNode(showId: string, releaseDate: string | null, releaseTime: string | null, today: string): ReleaseInput {
  return {
    platform: "优酷",
    region: "CN",
    releaseDate,
    releaseTime,
    releasePattern: "streaming_release",
    releaseStatus: releaseDate === today ? "airing_today" : "upcoming",
    seasonNumber: null,
    episodeNumber: null,
    source: "youku",
    sourceUrl: sourceUrl(showId)
  }
}

function signalFromNode(showId: string, count: number | null): PopularitySignalInput | null {
  if (count == null) return null

  return {
    source: "youku_reserve",
    sourceCategory: "official_platform",
    platform: "优酷",
    region: "CN",
    window: "upcoming",
    rank: null,
    rankDelta: null,
    value: count,
    valueLabel: "Youku reservations",
    sourceUrl: sourceUrl(showId)
  }
}

function itemFromNode(node: YoukuNode, feed: YoukuFeed, today: string): AdapterItem | null {
  const data = node.data
  const title = cleanText(data?.title)
  const showId = cleanText(data?.action?.value)
  if (!data || !title || !showId || data.action?.type !== "JUMP_TO_SHOW") return null

  const genres = genresFromNode(data, feed.category)
  const classification = classifyMedia({
    source: "youku",
    sourceContentType: feed.category,
    genres
  })
  const releaseForm: ReleaseForm = classification.releaseForm === "tv_series"
    ? "web_series"
    : classification.releaseForm
  const { releaseDate, releaseTime } = parseReleaseDate(releaseLabel(data), today)
  const signal = signalFromNode(showId, data.reserve?.count ?? null)

  return {
    media: {
      source: "youku",
      sourceId: `youku-${showId}`,
      mediaType: classification.mediaType,
      releaseForm,
      sourceContentType: feed.category,
      titleDisplay: title,
      titleOriginal: title,
      titleAliases: [],
      overview: cleanText(data.desc),
      posterUrl: cleanText(data.img),
      productionCountries: ["CN"],
      originalLanguage: "zh",
      genres,
      firstReleaseDate: releaseDate,
      status: "upcoming",
      tmdbId: null,
      tvmazeId: null,
      imdbId: null,
      traktId: null,
      tvdbId: null
    },
    releases: [releaseFromNode(showId, releaseDate, releaseTime, today)],
    popularitySignals: signal ? [signal] : []
  }
}

function assignReservationRanks(items: AdapterItem[]) {
  items
    .flatMap((item) => item.popularitySignals)
    .filter((signal) => signal.source === "youku_reserve" && signal.value != null)
    .sort((left, right) => (right.value ?? 0) - (left.value ?? 0))
    .forEach((signal, index) => {
      signal.rank = index + 1
    })
}

export function createYoukuAdapter(options: YoukuAdapterOptions = {}): SourceAdapter<SourceFetchBatch> {
  const limiter = new RateLimiter(options.minIntervalMs ?? EXTERNAL_SERVICE_INTERVAL_MS)
  const httpClient = options.httpClient ?? sourceHttpClient
  const settings = options.settings ?? runtimeSettings
  const today = options.today ?? todayLocalDate

  return {
    source: "youku",
    async fetchItems() {
      const currentSettings = settings.view()
      const endpoint = resolveMtopEndpoint(options.endpoint ?? currentSettings.get("SOURCE_YOUKU_BASE_URL"))
      const settingsOverride = captureSourceProxySettings(currentSettings, "youku")
      let mtopSession: MtopSession | null = null

      async function acquireSession(feed: YoukuFeed, data: string): Promise<MtopSession> {
        const timestamp = String(Date.now())
        const response = await limiter.run(() => httpClient.request("youku", mtopUrl(endpoint, data, timestamp, ""), {
          headers: { "user-agent": USER_AGENT, referer: feed.referer },
          timeoutMs: YOUKU_TIMEOUT_MS,
          settingsOverride
        }))
        const cookies = cookiePairs(response)
        const token = tokenFromCookies(cookies)
        await response.text()
        if (!token) throw new Error("优酷 MTop 响应缺少访问令牌")

        return { cookies: cookies.join("; "), token }
      }

      async function fetchPage(
        feed: YoukuFeed,
        pageNo: number,
        session: Record<string, unknown> | null,
        retried = false
      ): Promise<YoukuMtopResponse> {
        const data = mtopData(feed, pageNo, session)
        mtopSession ??= await acquireSession(feed, data)
        const timestamp = String(Date.now())
        const sign = mtopSign(mtopSession.token, timestamp, data)
        const response = await limiter.run(() => httpClient.request("youku", mtopUrl(endpoint, data, timestamp, sign), {
          headers: {
            "user-agent": USER_AGENT,
            referer: feed.referer,
            cookie: mtopSession!.cookies
          },
          timeoutMs: YOUKU_TIMEOUT_MS,
          settingsOverride,
          sensitiveValues: [mtopSession!.cookies, mtopSession!.token]
        }))
        const body = await response.json() as YoukuMtopResponse
        if (successfulResponse(body)) return body
        if (!retried && tokenFailed(body)) {
          mtopSession = null
          return fetchPage(feed, pageNo, session, true)
        }

        throw new Error(`优酷 MTop 请求失败: ${(body.ret ?? ["unknown_error"]).join(", ")}`)
      }

      const items = new Map<string, AdapterItem>()
      const currentDate = today()
      for (const feed of options.feeds ?? DEFAULT_FEEDS) {
        let session: Record<string, unknown> | null = null
        for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
          const response = await fetchPage(feed, pageNo, session)
          const component = findReserveComponent(response.data?.[MTOP_MS_CODE]?.data)
          if (!component) throw new Error(`优酷待播响应缺少预约组件: entityId=${feed.entityId}`)

          for (const node of component.nodes ?? []) {
            const item = itemFromNode(node, feed, currentDate)
            if (item) items.set(item.media.sourceId, item)
          }

          if (!component.more || (component.nodes?.length ?? 0) === 0) break
          session = component.data?.session ?? null
        }
      }

      const currentItems = Array.from(items.values())
      assignReservationRanks(currentItems)

      return {
        items: currentItems,
        completeMediaSources: ["youku"],
        completePopularitySources: ["youku_hot", "youku_reserve"],
        completeReleaseSources: ["youku"]
      }
    }
  }
}

export const youkuAdapter = createYoukuAdapter()
