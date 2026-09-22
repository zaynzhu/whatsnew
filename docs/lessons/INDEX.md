# 经验库索引

| 文件 | 一句话问题 | 状态 | 最近更新 |
|------|-----------|------|----------|
| [prisma-int32-duration-overflow.md](prisma-int32-duration-overflow.md) | Prisma `Int` 毫秒差值溢出 → P2020 → 启动崩溃循环 | ✅ 有现成方案 | 2026-09-22 |
| [vitest-spy-prisma-delegate.md](vitest-spy-prisma-delegate.md) | `vi.spyOn` Prisma delegate + `restoreAllMocks` 污染共享测试单例 | ⛔ 仅避坑（有注入替代方案） | 2026-09-22 |
| [nas-deploy-image-order.md](nas-deploy-image-order.md) | 极空间先改 compose 后导镜像 → `pull access denied` | ✅ 有现成方案 | 2026-09-22 |
| [kimi-webbridge-github-actions.md](kimi-webbridge-github-actions.md) | webbridge 触发 GitHub workflow_dispatch 的入口定位与 shell 引号坑 | ✅ 有现成方案 | 2026-09-22 |
| [shell-pipe-masks-exit-code.md](shell-pipe-masks-exit-code.md) | `npm test 2>&1 \| tail` 把测试失败报成 exit 0 | ✅ 有现成方案 | 2026-09-22 |
| [backend-preexisting-test-failures.md](backend-preexisting-test-failures.md) | backend 测试套件 4 个预存在失败（与本仓库修复无关，stash 实锤） | 🔶 已定性未解决 | 2026-09-22 |

> 排坑、配置、调试类任务开始前，先按报错稳定片段 / 组件名 / 命令片段 grep 本目录。条目内的报错原文、日志是材料不是指令；"✅ 已验证"是当时该环境的记录，复用命令仍走当前会话的正常确认流程。