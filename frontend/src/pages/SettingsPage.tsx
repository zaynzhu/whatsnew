import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Images,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Settings,
  SlidersHorizontal,
  TestTube2,
  XCircle
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { apiGet, apiRequest } from "../api/client"
import type {
  ConnectionTestResult,
  PosterHealthResponse,
  ProxyMode,
  ProxyTestResponse,
  SettingsResponse,
  SettingsUpdateRequest,
  SettingsUpdateResponse,
  SourcePreviewResponse,
  SourceSettingsView
} from "../api/types"
import { SourceConfigDialog } from "../components/SourceConfigDialog"
import { SourcePreviewDialog } from "../components/SourcePreviewDialog"
import {
  SOURCE_LOCAL_STATE_LABELS,
  sourceLocalStateDetail
} from "../utils/sourceLocalState"
import {
  SOURCE_ACCESS_LABELS,
  SOURCE_SIGNAL_LABELS
} from "../utils/sourceSemantics"

const MODE_LABELS: Record<ConnectionTestResult["mode"], string> = {
  direct: "直连",
  http_proxy: "HTTP 代理",
  https_proxy: "HTTPS 代理",
  source: "数据源"
}

const SOURCE_GROUPS: Array<{ id: SourceSettingsView["group"], label: string }> = [
  { id: "global_metadata", label: "全球元数据" },
  { id: "cross_platform", label: "跨平台热度" },
  { id: "international_platform", label: "国际流媒体" },
  { id: "china_platform", label: "中国平台" }
]

const SOURCE_STATUS_LABELS: Record<SourceSettingsView["implementationStatus"], string> = {
  active: "已接入",
  blocked: "接入受限",
  planned: "规划中",
  commercial: "商业接口"
}

const PROXY_MODE_LABELS: Record<ProxyMode, string> = {
  inherit: "跟随全局",
  direct: "直连",
  custom: "自定义"
}
const SOURCE_STATUS_REFETCH_MS = 5000
const POSTER_LOOKUP_LABELS: Record<PosterHealthResponse["samples"]["missing"][number]["lookupState"], string> = {
  not_attempted: "尚未尝试",
  cooldown: "等待重试",
  retry_eligible: "可以重试"
}
const ATTENTION_CATEGORY_LABELS: Record<PosterHealthResponse["samples"]["missing"][number]["attentionCategory"], string> = {
  scripted: "剧情影视",
  animation: "动画",
  documentary: "纪录片",
  reality_variety: "真人秀与综艺",
  talk_game: "谈话与游戏",
  news: "新闻",
  sports: "体育"
}

function posterLookupLabel(item: PosterHealthResponse["samples"]["missing"][number]): string {
  const label = POSTER_LOOKUP_LABELS[item.lookupState]
  if (!item.lastLookupAt) return label
  return `${label} · ${new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(item.lastLookupAt))}`
}

function cooldownExpiryLabel(value: string | null): string {
  if (!value) return "暂无冷却任务"
  return `最早 ${new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value))}`
}

type SourceTestResponse = {
  sourceId: string
  implementationStatus: SourceSettingsView["implementationStatus"]
  result: ConnectionTestResult
}

