# 本地 dev 后端连主库的安全配置

## 结论速览

- **最终方案**：本地起 `npm run dev:backend` 连主库（连调/抽查）前，先查 `GET /api/settings` 的 `scheduler.enabled`；为 true 时必须杀掉实例用 `SCHEDULER_ENABLED=false npm run dev:backend` 进程级注入重启，**不改任何持久配置文件**。
- **适用条件**：本机 dev 实例连接 NAS 主库（同一 `DATABASE_URL`）且 NAS 正式实例在跑调度；2026-09-23 验证。

## ✅ 本地 dev 实例默认开调度，会与 NAS 正式实例双跑同步（2026-09-23）

- **为何值得记**：起本地连调实例时几乎一定会忘——`backend/.env`（主库配置）里 `SCHEDULER_ENABLED=true`，dev 实例照读即启用每小时调度；若不处理，本地实例与 NAS 正式后端会**双跑同一主库的来源同步**（数据冲突风险）。`deploy/nas/README.md` 的双调度警告是正式部署语境，容易漏掉本地 dev 场景。
- **报错/现象原文**：起服务后实测（`curl -s http://127.0.0.1:19993/api/settings`）：

  ```json
  {
    "enabled": true,
    "forcedDisabled": false,
    "hourlyIntervalHours": 1,
    "nextHourlyRunAt": "2026-09-23T14:00:00.000Z"
  }
  ```

- **错误原因**：dev 实例读同一个 `backend/.env`，调度开关是**环境级配置**而非按实例隔离；`config/db.ts` 先加载 env 再建 PrismaClient 的设计保证了数据库与设置指向主库，也意味着调度配置同样指向主库语义。
- **最终方案**（连调实例安全启动序列）：

  ```bash
  # 1. 杀掉默认实例（如已起）
  pkill -f "tsx watch src/server.ts"

  # 2. 进程级注入重启——只影响本次进程，不动 backend/.env
  SCHEDULER_ENABLED=false npm run dev:backend > /tmp/dev-backend.log 2>&1 &

  # 3. 就绪后确认调度确实关闭
  curl -s http://127.0.0.1:19993/api/settings | python3 -c "import json,sys; print('scheduler:', json.load(sys.stdin).get('scheduler', {}).get('enabled'))"
  # 预期输出: scheduler: False
  ```

- **为什么这样做**：通过 `PUT /api/settings` 关调度会**写进 `backend/.env` 持久化**，影响面超出本次连调；进程级 env 注入只覆盖本次实例，`runtimeSettingsService` 的运行时值优先于 env 文件，且 NAS 侧配置完全不受影响。
- **适用条件**：本地 dev 实例连主库；若连的是沙盒库（`SETTINGS_ENV_PATH=.env.china-sandbox`）则沙盒本就强制 `SCHEDULER_ENABLED=false`，无需此操作。
- **验证证据**：2026-09-23 起连调实例后 `scheduler.enabled` 实测 `true` → 注入重启后实测 `False`；连调完成后实例已停（用户确认）。
- **关键步骤**：查状态 → 杀实例 → 注入重启 → 复查 `scheduler: False`（四步缺一不可，尤其复查）。
- **易错点**：
  - 用 PUT /api/settings 关调度 = 写持久配置，会影响仓库内 `backend/.env`，不要用。
  - 连调结束实例要停（用户确认），防止它一直占着主库连接。
  - 若实例连的库与 NAS 正式实例不同（独立测试库），无双跑风险，此条不适用。
- **交叉验证**：单 agent 单次，证据为 `/api/settings` 前后两次真实返回。
- **相关文件**：`deploy/nas/README.md`（正式环境双调度警告）、`backend/src/config/db.ts`（env 加载顺序）。