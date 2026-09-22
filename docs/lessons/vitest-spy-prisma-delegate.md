# vitest spy Prisma delegate 污染共享单例

## 结论速览

- **最终方案**：模拟 Prisma 查询失败时，**不要**对共享 `testPrisma` 单例做 `vi.spyOn(prisma.model, "method")`——注入一个只含所需方法的假 client。
- **适用条件**：vitest 2.0.5 + Prisma 5.22.0 + 模块级共享 `testPrisma` 单例 + vitest `singleFork` 配置。

## ⛔ vi.spyOn Prisma delegate + restoreAllMocks 恢复失败，污染共享单例（2026-09-22）

- **报错原文**：

  ```
  TypeError: recoverInterruptedSourceRunsForStartup is not a function   ← 第一轮：函数未实现时的正常 RED
  [DIAG] Failed to recover interrupted source sync runs; continuing startup: prisma.sourceSyncRun.findMany is not a function   ← 定位实锤
  ```

- **报错稳定片段**：`is not a function`（变量部分：`prisma.<模型>.<方法>`，如 `prisma.sourceSyncRun.findMany`）
- **错误原因**：对 `prisma.sourceSyncRun.findMany`（PrismaClient model delegate 方法）做 `vi.spyOn(...).mockRejectedValueOnce(...)` 后，`afterEach` 中的 `vi.restoreAllMocks()` **未能恢复原实现**，把共享单例上的 `findMany` 留成了非函数状态；同一文件中后续测试（甚至单跑目标测试）全部撞 `findMany is not a function`。
- **为何不可再采用**：`testPrisma` 是模块级共享单例，同文件测试顺序执行（`singleFork`）；任何挂在它上面的 spy 一旦 restore 异常即泄漏到后续所有测试，且症状（报错点远离肇事测试）极难直接归因。
- **替代方案**：✅ 依赖注入假 client，完全不碰共享单例：

  ```typescript
  // 用注入的故障 client 模拟数据库不可用，不 spy 共享单例避免 restore 后污染后续测试
  const brokenPrisma = {
    sourceSyncRun: {
      findMany: () => Promise.reject(new Error("simulated database failure"))
    }
  } as unknown as PrismaClient

  const result = await recoverInterruptedSourceRunsForStartup(brokenPrisma)
  expect(result).toBeNull()
  ```

- **判定时效**：基于 vitest 2.0.5 + Prisma 5.22.0 + 2026-09-22 验证；vitest 大版本升级后值得重验 spy/restore 行为是否仍如此。
- **易错点**：
  - 失败测试单跑能过、连跑挂 → 典型的 mock 泄漏信号，先怀疑 spy 的共享对象，而不是被测代码。
  - `console.warn` 等普通对象方法 spy + restore 正常，问题特定于 Prisma delegate 这类原型链派发方法。
  - 调试手段：给 warn spy 临时换成透传实现（`process.stderr.write(...)`），让被吞掉的 catch 错误原文现形——当轮就用这招实锤的。