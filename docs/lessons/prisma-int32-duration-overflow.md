# Prisma Int 毫秒字段溢出 → P2020 → 启动崩溃循环

## 结论速览

- **最终方案**：`Int` 类型毫秒差值字段写入前统一钳制（非负 + 上限 `2147483647`），启动期恢复逻辑包 try/catch 兜底。实现在 `backend/src/services/sourceSyncService.ts` 的 `clampDurationMs()` 与 `recoverInterruptedSourceRunsForStartup()`（提交 `e7deeeb`）。
- **适用条件**：Prisma + MySQL（strict mode）+ `Int` 毫秒字段；容器 `restart: unless-stopped` 的 NAS/服务器部署；启动时执行数据恢复逻辑的进程。

## ✅ Int 毫秒差值溢出导致 P2020 与启动死循环（2026-09-17 诊断，2026-09-22 生产验收）

- **为何值得记**：生产每天刷屏报错，根因藏在"启动恢复"这条冷门代码路径；跨 3 天、2 个 agent（Claude 诊断+实施、codex 交接核对）才收敛，重探索成本高。
- **最终方案**（修复代码，`backend/src/services/sourceSyncService.ts`）：

```typescript
const MAX_DURATION_MS = 2147483647

// 耗时按 Int32 上限钳制并保持非负：超长中断记录截断、时间回拨归零，保留真实起止时间
function clampDurationMs(startedAt: Date, finishedAt: Date): number {
  const elapsedMs = finishedAt.getTime() - startedAt.getTime()
  return Math.min(MAX_DURATION_MS, Math.max(0, elapsedMs))
}

// 启动时的中断恢复兜底：失败只记录脱敏错误并返回 null，不阻塞服务启动
export async function recoverInterruptedSourceRunsForStartup(prisma: PrismaClient, now = new Date()): Promise<number | null> {
  try {
    const recoveredRuns = await recoverInterruptedSourceRuns(prisma, now)
    if (recoveredRuns > 0) {
      console.warn(`Recovered ${recoveredRuns} interrupted source sync run(s)`)
    }
    return recoveredRuns
  } catch (error) {
    console.warn(`Failed to recover interrupted source sync runs; continuing startup: ${errorMessageFrom(error)}`)
    return null
  }
}
```

  三处 `durationMs` 写入（成功结束、失败结束、启动恢复）统一走 `clampDurationMs`。
- **为什么这样做**：
  1. Prisma `Int` 映射 MySQL 有符号 32 位整数，上限 `2147483647` 毫秒 ≈ 24.855 天。任何"结束时间 − 开始时间"的毫秒差超过它即溢出。
  2. `prisma.$transaction([...])` 全有全无：一条溢出行使整批恢复回滚，僵尸 `running` 行永远留在库里，下次启动再撞。
  3. 顶层 `await recoverInterruptedSourceRuns(db)` 无 try/catch，抛错使启动退出；`restart: unless-stopped` 反复拉起 → 无限崩溃循环。
- **适用条件**：MySQL strict mode（5.7+/8.0 默认）；若字段为 `BigInt` 或 SQLite 则不触发；无启动恢复逻辑的进程只受第 1 条影响。
- **验证证据**：
  - 本地测试库构造 35 天前 `running` 行调用恢复函数，真实报错（与生产完全一致）：

    ```
    PrismaClientKnownRequestError:
    Invalid `prisma.sourceSyncRun.update()` invocation in .../sourceSyncService.ts:602
    Value out of range for the type. Out of range value for column 'durationMs' at row 1
    ```

  - 生产部署后 backend 启动日志：`Recovered 17 interrupted source sync run(s)`，17 条历史僵尸记录（含超限行）一次收尾，无 P2020；`/api/health` 双入口返回 `{"ok":true,"service":"whatsnew-backend"}`。
  - 证据入口：`docs/handoffs/nas-durationMs-overflow.md`（诊断、交接、实施、验收全程留档）。
- **交叉验证**：2 agent（Claude TDD 实施 + codex 静态核对）+ 本地复现 + 生产验收 → 精粹；证据入口见上。
- **关键步骤**：① `grep -rn "sourceSyncRun.update"` 定位全部写入点 → ② 核对 schema 字段类型（`Int?`）→ ③ `git log -S "字段名"` 考古引入时间 → ④ 本地测试库构造超长行复现（先 RED）→ ⑤ 钳制 helper + 三处替换 + 启动兜底（TDD）→ ⑥ CI 构建镜像包部署验证。
- **易错点**：
  - 只改恢复路径一处不够——成功/失败路径共用同一减法表达式，三处必须统一（`replace_all` 一次改两处 + 恢复路径单独一处）。
  - 不必为此类指标字段改 `BigInt`：迁移 + 前后端类型联动成本高，钳制保留真实起止时间已足够。
  - 事务批量恢复中一条坏行拖垮全部——修钳制即同时修复"其余正常行也收尾失败"的连带问题。
  - 相关坑：vitest spy Prisma delegate 的污染问题见 [vitest-spy-prisma-delegate.md](vitest-spy-prisma-delegate.md)。