import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Eye, EyeOff, PlugZap, Save, Settings, XCircle } from "lucide-react"
import { useState } from "react"
import { apiGet, apiRequest } from "../api/client"
import type {
  ConnectionTestResult,
  ProxyTestResponse,
  SettingsResponse,
  SettingsUpdateRequest,
  SettingsUpdateResponse
} from "../api/types"

const MODE_LABELS: Record<ConnectionTestResult["mode"], string> = {
  direct: "直连",
  http_proxy: "HTTP 代理",
  https_proxy: "HTTPS 代理",
  source: "数据源"
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [changedValues, setChangedValues] = useState<Record<string, string>>({})
  const [clearKeys, setClearKeys] = useState<string[]>([])
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle")

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

    </main>
  )
}
