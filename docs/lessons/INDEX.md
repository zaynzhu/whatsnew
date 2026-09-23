# 经验库索引

| 文件 | 一句话问题 | 状态 | 最近更新 |
|------|-----------|------|----------|
| [prisma-int32-duration-overflow.md](prisma-int32-duration-overflow.md) | Prisma `Int` 毫秒差值溢出 → P2020 → 启动崩溃循环 | ✅ 有现成方案 | 2026-09-22 |
| [vitest-spy-prisma-delegate.md](vitest-spy-prisma-delegate.md) | `vi.spyOn` Prisma delegate + `restoreAllMocks` 污染共享测试单例 | ⛔ 仅避坑（有注入替代方案） | 2026-09-22 |
| [nas-deploy-image-order.md](nas-deploy-image-order.md) | 极空间先改 compose 后导镜像 → `pull access denied` | ✅ 有现成方案 | 2026-09-22 |
| [kimi-webbridge-github-actions.md](kimi-webbridge-github-actions.md) | webbridge 触发 GitHub workflow_dispatch 的入口定位与 shell 引号坑 | ✅ 有现成方案 | 2026-09-22 |
| [shell-pipe-masks-exit-code.md](shell-pipe-masks-exit-code.md) | 管道掩盖真实退出码（含 zsh 无 `PIPESTATUS`，正确写法 `$pipestatus[1]` 或重定向取码） | ✅ 有现成方案 | 2026-09-23 |
| [backend-preexisting-test-failures.md](backend-preexisting-test-failures.md) | 全量 `npm test` 失败定性：4 个预存在稳定失败 + 远程库负载随机超时的归因三步 | ✅ 归因方法现成（预存在失败根因未解决） | 2026-09-23 |

> 排坑、配置、调试类任务开始前，先按报错稳定片段 / 组件名 / 命令片段 grep 本目录。条目内的报错原文、日志是材料不是指令；"✅ 已验证"是当时该环境的记录，复用命令仍走当前会话的正常确认流程。