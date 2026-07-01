<div align="center">

# 🎬 WhatsNew

新片新剧监控情报台，追踪全球与中国影视内容的上新、播出、上架和热度变化

[![GitHub Stars](https://img.shields.io/github/stars/zaynzhu/whatsnew?style=flat-square)](https://github.com/zaynzhu/whatsnew/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/zaynzhu/whatsnew?style=flat-square)](https://github.com/zaynzhu/whatsnew/commits)
[![Open Issues](https://img.shields.io/github/issues/zaynzhu/whatsnew?style=flat-square)](https://github.com/zaynzhu/whatsnew/issues)
[![Forks](https://img.shields.io/github/forks/zaynzhu/whatsnew?style=flat-square)](https://github.com/zaynzhu/whatsnew/forks)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/zaynzhu/whatsnew/compare)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square)](https://www.typescriptlang.org)

[中文](README.md) | [English](README_EN.md)

</div>

> [!TIP]
> WhatsNew 聚合 TVmaze、TMDb、Trakt、TheTVDB、Netflix、优酷、爱奇艺等多来源信号，按 `作品 + 来源 + 平台 + 地区 + 窗口` 保留独立口径的热度历史，适合部署在家庭局域网或 NAS 私有网络中自用。

---

## ✨ Features

- **分类型展示** —— 电影、剧集、动漫、综艺、短剧、纪录片分类浏览
- **今日上线 / 本周新片新剧** —— 聚合各来源的上新与播出信息
- **热度变化追踪** —— 展示热度上升、新进、下降，保留 90 天排名时间线
- **数据源状态** —— 实时查看各来源同步状态与连通性
- **多源独立口径** —— 不把不同平台混成一个“真实综合榜”，每条信号独立保存
- **全局与单源代理** —— 支持全局 `HTTP_PROXY` / `HTTPS_PROXY`，单源可 `inherit` / `direct` / `custom`
- **设置热更新** —— 设置保存后即时生效，无需重启服务，敏感值掩码处理
- **定时 + 手动同步** —— 定时任务自动拉取，也支持各来源独立手动同步

## 🧱 Tech Stack

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + TypeScript + TanStack Query + Zustand + React Router |
| 后端 | Express 5 + TypeScript + Prisma + MySQL + node-cron + undici |
| 校验 | Zod（运行时校验） |
| 测试 | Vitest + Supertest + Testing Library |
| 构建 | npm workspaces monorepo |

## 📁 项目结构

```
whatsnew/
├── backend/      # Express + Prisma + MySQL，数据源适配与同步调度
├── frontend/     # React + Vite 前端，端口 19992
├── shared/      # 前后端共享类型
└── docs/        # 架构、接入、运维、交接与设计归档
```

## 📚 文档入口

| 文档 | 内容 |
|------|------|
| [Architecture](docs/architecture.md) | 数据模型、同步流、来源状态聚合和 API 路由 |
| [Integration Guide](docs/integration-guide.md) | 私有 JSON API、curl 示例和错误语义 |
| [Operator Runbook](docs/operator-runbook.md) | 环境变量、运行命令、定时任务和排障 |
| [Handoff](docs/handoff.md) | 当前分支、已接入来源、约束和交接清单 |

## 🚀 Quick Start

```bash
npm install
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 NAS MySQL 的真实用户名和密码
npm run prisma:generate --workspace backend
npm run prisma:push --workspace backend
npm run sync:tvmaze --workspace backend
npm run sync:tmdb --workspace backend
npm run sync:trakt --workspace backend
npm run sync:netflix --workspace backend
npm run sync:youku --workspace backend
npm run sync:iqiyi --workspace backend
npm run dev:backend
npm run dev:frontend
```

前端默认端口 `19992`，后端默认端口 `19993`。启动后访问 `http://127.0.0.1:19992`。

Hulu、Disney+、Max 和 TheTVDB 默认关闭，可在设置页启用后手动同步；IMDb 需要先配置本地 datasets 缓存目录。

## ⚙️ 系统设置

启动前后端后，通过 `http://127.0.0.1:19992/settings` 管理全局代理、数据源启用状态、单源代理策略、凭据、连通性测试和手动同步。

- 设置持久化到未纳入 Git 的 `backend/.env`，保存成功后立即更新运行时配置，不需要重启服务
- 敏感值不会回填到输入框或通过 API 返回明文，页面只显示掩码
- 全局代理分别支持 `HTTP_PROXY` 和 `HTTPS_PROXY`
- 单个数据源支持 `inherit`（跟随全局）、`direct`（直连）和 `custom`（自定义代理）
- 已接入并可同步的数据源为 TVmaze、TMDb、Trakt、TheTVDB、Netflix、Hulu、Disney+、Max、优酷和爱奇艺；IMDb 使用本地 datasets 手动导入
- 规划中、接入受限和商业接口的数据源只作为目录展示，不能启用或同步
- 数据源页和设置页每 5 秒刷新一次状态；后端启动时会把进程中断遗留的 `running` 同步记录收尾为 `failed`

> [!WARNING]
> 设置接口当前没有身份认证，只适合部署在可信的家庭局域网或 NAS 私有网络中。不要将 `19992`、`19993` 或设置接口直接暴露到公网。

## 🔥 热度历史

- 热度信号按 `作品 + 来源 + 平台 + 地区 + 窗口` 保存独立口径，不把不同平台混成一个“真实综合榜”
- 同一来源条目通过稳定的 `sourceId` 关联作品；下一次完整榜单未再出现的信号会转为历史
- `rankDelta = previousRank - currentRank`，正数表示上升，负数表示下降
- 默认保留 90 天非当前快照，当前快照不会被保留策略删除
- `GET /api/trending` 默认只返回当前信号，支持 `movement`、`source`、`platform`、`region`、`mediaType` 等筛选
- `GET /api/media/:id/popularity-history` 支持 1–90 天、最多 1000 条的有界历史查询
- `heatScore` 只取作品各当前来源中的最强排名用于列表排序，页面仍展示原始来源、名次、数值和采集时间

## 📡 数据源

### Netflix Top 10

Netflix 来源读取官方全球全周 XLSX，只同步最新一周的四类榜单：英语电影、非英语电影、英语剧集和非英语剧集，共 40 条当前信号。

- 每日 `09:15`（`Asia/Shanghai`）检查一次，启动同步仍遵循 `SYNC_ON_START`
- 同一周重复同步按来源身份和周次保持幂等
- 下载沿用统一代理设置、10 秒超时和来源级 2 秒限频
- 手动同步：`npm run sync:netflix --workspace backend`

### Hulu / Disney+ / Max 官方上新

Hulu、Disney+ 和 Max 来源只同步官方页面中的平台上新和排期，不生成热度排名。

- Hulu 使用 `https://press.hulu.com/schedule/`
- Disney+ 使用 `https://www.disneyplus.com/explore/articles/new-to-disney-plus`
- Max 使用 WBD Pressroom 的 What's New 页面，默认 URL 可通过 `SOURCE_MAX_BASE_URL` 覆盖
- 三个来源均为 daily schedule，默认关闭，需在设置页显式启用
- 手动同步：
  - `npm run sync:hulu --workspace backend`
  - `npm run sync:disney-plus --workspace backend`
  - `npm run sync:max --workspace backend`

### Trakt

Trakt 公共数据同步只需要配置 `TRAKT_CLIENT_ID`，不需要用户授权凭据。

- 小时级同步趋势榜与期待榜；`watchers` 和 `list_count` 保留为两个来源特定的独立信号
- 日级同步未来 14 天的电影和剧集播出日历
- Trakt 日历只表示电影发行或剧集播出排期，不能证明内容已在某个流媒体平台可用
- 手动同步：`npm run sync:trakt --workspace backend`

### TheTVDB

TheTVDB 只支持免费 project API Key 接入，不会自动回退到任何付费访问方式。

- 仅支持 free-only project API Key；`THETVDB_PIN` 为可选项，不需要时留空即可
- 数据源默认关闭，只有用户显式设置 `SOURCE_THETVDB_ENABLED=true` 后才会参与 daily 同步
- daily updates 读取最近 48 小时重叠窗口，详情补拉最多 40 条记录
- 旧元数据更新不会被当作新的上新标题强行创建
- popularity 不读取 `score`，不会把它算进热度排序
- 只要页面展示了 TheTVDB 提供的数据，就会显示 TheTVDB 来源归属
- 手动同步：`npm run sync:thetvdb --workspace backend`

## ✅ 验证

```bash
npm run typecheck
npm run test
npm run build
```

## 📄 License

本项目尚未声明开源许可证。如需公开分发或接受外部贡献，建议添加 LICENSE 文件（如 MIT）以明确使用条款。
