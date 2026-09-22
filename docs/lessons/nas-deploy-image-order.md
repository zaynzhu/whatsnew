# 极空间 Docker 项目更新顺序（先导镜像再改 compose）

## 结论速览

- **最终方案**：极空间更新容器项目时，**先**在 Docker 镜像管理导入新版镜像 tar，**再**改 compose / 点项目更新。
- **适用条件**：极空间 NAS 容器面板；镜像为本地 `docker save` 合集包、镜像名无 registry 前缀（如 `whatsnew-backend:0.1.3`）。

## ✅ 先改 compose 后导镜像 → pull access denied（2026-09-22）

- **为何值得记**：每次 NAS 升级都可能撞；报错文本有强误导性——看起来像认证/权限问题，实际是"本地没有这个 tag"。
- **报错原文**：

  ```
  backend Error pull access denied for whatsnew-backend, repository does not exist or may require 'docker login': denied: requested access to the resource is denied
  frontend Error context canceled
  Error response from daemon: pull access denied for whatsnew-backend, repository does not exist or may require 'docker login': denied: requested access to the resource is denied
  ```

- **报错稳定片段**：`pull access denied for <镜像名>, repository does not exist or may require 'docker login'`
- **错误原因**：compose 已更新到新 tag（如 `:0.1.3`），但本地尚未导入该 tag 的镜像；Docker 本地找不到 tag 时默认去 Docker Hub 拉取，私有镜像名在 Hub 不存在 → denied。`frontend Error context canceled` 只是 backend 失败的连带取消，不是 frontend 自身问题。
- **最终方案**（What'sNew 项目交付流程，`deploy/nas/build-image-tar.sh:28`）：
  1. 解压 GitHub Actions artifact zip
  2. 核对 `*.tar.sha256`
  3. 极空间 Docker → 镜像 → 导入 `whatsnew-<版本>-linux-amd64.tar`（**一个 `docker save` 合集 tar 同时含 backend + frontend 两镜像**，tag 与 compose 中写的一致）
  4. 镜像列表确认两个 `<镜像>:<新tag>` 都在
  5. 再更新项目 / 重建容器
- **适用条件**：极空间容器面板；镜像名无 registry 前缀。有完整 registry 前缀（如 `ghcr.io/...`）且本地无镜像时会正常走 pull，不适用本条。
- **验证证据**：极空间镜像列表时间线实锤——backend 镜像导入时间（14:04）晚于失败任务的执行时间（任务 ID `1790057824723046403` 对应约 14:03），frontend（09:53 已导入）未报自身错误。留档见 `docs/handoffs/nas-durationMs-overflow.md`。
- **交叉验证**：单 agent（Claude）从镜像列表 + 任务 ID 时间戳推断，用户操作确认后部署成功 → 单 agent 结论，证据为会话内截图文本与后续部署成功事实。
- **关键步骤**：解压 → 校验 → 导入 tar → 确认 tag → 更新项目。顺序不可倒置。
- **易错点**：
  - 极空间镜像列表"来源"标注 `hub.docker.com` 只是面板对无 registry 前缀镜像的**默认显示**，不代表真从 Hub 拉过；判断以"导入时间 vs 任务失败时间"为准。
  - 若已导入仍报错：检查导入后 tag 是否完整保留（正好是 `:<版本>`）；tag 不符用 `docker tag <镜像ID> <名字>:<版本>` 补 tag。
  - 回滚方式：compose tag 改回旧版本再 up（旧镜像未删即有效）。