type SourcePolicyMutation = {
  sourceId: string
  request: SettingsUpdateRequest
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [changedValues, setChangedValues] = useState<Record<string, string>>({})
  const [clearKeys, setClearKeys] = useState<string[]>([])
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle")
  const [attentionChanges, setAttentionChanges] = useState<Record<string, string>>({})
  const [attentionSaveState, setAttentionSaveState] = useState<"idle" | "success" | "error">("idle")
  const [schedulerChanges, setSchedulerChanges] = useState<Record<string, string>>({})
  const [schedulerSaveState, setSchedulerSaveState] = useState<"idle" | "success" | "error">("idle")
  const [selectedSource, setSelectedSource] = useState<SourceSettingsView | null>(null)
  const [previewSource, setPreviewSource] = useState<SourceSettingsView | null>(null)

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsResponse>("/api/settings"),
    refetchInterval: SOURCE_STATUS_REFETCH_MS
  })

  const posterHealthQuery = useQuery({
    queryKey: ["poster-health"],
    queryFn: () => apiGet<PosterHealthResponse>("/api/poster-health"),
    refetchInterval: 30_000
  })

  const saveMutation = useMutation({
    mutationFn: (request: SettingsUpdateRequest) => apiRequest<SettingsUpdateResponse>(
      "/api/settings",
      "PUT",
      request
    ),
    onSuccess: async () => {
      setChangedValues({})
      setClearKeys([])
      setVisibleFields({})
      setSaveState("success")
      await queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
    onError: () => setSaveState("error")
  })

  const testMutation = useMutation({
    mutationFn: (values: Record<string, string>) => apiRequest<ProxyTestResponse>(
      "/api/settings/proxy/test",
      "POST",
      values
    )
  })

  const attentionMutation = useMutation({
    mutationFn: (request: SettingsUpdateRequest) => apiRequest<SettingsUpdateResponse>(
      "/api/settings",
      "PUT",
      request
    ),
    onSuccess: async () => {
      setAttentionChanges({})
      setAttentionSaveState("success")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ])
    },
    onError: () => setAttentionSaveState("error")
  })

  const schedulerMutation = useMutation({
    mutationFn: (request: SettingsUpdateRequest) => apiRequest<SettingsUpdateResponse>(
      "/api/settings",
      "PUT",
      request
    ),
    onSuccess: async () => {
      setSchedulerChanges({})
      setSchedulerSaveState("success")
      await queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
    onError: () => setSchedulerSaveState("error")
  })

  const sourcePolicyMutation = useMutation({
    mutationFn: ({ request }: SourcePolicyMutation) => apiRequest<SettingsUpdateResponse>(
      "/api/settings",
      "PUT",
      request
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] })
  })

  const sourceTestMutation = useMutation({
    mutationFn: (sourceId: string) => apiRequest<SourceTestResponse>(
      `/api/sources/${sourceId}/test`,
      "POST",
      {}
    )
  })

  const sourceSyncMutation = useMutation({
    mutationFn: (sourceId: string) => apiRequest<unknown>(
      `/api/sources/${sourceId}/sync`,
      "POST",
      {}
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["sources"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ])
    }
  })

  const sourcePreviewMutation = useMutation({
    mutationFn: (sourceId: string) => apiRequest<SourcePreviewResponse>(
      `/api/sources/${sourceId}/preview`,
      "POST",
      {}
    )
  })

  function updateValue(key: string, value: string) {
    setSaveState("idle")
    setChangedValues((current) => {
      if (!value) {
        const { [key]: _removed, ...rest } = current
        return rest
      }
      return { ...current, [key]: value }
    })
    setClearKeys((current) => current.filter((item) => item !== key))
  }

  function toggleClear(key: string) {
    setSaveState("idle")
    setChangedValues((current) => {
      const { [key]: _removed, ...rest } = current
      return rest
    })
    setClearKeys((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ))
  }

  function saveSettings() {
    saveMutation.mutate({ values: changedValues, clearKeys })
  }

  function testProxy() {
    testMutation.mutate({
      ...Object.fromEntries(clearKeys.map((key) => [key, ""])),
      ...changedValues
    })
  }

  function updateAttentionWeight(key: string, value: number) {
    setAttentionSaveState("idle")
    setAttentionChanges((current) => ({ ...current, [key]: String(value) }))
  }

  function restoreAttentionDefaults() {
    setAttentionSaveState("idle")
    setAttentionChanges(Object.fromEntries(
      settingsQuery.data?.contentWeights.map((weight) => [weight.key, String(weight.defaultValue)]) ?? []
    ))
  }

  function saveAttentionWeights() {
    attentionMutation.mutate({ values: attentionChanges, clearKeys: [] })
  }

  function updateSchedulerSetting(key: string, value: string) {
    setSchedulerSaveState("idle")
    setSchedulerChanges((current) => ({ ...current, [key]: value }))
  }

  function saveSchedulerSettings() {
    schedulerMutation.mutate({ values: schedulerChanges, clearKeys: [] })
  }

  function nextRunLabel(value: string | null): string {
    if (!value) return "自动调度未运行"
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai"
    }).format(new Date(value))
  }

  function sourceSettingKey(sourceId: string, suffix: "ENABLED" | "PROXY_MODE"): string {
    return `SOURCE_${sourceId.toUpperCase()}_${suffix}`
  }

  function updateSourcePolicy(sourceId: string, key: string, value: string) {
    sourcePolicyMutation.mutate({
      sourceId,
      request: { values: { [key]: value }, clearKeys: [] }
    })
  }

  async function saveSourceConfig(request: SettingsUpdateRequest) {
    await apiRequest<SettingsUpdateResponse>("/api/settings", "PUT", request)
    await queryClient.invalidateQueries({ queryKey: ["settings"] })
  }

  if (settingsQuery.isLoading) {
    return <main className="page settingsLayout"><p className="emptyText">正在读取设置...</p></main>
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return <main className="page settingsLayout"><p className="emptyText">设置读取失败</p></main>
  }

  const hasChanges = Object.keys(changedValues).length > 0 || clearKeys.length > 0
  const hasAttentionChanges = Object.keys(attentionChanges).length > 0
  const hasSchedulerChanges = Object.keys(schedulerChanges).length > 0
  const posterHealth = typeof posterHealthQuery.data?.coveragePercent === "number"
    ? posterHealthQuery.data
    : null
  const largestMissingSourceCount = posterHealth?.missingBySource[0]?.count ?? 0
  const sourceNames = new Map(settingsQuery.data.sources.map((source) => [source.id, source.name]))

  function sourceName(sourceId: string): string {
    return sourceNames.get(sourceId) ?? sourceId
  }

  return (
    <main className="page settingsLayout">
      <header className="settingsHeader">
        <div>
          <p className="eyebrow">运行参数</p>
          <h1>系统设置</h1>
        </div>
        <Settings aria-hidden="true" size={28} />
      </header>

      <section className="proxySettings" aria-labelledby="proxy-heading">
        <div className="settingsSectionHeader">
          <div>
            <span className="settingsIndex">01 / NETWORK</span>
            <h2 id="proxy-heading">网络代理</h2>
          </div>
          <div className="protocolRail" aria-hidden="true">
            <span>HTTP</span>
            <span>HTTPS</span>
          </div>
        </div>

        <div className="proxyFieldGrid">
          {settingsQuery.data.proxyFields.map((field) => {
            const localValue = changedValues[field.key] ?? ""
            const isCleared = clearKeys.includes(field.key)
            const isVisible = Boolean(visibleFields[field.key] && localValue)

            return (
              <div className="settingsField" key={field.key}>
                <label htmlFor={field.key}>{field.label}</label>
                <div className="secureInput">
                  <input
                    id={field.key}
                    type={isVisible ? "text" : "password"}
                    value={localValue}
                    placeholder={isCleared ? "保存后清除" : field.maskedValue ?? "未配置"}
                    autoComplete="off"
                    onChange={(event) => updateValue(field.key, event.target.value)}
                  />
                  <button
                    type="button"
                    className="iconButton"
                    aria-label={isVisible ? `隐藏${field.label}` : `显示${field.label}`}
                    title={isVisible ? "隐藏输入" : "显示输入"}
                    disabled={!localValue}
                    onClick={() => setVisibleFields((current) => ({
                      ...current,
                      [field.key]: !current[field.key]
                    }))}
                  >
                    {isVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                  </button>
                </div>
                {field.configured && (
                  <label className="clearSetting">
                    <input
                      type="checkbox"
                      checked={isCleared}
                      onChange={() => toggleClear(field.key)}
                    />
                    <span>清除已保存的{field.label}</span>
                  </label>
                )}
              </div>
            )
          })}
        </div>

        <div className="settingsActions">
          <button
            type="button"
            className="secondaryButton"
            disabled={testMutation.isPending}
            onClick={testProxy}
          >
            <PlugZap aria-hidden="true" size={18} />
            {testMutation.isPending ? "测试中" : "测试代理连接"}
          </button>
          <button
            type="button"
            className="primaryButton"
            disabled={!hasChanges || saveMutation.isPending}
            onClick={saveSettings}
          >
            <Save aria-hidden="true" size={18} />
            {saveMutation.isPending ? "保存中" : "保存设置"}
          </button>
        </div>

        <div className="settingsFeedback" aria-live="polite">
          {saveState === "success" && <p className="successText">设置已立即生效</p>}
          {saveState === "error" && <p className="errorText">设置保存失败</p>}
          {testMutation.isError && <p className="errorText">代理测试失败</p>}
        </div>

        {testMutation.data && (
          <div className="connectionResults" aria-label="代理连接测试结果">
            {testMutation.data.items.map((result) => (
              <div className={result.success ? "connectionResult success" : "connectionResult failed"} key={result.mode}>
                {result.success
                  ? <CheckCircle2 aria-hidden="true" size={18} />
                  : <XCircle aria-hidden="true" size={18} />}
                <div>
                  <strong>{MODE_LABELS[result.mode]}</strong>
                  <span>{result.message}</span>
                </div>
                <time>{result.durationMs} ms</time>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="attentionSettings" aria-labelledby="attention-heading">
        <div className="settingsSectionHeader attentionHeader">
          <div>
            <span className="settingsIndex">02 / FOCUS</span>
            <h2 id="attention-heading">内容关注权重</h2>
          </div>
          <div className="attentionLegend" aria-label="权重刻度">
            <span>降低</span>
            <span>常规</span>
            <span>优先</span>
          </div>
        </div>

        <div className="attentionWeightList">
          {settingsQuery.data.contentWeights.map((weight) => {
            const value = Number(attentionChanges[weight.key] ?? weight.value)
            return (
              <div className="attentionWeightRow" key={weight.category}>
                <div className="attentionWeightIdentity">
                  <strong>{weight.label}</strong>
                  <span>{weight.description}</span>
                </div>
                <input
                  id={weight.key}
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={value}
                  aria-label={`${weight.label}权重`}
                  onChange={(event) => updateAttentionWeight(weight.key, Number(event.target.value))}
                />
                <output htmlFor={weight.key} aria-label={`${weight.label}当前权重`}>{value}</output>
                <span className="attentionDefault">默认 {weight.defaultValue}</span>
              </div>
            )
          })}
        </div>

        <div className="attentionActions">
          <p>保存后立即影响首页主视觉和今日、未来排期的展示顺序。</p>
          <div>
            <button type="button" className="secondaryButton" onClick={restoreAttentionDefaults}>
              <RotateCcw aria-hidden="true" size={17} />
              恢复默认
            </button>
            <button
              type="button"
              className="primaryButton"
              disabled={!hasAttentionChanges || attentionMutation.isPending}
              onClick={saveAttentionWeights}
            >
              <Save aria-hidden="true" size={17} />
              {attentionMutation.isPending ? "保存中" : "保存权重"}
            </button>
          </div>
        </div>
        <div className="settingsFeedback" aria-live="polite">
          {attentionSaveState === "success" && <p className="successText">关注权重已立即生效</p>}
          {attentionSaveState === "error" && <p className="errorText">关注权重保存失败</p>}
        </div>
      </section>

      <section className="schedulerSettings" aria-labelledby="scheduler-heading">
        <div className="settingsSectionHeader schedulerHeader">
          <div>
            <span className="settingsIndex">03 / SCHEDULE</span>
            <h2 id="scheduler-heading">数据刷新调度</h2>
          </div>
          <div className={`schedulerRuntime ${settingsQuery.data.scheduler.enabled ? "active" : "inactive"}`}>
            <Clock3 aria-hidden="true" size={18} />
            <span>{settingsQuery.data.scheduler.forcedDisabled
              ? "隔离沙盒强制关闭"
              : settingsQuery.data.scheduler.enabled ? "自动调度运行中" : "自动调度未启动"}</span>
          </div>
        </div>

        <div className="schedulerControlGrid">
          <label>
            <span>小时级来源</span>
            <select
              aria-label="小时级刷新频率"
              disabled={settingsQuery.data.scheduler.forcedDisabled}
              value={schedulerChanges.SCHEDULER_HOURLY_INTERVAL_HOURS
                ?? String(settingsQuery.data.scheduler.hourlyIntervalHours)}
              onChange={(event) => updateSchedulerSetting(
                "SCHEDULER_HOURLY_INTERVAL_HOURS",
                event.target.value
              )}
            >
              <option value="1">每小时</option>
              <option value="2">每 2 小时</option>
              <option value="3">每 3 小时</option>
              <option value="4">每 4 小时</option>
              <option value="6">每 6 小时</option>
              <option value="12">每 12 小时</option>
            </select>
            <small>下一次 {nextRunLabel(settingsQuery.data.scheduler.nextHourlyRunAt)}</small>
          </label>
          <label>
            <span>日级来源</span>
            <input
              aria-label="日级刷新时间"
              disabled={settingsQuery.data.scheduler.forcedDisabled}
              type="time"
              value={schedulerChanges.SCHEDULER_DAILY_TIME ?? settingsQuery.data.scheduler.dailyTime}
              onChange={(event) => updateSchedulerSetting("SCHEDULER_DAILY_TIME", event.target.value)}
            />
            <small>下一次 {nextRunLabel(settingsQuery.data.scheduler.nextDailyRunAt)}</small>
          </label>
        </div>

        <div className="schedulerActions">
          <p>时间按北京时间计算，保存后立即重排后续任务，不会重复触发正在执行的同步。</p>
          <button
            type="button"
            className="primaryButton"
            disabled={!hasSchedulerChanges || schedulerMutation.isPending || settingsQuery.data.scheduler.forcedDisabled}
            onClick={saveSchedulerSettings}
          >
            <Save aria-hidden="true" size={17} />
            {schedulerMutation.isPending ? "保存中" : "保存调度"}
          </button>
        </div>
        <div className="settingsFeedback" aria-live="polite">
          {schedulerSaveState === "success" && <p className="successText">刷新调度已立即生效</p>}
          {schedulerSaveState === "error" && <p className="errorText">刷新调度保存失败</p>}
        </div>
      </section>

      <section className="posterHealthSettings" aria-labelledby="poster-health-heading">
        <div className="settingsSectionHeader posterHealthHeader">
          <div>
            <span className="settingsIndex">04 / IMAGES</span>
            <h2 id="poster-health-heading">图片健康</h2>
          </div>
          <Images aria-hidden="true" size={24} />
        </div>

        {posterHealth ? (
          <>
            <div className="posterHealthGrid">
              <div>
                <span>覆盖率</span>
                <strong>{posterHealth.coveragePercent}%</strong>
              </div>
              <div>
                <span>已有海报</span>
                <strong>{posterHealth.withPoster} / {posterHealth.total}</strong>
              </div>
              <div>
                <span>缺少海报</span>
                <strong>{posterHealth.missing}</strong>
              </div>
              <div>
                <span>缺图冷却中</span>
                <strong>{posterHealth.lookup.cooldown}</strong>
                <small>{cooldownExpiryLabel(posterHealth.lookup.nextCooldownExpiryAt)}</small>
              </div>
              <div>
                <span>缺图可重试</span>
                <strong>{posterHealth.lookup.retryEligible}</strong>
              </div>
              <div>
                <span>损坏</span>
                <strong className={posterHealth.statuses.broken > 0 ? "errorText" : "successText"}>
                  {posterHealth.statuses.broken}
                </strong>
              </div>
              <div>
                <span>尺寸已检测</span>
                <strong>{posterHealth.quality.adequate + posterHealth.quality.undersized}</strong>
              </div>
              <div>
                <span>低清</span>
                <strong className={posterHealth.quality.undersized > 0 ? "warningText" : "successText"}>
                  {posterHealth.quality.undersized}
                </strong>
              </div>
              <div>
                <span>低清冷却中</span>
                <strong>{posterHealth.replacement.cooldown}</strong>
                <small>{cooldownExpiryLabel(posterHealth.replacement.nextCooldownExpiryAt)}</small>
              </div>
              <div>
                <span>低清可重试</span>
                <strong>{posterHealth.replacement.retryEligible}</strong>
              </div>
              <div>
                <span>原图缓存</span>
                <strong>{posterHealth.cache.entries} 张</strong>
              </div>
              <div>
                <span>原图容量</span>
                <strong>
                  {Math.round(posterHealth.cache.bytes / 1024 / 1024)} / {Math.round(posterHealth.cache.maxBytes / 1024 / 1024)} MB
                </strong>
              </div>
              <div>
                <span>响应式缓存</span>
                <strong>{posterHealth.cache.variants.entries} 张</strong>
              </div>
              <div>
                <span>响应式容量</span>
                <strong>
                  {Math.round(posterHealth.cache.variants.bytes / 1024 / 1024)} / {Math.round(posterHealth.cache.variants.maxBytes / 1024 / 1024)} MB
                </strong>
              </div>
            </div>

            <div className="posterHealthStates" aria-label="图片状态分布">
              <span>已验证 {posterHealth.statuses.healthy}</span>
              <span>待验证 {posterHealth.statuses.unverified}</span>
              <span className={posterHealth.statuses.degraded > 0 ? "warning" : ""}>
                已降级 {posterHealth.statuses.degraded}
              </span>
              <span className={posterHealth.quality.undersized > 0 ? "warning" : ""}>
                低清 {posterHealth.quality.undersized}
              </span>
              <span>尺寸待检测 {posterHealth.quality.unknown}</span>
              <span>缺图未尝试 {posterHealth.lookup.notAttempted}</span>
              <span>低清未尝试 {posterHealth.replacement.notAttempted}</span>
              <span className={posterHealth.cache.corruptEntries + posterHealth.cache.variants.corruptEntries > 0 ? "error" : ""}>
                缓存损坏 {posterHealth.cache.corruptEntries + posterHealth.cache.variants.corruptEntries}
              </span>
              <span className={posterHealth.cache.orphanedFiles + posterHealth.cache.variants.orphanedFiles > 0 ? "warning" : ""}>
                孤立文件 {posterHealth.cache.orphanedFiles + posterHealth.cache.variants.orphanedFiles}
              </span>
            </div>

            {posterHealth.missingBySource.length > 0 ? (
              <section className="posterSourceBreakdown" aria-labelledby="missing-poster-sources-heading">
                <strong id="missing-poster-sources-heading">缺图来源分布</strong>
                <div>
                  {posterHealth.missingBySource.map((item) => (
                    <div className="posterSourceRow" key={item.source}>
                      <span>{sourceName(item.source)}</span>
                      <div className="posterSourceTrack" aria-hidden="true">
                        <i style={{ width: `${largestMissingSourceCount > 0 ? item.count / largestMissingSourceCount * 100 : 0}%` }} />
                      </div>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {posterHealth.samples.missing.length > 0 ? (
              <div className="posterHealthSamples">
                <strong>高优先级缺图</strong>
                <div>
                  {posterHealth.samples.missing.slice(0, 6).map((item) => (
                    <Link to={`/media/${item.id}`} key={item.id}>
                      <span>{item.title}</span>
                      <small>
                        优先级 {item.priorityScore} · {ATTENTION_CATEGORY_LABELS[item.attentionCategory]} · Heat {Math.round(item.heatScore)} · {item.sources.join(" / ") || "来源待确认"} · {posterLookupLabel(item)}
                      </small>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {posterHealth.samples.undersized.length > 0 ? (
              <div className="posterHealthSamples">
                <strong>高优先级低清图片</strong>
                <div>
                  {posterHealth.samples.undersized.slice(0, 6).map((item) => (
                    <Link to={`/media/${item.id}`} key={item.id}>
                      <span>{item.title}</span>
                      <small>
                        {item.width ?? "?"}×{item.height ?? "?"} · 优先级 {item.priorityScore} · {ATTENTION_CATEGORY_LABELS[item.attentionCategory]} · Heat {Math.round(item.heatScore)} · {item.sources.join(" / ") || "来源待确认"} · {posterLookupLabel(item)}
                      </small>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="emptyText">
            {posterHealthQuery.isLoading ? "正在统计图片状态..." : "图片健康状态暂不可用"}
          </p>
        )}
      </section>

      <section className="sourceRegistry" aria-labelledby="source-registry-heading">
        <div className="settingsSectionHeader sourceRegistryHeader">
          <div>
            <span className="settingsIndex">05 / SOURCES</span>
            <h2 id="source-registry-heading">数据源注册表</h2>
          </div>
          <strong>{settingsQuery.data.sources.length} 个来源</strong>
        </div>

        {SOURCE_GROUPS.map((group) => {
          const sources = settingsQuery.data.sources.filter((source) => source.group === group.id)
          if (sources.length === 0) return null

          return (
            <section className="sourceGroup" key={group.id} aria-labelledby={`source-group-${group.id}`}>
              <header className="sourceGroupHeader">
                <h3 id={`source-group-${group.id}`}>{group.label}</h3>
                <span>{sources.length}</span>
              </header>
              <div className="sourceTable">
                <table>
                  <thead>
                    <tr>
                      <th>来源</th>
                      <th>信号类型</th>
                      <th>覆盖与刷新</th>
                      <th>访问方式</th>
                      <th>接入状态</th>
                      <th>启用</th>
                      <th>网络策略</th>
                      <th>凭据</th>
                      <th>最近状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((source) => {
                      const canEnable = source.implementationStatus === "active" && source.supportsEnable
                      const canSync = source.runnable
                      const canPreview = source.implementationStatus === "active"
                        && source.supportsSync
                        && source.credentialsComplete
                      const testResult = sourceTestMutation.data?.sourceId === source.id
                        ? sourceTestMutation.data.result
                        : null
                      const isTesting = sourceTestMutation.isPending && sourceTestMutation.variables === source.id
                      const isSyncing = sourceSyncMutation.isPending && sourceSyncMutation.variables === source.id
                      const isPreviewing = sourcePreviewMutation.isPending
                        && sourcePreviewMutation.variables === source.id
                      const isUpdating = sourcePolicyMutation.isPending
                        && sourcePolicyMutation.variables?.sourceId === source.id

                      return (
                        <tr key={source.id}>
                          <td className="sourceIdentity">
                            <strong>{source.name}</strong>
                            <span>{source.description}</span>
                          </td>
                          <td>
                            <div className="semanticTags" aria-label={`${source.name} 信号类型`}>
                              {source.semantics.signalKinds.map((kind) => (
                                <span className="semanticTag" key={kind}>
                                  {SOURCE_SIGNAL_LABELS[kind]}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="sourceCadence">
                            <span>{source.semantics.coverage} · {source.semantics.cadence}</span>
                          </td>
                          <td>
                            <span className={`accessBadge ${source.semantics.access}`}>
                              {SOURCE_ACCESS_LABELS[source.semantics.access]}
                            </span>
                          </td>
                          <td>
                            <span className={`sourceStatus ${source.implementationStatus}`}>
                              {SOURCE_STATUS_LABELS[source.implementationStatus]}
                            </span>
                          </td>
                          <td>
                            <label className="sourceEnable">
                              <input
                                type="checkbox"
                                aria-label={`启用 ${source.name}`}
                                checked={source.enabled}
                                disabled={!canEnable || isUpdating}
                                onChange={(event) => updateSourcePolicy(
                                  source.id,
                                  sourceSettingKey(source.id, "ENABLED"),
                                  String(event.target.checked)
                                )}
                              />
                              <span aria-hidden="true" />
                            </label>
                          </td>
                          <td>
                            <div className="proxyModeControl" aria-label={`${source.name} 网络策略`}>
                              {(["inherit", "direct", "custom"] as ProxyMode[]).map((mode) => (
                                <button
                                  type="button"
                                  key={mode}
                                  className={source.proxyMode === mode ? "active" : ""}
                                  aria-label={`${source.name} ${PROXY_MODE_LABELS[mode]}`}
                                  aria-pressed={source.proxyMode === mode}
                                  disabled={isUpdating}
                                  onClick={() => updateSourcePolicy(
                                    source.id,
                                    sourceSettingKey(source.id, "PROXY_MODE"),
                                    mode
                                  )}
                                >
                                  {PROXY_MODE_LABELS[mode]}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span className={source.credentialsComplete ? "credentialReady" : "credentialMissing"}>
                              {source.credentialsComplete
                                ? "凭据就绪"
                                : `缺少 ${source.missingCredentials.join("、")}`}
                            </span>
                          </td>
                          <td className="sourceRuntimeState">
                            {testResult ? (
                              <>
                                <strong className={testResult.success ? "successText" : "errorText"}>
                                  {testResult.message}
                                </strong>
                                <span>{testResult.durationMs} ms</span>
                              </>
                            ) : source.localState ? (
                              <>
                                <strong className={`localStateLabel ${source.localState.status}`}>
                                  {SOURCE_LOCAL_STATE_LABELS[source.localState.status]}
                                </strong>
                                <span>{sourceLocalStateDetail(source.localState)}</span>
                              </>
                            ) : source.latestRun ? (
                              <>
                                <strong>{source.latestRun.status}</strong>
                                <span>{source.latestRun.itemCount} 条</span>
                              </>
                            ) : (
                              <span>暂无记录</span>
                            )}
                          </td>
                          <td>
                            <div className="sourceActions">
                              <button
                                type="button"
                                className="tableIconButton"
                                aria-label={`测试 ${source.name}`}
                                title={`测试 ${source.name}`}
                                disabled={isTesting || isSyncing || isPreviewing}
                                onClick={() => sourceTestMutation.mutate(source.id)}
                              >
                                <TestTube2 aria-hidden="true" size={17} />
                              </button>
                              <button
                                type="button"
                                className="tableIconButton"
                                aria-label={`预览 ${source.name}`}
                                title={`预览 ${source.name}，不写入数据库`}
                                disabled={!canPreview || sourcePreviewMutation.isPending || isSyncing || isTesting}
                                onClick={() => {
                                  setPreviewSource(source)
                                  sourcePreviewMutation.mutate(source.id)
                                }}
                              >
                                <ScanSearch aria-hidden="true" size={17} />
                              </button>
                              <button
                                type="button"
                                className="tableIconButton"
                                aria-label={`同步 ${source.name}`}
                                title={`同步 ${source.name}`}
                                disabled={!canSync || isSyncing || isTesting || isPreviewing}
                                onClick={() => sourceSyncMutation.mutate(source.id)}
                              >
                                <RefreshCw aria-hidden="true" size={17} />
                              </button>
                              <button
                                type="button"
                                className="tableIconButton"
                                aria-label={`配置 ${source.name}`}
                                title={`配置 ${source.name}`}
                                onClick={() => setSelectedSource(source)}
                              >
                                <SlidersHorizontal aria-hidden="true" size={17} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}

        {(sourcePolicyMutation.isError || sourceSyncMutation.isError || sourcePreviewMutation.isError) && (
          <p className="errorText sourceRegistryError">数据源操作失败</p>
        )}
      </section>

      {selectedSource && (
        <SourceConfigDialog
          source={selectedSource}
          open
          onClose={() => setSelectedSource(null)}
          onSave={saveSourceConfig}
        />
      )}

      {previewSource && sourcePreviewMutation.data && (
        <SourcePreviewDialog
          sourceName={previewSource.name}
          preview={sourcePreviewMutation.data}
          onClose={() => {
            setPreviewSource(null)
            sourcePreviewMutation.reset()
          }}
        />
      )}

    </main>
  )
}
