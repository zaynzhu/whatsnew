import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, RotateCcw } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { apiGet, apiRequest } from "../api/client"
import type { SourceRunLogsResponse } from "../api/types"
import { StatusBadge } from "../components/StatusBadge"

const REFRESH_INTERVAL_MS = 5000

function runTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value))
}

function runDuration(durationMs: number | null): string {
  if (durationMs == null) return "运行中"
  if (durationMs < 1000) return `${durationMs} ms`
  const seconds = Math.round(durationMs / 1000)
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

export function SourceRunsPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("all")
  const [source, setSource] = useState("all")
  const params = new URLSearchParams({ limit: "100" })
  if (status !== "all") params.set("status", status)
  if (source !== "all") params.set("source", source)

  const logsQuery = useQuery({
    queryKey: ["source-runs", status, source],
    queryFn: () => apiGet<SourceRunLogsResponse>(`/api/source-runs?${params}`),
    refetchInterval: REFRESH_INTERVAL_MS
  })
  const retryMutation = useMutation({
    mutationFn: (sourceId: string) => apiRequest(`/api/sources/${sourceId}/sync`, "POST", {}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["source-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["source-health"] }),
        queryClient.invalidateQueries({ queryKey: ["sources"] })
      ])
    }
  })
  return (
    <main className="page">
      <section className="pageHeader simple" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">持久化运行记录</p>
          <h1 id="page-title">来源同步日志</h1>
          <p className="summary">
            查看最近 100 次同步结果、耗时和脱敏错误。记录保存在数据库中，不依赖 Docker 控制台日志。
          </p>
        </div>
        <div className="pageHeaderActions">
          <Link className="secondaryButton" to="/sources">返回数据源</Link>
          <button
            className="primaryButton"
            disabled={logsQuery.isFetching}
            onClick={() => logsQuery.refetch()}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={logsQuery.isFetching ? "spin" : ""} size={17} />
            刷新
          </button>
        </div>
      </section>

      <section className="runLogToolbar" aria-label="日志筛选">
        <label>
          <span>状态</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">全部状态</option>
            <option value="failed">仅失败</option>
            <option value="warning">仅警告</option>
            <option value="running">同步中</option>
            <option value="success">成功</option>
          </select>
        </label>
        <label>
          <span>来源</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">全部来源</option>
            {(logsQuery.data?.sources ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <span className="runLogUpdated">
          {logsQuery.data ? `更新于 ${runTime(logsQuery.data.generatedAt)}` : "正在读取运行记录"}
        </span>
      </section>

      {logsQuery.isError ? (
        <p className="runLogNotice errorText">运行日志加载失败，请确认后端和数据库可用。</p>
      ) : null}
      {retryMutation.isError ? (
        <p className="runLogNotice errorText">来源重试失败，请刷新日志查看已记录的具体错误。</p>
      ) : null}

      <section className="runLogList" aria-label="来源同步运行日志">
        {(logsQuery.data?.items ?? []).map((run) => {
          const isRetrying = retryMutation.isPending && retryMutation.variables === run.sourceId
          return (
            <article className={`runLogRow runLog-${run.status}`} key={run.id}>
              <div className="runLogIdentity">
                <StatusBadge>{run.status}</StatusBadge>
                <div>
                  <strong>{run.sourceName}</strong>
                  <span>{run.sourceId} · {run.scope}</span>
                </div>
              </div>
              <dl className="runLogMetrics">
                <div>
                  <dt>开始时间</dt>
                  <dd>{runTime(run.startedAt)}</dd>
                </div>
                <div>
                  <dt>耗时</dt>
                  <dd>{runDuration(run.durationMs)}</dd>
                </div>
                <div>
                  <dt>条目</dt>
                  <dd>{run.itemCount}</dd>
                </div>
              </dl>
              <div className="runLogResult">
                <p>{run.errorMessage ?? "同步完成，未记录错误。"}</p>
                {run.status === "failed" && run.retryable ? (
                  <button
                    className="secondaryButton"
                    disabled={retryMutation.isPending}
                    onClick={() => retryMutation.mutate(run.sourceId)}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" className={isRetrying ? "spin" : ""} size={16} />
                    {isRetrying ? "重试中" : "重试来源"}
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
        {!logsQuery.isLoading && logsQuery.data?.items.length === 0 ? (
          <p className="emptyText">当前筛选条件下没有运行记录。</p>
        ) : null}
      </section>
    </main>
  )
}
