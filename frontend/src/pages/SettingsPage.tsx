import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  Eye,
  EyeOff,
  PlugZap,
  RefreshCw,
  Save,
  Settings,
  SlidersHorizontal,
  TestTube2,
  XCircle
} from "lucide-react"
import { useState } from "react"
import { apiGet, apiRequest } from "../api/client"
import type {
  ConnectionTestResult,
  ProxyMode,
  ProxyTestResponse,
  SettingsResponse,
  SettingsUpdateRequest,
  SettingsUpdateResponse,
  SourceSettingsView
} from "../api/types"
import { SourceConfigDialog } from "../components/SourceConfigDialog"

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
  const [selectedSource, setSelectedSource] = useState<SourceSettingsView | null>(null)

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsResponse>("/api/settings")
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

      <section className="sourceRegistry" aria-labelledby="source-registry-heading">
        <div className="settingsSectionHeader sourceRegistryHeader">
          <div>
            <span className="settingsIndex">02 / SOURCES</span>
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
                      const testResult = sourceTestMutation.data?.sourceId === source.id
                        ? sourceTestMutation.data.result
                        : null
                      const isTesting = sourceTestMutation.isPending && sourceTestMutation.variables === source.id
                      const isSyncing = sourceSyncMutation.isPending && sourceSyncMutation.variables === source.id
                      const isUpdating = sourcePolicyMutation.isPending
                        && sourcePolicyMutation.variables?.sourceId === source.id

                      return (
                        <tr key={source.id}>
                          <td className="sourceIdentity">
                            <strong>{source.name}</strong>
                            <span>{source.description}</span>
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
                                disabled={isTesting || isSyncing}
                                onClick={() => sourceTestMutation.mutate(source.id)}
                              >
                                <TestTube2 aria-hidden="true" size={17} />
                              </button>
                              <button
                                type="button"
                                className="tableIconButton"
                                aria-label={`同步 ${source.name}`}
                                title={`同步 ${source.name}`}
                                disabled={!canSync || isSyncing || isTesting}
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

        {(sourcePolicyMutation.isError || sourceSyncMutation.isError) && (
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

    </main>
  )
}
