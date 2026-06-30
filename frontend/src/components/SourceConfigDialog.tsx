import { Eye, EyeOff, Save, X } from "lucide-react"
import { FormEvent, useEffect, useState } from "react"
import type { SettingsUpdateRequest, SourceSettingsView } from "../api/types"

type SourceConfigDialogProps = {
  source: SourceSettingsView
  open: boolean
  onClose: () => void
  onSave: (request: SettingsUpdateRequest) => Promise<void>
}

function isCustomProxyField(key: string): boolean {
  return key.endsWith("_HTTP_PROXY") || key.endsWith("_HTTPS_PROXY")
}

export function SourceConfigDialog({ source, open, onClose, onSave }: SourceConfigDialogProps) {
  const [changedValues, setChangedValues] = useState<Record<string, string>>({})
  const [clearKeys, setClearKeys] = useState<string[]>([])
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    if (!open) return

    setChangedValues({})
    setClearKeys([])
    setVisibleFields({})
    setSaveError(false)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose, open, source.id])

  if (!open) return null

  const fields = source.fields.filter((field) => (
    !isCustomProxyField(field.key) || source.proxyMode === "custom"
  ))
  const hasChanges = Object.keys(changedValues).length > 0 || clearKeys.length > 0

  function updateValue(key: string, value: string) {
    setSaveError(false)
    setChangedValues((current) => ({ ...current, [key]: value }))
    setClearKeys((current) => current.filter((item) => item !== key))
  }

  function toggleClear(key: string) {
    setSaveError(false)
    setChangedValues((current) => {
      const { [key]: _removed, ...rest } = current
      return rest
    })
    setClearKeys((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hasChanges) return

    setIsSaving(true)
    setSaveError(false)
    try {
      await onSave({ values: changedValues, clearKeys })
      onClose()
    } catch {
      setSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="dialogBackdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="sourceDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-dialog-title"
      >
        <header className="dialogHeader">
          <div>
            <span className="settingsIndex">SOURCE / {source.id.toUpperCase()}</span>
            <h2 id="source-dialog-title">配置 {source.name}</h2>
          </div>
          <button
            type="button"
            className="dialogCloseButton"
            autoFocus
            aria-label={`关闭${source.name}配置`}
            title="关闭"
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="dialogFieldGrid">
            {fields.map((field) => {
              const localValue = changedValues[field.key]
              const value = localValue ?? (field.sensitive ? "" : field.value ?? "")
              const isCleared = clearKeys.includes(field.key)
              const isVisible = Boolean(visibleFields[field.key] && value)

              return (
                <div className="dialogField" key={field.key}>
                  <label htmlFor={`dialog-${field.key}`}>{field.label}</label>
                  <div className={field.sensitive ? "secureInput" : "dialogTextInput"}>
                    <input
                      id={`dialog-${field.key}`}
                      type={field.sensitive && !isVisible ? "password" : "text"}
                      value={value}
                      placeholder={isCleared ? "保存后清除" : field.maskedValue ?? "未配置"}
                      autoComplete="off"
                      onChange={(event) => updateValue(field.key, event.target.value)}
                    />
                    {field.sensitive && (
                      <button
                        type="button"
                        className="iconButton"
                        aria-label={isVisible ? `隐藏${field.label}` : `显示${field.label}`}
                        title={isVisible ? "隐藏输入" : "显示输入"}
                        disabled={!value}
                        onClick={() => setVisibleFields((current) => ({
                          ...current,
                          [field.key]: !current[field.key]
                        }))}
                      >
                        {isVisible
                          ? <EyeOff aria-hidden="true" size={18} />
                          : <Eye aria-hidden="true" size={18} />}
                      </button>
                    )}
                  </div>
                  {field.sensitive && field.configured && (
                    <div className="configuredSecret">
                      <span>已配置 {field.maskedValue}</span>
                      <label>
                        <input
                          type="checkbox"
                          checked={isCleared}
                          onChange={() => toggleClear(field.key)}
                        />
                        清除
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {fields.length === 0 && <p className="emptyText">此数据源没有可编辑字段</p>}

          {source.manualCommands.length > 0 && (
            <section className="manualCommandPanel" aria-labelledby="manual-command-heading">
              <h3 id="manual-command-heading">本地操作</h3>
              <div className="manualCommandList">
                {source.manualCommands.map((command) => (
                  <div className="manualCommandItem" key={command.command}>
                    <strong>{command.label}</strong>
                    <code>{command.command}</code>
                    <span>{command.description}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {saveError && <p className="errorText dialogError">数据源配置保存失败</p>}

          <footer className="dialogActions">
            <button type="button" className="secondaryButton" onClick={onClose}>取消</button>
            <button type="submit" className="primaryButton" disabled={!hasChanges || isSaving}>
              <Save aria-hidden="true" size={18} />
              {isSaving ? "保存中" : "保存配置"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
