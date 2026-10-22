# WhatShot 外部热度"全是失败"定位三步法（客户端超时 ≠ 服务挂了）

## 结论速览

- **最终方案**：WhatShot 外部热度显示"服务不可达/全是失败"时，先按三步定位再动手修：①读 WhatShot 本地 SQLite 的 `external_heat_state`（客户端侧真实错误与最后成功时间）②实测 WhatsNew 同款端点的真实延迟 ③把 WhatShot `sync_runs` 时间线与 NAS 整点批次窗口（每小时 :00–:23）对齐。本案根因是 WhatShot 客户端 20 秒超时 < 慢库批次窗口内 24.5 秒的接口响应；NAS 侧治本后 WhatShot 无需改任何代码。
- **适用条件**：WhatShot 接入了自有 WhatsNew 服务（定案八/十），WhatsNew 部署在 NAS；WhatShot 为纯本地 app，同步状态全在本地 SQLite。2026-10-22 验证。

## ✅ "unreachable"其实是超时（2026-10-22 定位实录）

- **为何值得记**：用户观感是"NAS 接口不返回数据"，实测接口一直 200 且有数据（126KB）——不读客户端本地状态就会被"全是失败"带偏去查网络层；三步法把定位收敛到 15 分钟内。
- **现象原文**（WhatShot 侧稳定片段，可 grep）：

  ```
  sync_runs.error: 外部热度拉取失败（unreachable），下轮自动重试；不影响追剧与原同步
  external_heat_state: last_status=unreachable, last_error=The request timed out.
  ```

  客户端超时定义：`WhatsNewClient.swift:101/120` 的 `URLRequest(url: url, timeoutInterval: 20)`。
- **定位三步（可复制）**：

  ```bash
  # 1. 客户端侧真实错误与最后成功时间（last_success_at 为 Unix 秒，+8 换算北京时间）
  sqlite3 -readonly "$HOME/Library/Application Support/WhatShot/whatshot.sqlite3" \
    "SELECT last_status, last_error, datetime(last_success_at,'unixepoch','+8 hours') FROM external_heat_state;"

  # 2. 服务端同款端点实测（WhatShot 走 50016 后端直连）
  curl -sS -m 60 http://<NAS>:50016/api/trending -o /dev/null -w 'HTTP %{http_code}, %{time_total}s\n'

  # 3. 时间窗对齐：WhatShot 每 6h 同步一次且周期会漂移（实际 ~6h9m），失败轮次的 started_at 是否落在批次窗口内
  sqlite3 -readonly "$HOME/Library/Application Support/WhatShot/whatshot.sqlite3" \
    "SELECT id, status, datetime(started_at,'unixepoch','+8 hours'), error FROM sync_runs ORDER BY rowid DESC LIMIT 8;"
  ```

- **错误原因**：慢库批次窗口内 trending 响应 24.5s（窗口外热状态 2.4s），WhatShot 20s 超时必挂；2026-10-20 起同步周期漂移恰好撞进批次窗口（01:00:15、13:08 两轮失败），窗口外的轮次一直成功——**失败"时好时坏"是时间窗相关性的指纹**。
- **最终方案**：NAS 侧治本（0.1.5 部署 + buffer pool 1G / redo 512M，见 [nas-power-outage-cold-db-failures.md](nas-power-outage-cold-db-failures.md)）→ 窗口内实测 0.79s，对 20s 超时 25 倍余量，**WhatShot 无需任何改动**（连"放宽超时到 60s"的可选项都不必做）。
- **验证证据**：调优后 trending 窗口外 0.77s、窗口内（探针时刻确认批次正在写入）0.79s；WhatShot `external_heat` 最后成功 10-19 19:00 → 10-20 01:00 起超时 → NAS 治本后通道恢复。
- **易错点**：
  - "全是失败"≠连不上；`unreachable` 可能只是 URLSession 超时被归类后的文案，真实错误必须读 `external_heat_state.last_error`，别信 UI 概括。
  - WhatShot 无后端无 NAS——客户端侧证据只在 `~/Library/Application Support/WhatShot/`，不去服务端找。
  - 失败"时好时坏"时先做时间窗对齐再下结论，别直接判网络问题。
  - 长期不重启的客户端 app 可能卡在错误态，重启 app 是最廉价的鉴别动作。
- **交叉验证**：WhatShot `sync_runs` 147–154 时间线与 NAS `SourceSyncRun` 批次窗口交叉对齐；调优效果经 whatsnew 与 melon-hub 双会话双源互验（命中率 99.1%，磁盘读数两侧同值）。