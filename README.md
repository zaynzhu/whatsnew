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
> WhatsNew 聚合 TVmaze、TMDb、Trakt、TheTVDB、Netflix、优酷、爱奇艺、腾讯视频等多来源信号，按 `作品 + 来源 + 平台 + 地区 + 窗口` 保留独立口径的热度历史，适合部署在家庭局域网或 NAS 私有网络中自用。

---

## ✨ Features

- **分类型展示** —— 电影、剧集、动漫、综艺、短剧、纪录片分类浏览
- **今日上线 / 本周新片新剧** —— 聚合各来源的上新与播出信息
- **海报日历** —— 用月度海报墙浏览排期，按日期展开电影与剧集的大图片单
- **热度变化追踪** —— 展示热度上升、新进、下降，保留 90 天排名时间线
- **数据源状态** —— 实时查看各来源同步状态与连通性
- **多源独立口径** —— 不把不同平台混成一个“真实综合榜”，每条信号独立保存
- **全局与单源代理** —— 支持全局 `HTTP_PROXY` / `HTTPS_PROXY`，单源可 `inherit` / `direct` / `custom`
- **设置热更新** —— 设置保存后即时生效，无需重启服务，敏感值掩码处理
- **定时 + 手动同步** —— 定时任务自动拉取，也支持各来源独立手动同步
- **持续海报补全** —— 缺图作品按热度通过 TMDb 严格匹配补全，页面统一走后端图片代理与磁盘缓存

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
| [Design Archive](docs/superpowers/README.md) | 历史设计规格和实施计划的权威边界 |

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
npm run sync:bilibili --workspace backend
npm run sync:apple-tv-plus --workspace backend
npm run sync:douban --workspace backend
npm run dev:backend
npm run dev:frontend
```

国内来源请勿直接在主库试跑。使用 `npm run sandbox:prepare` 克隆当前基线到 `whatsnew_china_sandbox`，再通过 `npm run sandbox:sync -- youku`、`npm run sandbox:sync -- tencent` 等命令逐个来源验收；沙盒前后端分别使用 `npm run sandbox:backend` 和 `npm run sandbox:frontend`，访问 `http://127.0.0.1:19995/`。

前端默认端口 `19992`，后端默认端口 `19993`。启动后访问 `http://127.0.0.1:19992`。

Hulu、Disney+、Apple TV+、腾讯视频、豆瓣和 TheTVDB 默认关闭，可在设置页启用后手动同步；Max 因 WBD Pressroom 当前要求登录或返回 403，暂列为受限来源；IMDb 需要先配置本地 datasets 缓存目录。

## ⚙️ 系统设置

启动前后端后，通过 `http://127.0.0.1:19992/settings` 管理全局代理、数据源启用状态、单源代理策略、凭据、连通性测试、只读数据预览和手动同步。

- 设置持久化到未纳入 Git 的 `backend/.env`，保存成功后立即更新运行时配置，不需要重启服务
- 敏感值不会回填到输入框或通过 API 返回明文，页面只显示掩码
- 全局代理分别支持 `HTTP_PROXY` 和 `HTTPS_PROXY`
- 单个数据源支持 `inherit`（跟随全局）、`direct`（直连）和 `custom`（自定义代理）
- 已接入并可同步的数据源为 TVmaze、TMDb、Trakt、TheTVDB、Netflix、Prime Video、Hulu、Disney+、Apple TV+、优酷、爱奇艺、腾讯视频、哔哩哔哩和豆瓣；Max 与芒果TV 当前受限，IMDb 使用本地 datasets 手动导入
- 已接入且凭据完整的数据源即使保持关闭，也可先预览本次原始采集摘要和样例；预览不会写入影视数据或同步运行记录
- 规划中、接入受限和商业接口的数据源只作为目录展示，不能启用或同步
- 数据源页和设置页每 5 秒刷新一次状态；后端启动时会把进程中断遗留的 `running` 同步记录收尾为 `failed`
- 设置页可调整小时组刷新间隔和日组北京时间，保存后立即重排后续任务；默认每小时整点和每天 `09:15`

## 🖼️ 海报获取与显示

- 来源适配器优先保留自身提供的 `posterUrl`；Netflix 缺图项先复用库内唯一的近期电影或仍在播剧集，再使用 TMDb ID、唯一严格标题或高置信近期候选补充海报和基础元数据
- 启动同步、小时级同步和日级同步完成后，如果 TMDb 已启用且凭据完整，会自动处理最多 40 条待补图作品
- 安全重复项会事务性迁移来源、热度和关联数据；外部 ID 冲突、无图或候选优势不明确的作品不会强行绑定，并通过 `posterLookupAttemptedAt` 在 7 天后重试
- 手动批量处理：`npm run enrich:posters --workspace backend -- --limit=120`，单次上限为 500
- 显式人工复核后可忽略 7 天窗口重试：`npm run enrich:posters --workspace backend -- --limit=20 --force`；匹配规则不会因此放宽
- 前端所有海报默认通过 `srcset` 请求 `GET /api/media/:id/poster?width=320|640|960`；浏览器按展示位和屏幕像素密度选择尺寸，代理失败时回退原始地址
- 后端原图按图片 URL 缓存到 `backend/.cache/posters/`，响应式 WebP 变体缓存到 `backend/.cache/poster-variants/`；变体只缩小、不放大，避免把低清原图伪装成高清图
- 响应式缓存默认限制为 512 MB，启动同步和每日调度会在超限时按最旧条目清理到 90%；一小时写入保护期避免误删正在生成的文件
- 爱奇艺 adapter 会把官方图域上已知的 `120×160` / `141×188` 竖版缩略图规范为 `579×772` 后入库，让后续同步的数据在全站使用高清原图；已有低清记录只接受同一稳定来源身份、同一素材 ID 的高清替换。热度页继续保留 direct-first 作为旧数据兜底，其他页面沿用统一代理方案
- 图片缓存会校验元数据与字节、合并同 URL 并发请求并原子写入；30 天后刷新失败时继续返回旧缓存，`X-Poster-Cache` 标记为 `stale`
- 小时同步会按热度验证 20 张待确认图片，启动同步和每日同步各验证最多 100 张；作品持久化记录 `unverified / healthy / degraded / broken`，跨退避窗口重复失败后才判定损坏
- 图片健康可在设置页查看，其中缺图和低清替换任务都分为尚未尝试、7 天冷却中和可以重试，样本展示最近一次严格查询时间；原图缓存和响应式 WebP 缓存也分别显示数量、容量及异常
- 可运行 `npm run audit:posters --workspace backend` 查看完整状态。手动验证命令 `npm run verify:posters --workspace backend -- --limit=100` 会分别报告正常、低清、尺寸未知和网络失败数量
- 手动预览响应式缓存清理：`npm run prune:poster-variants --workspace backend`；确认后追加 `-- --apply`，也可用 `--max-mb=1024` 临时指定 64 至 10240 MB 的上限
- 图片请求与验证会读取真实像素尺寸并持久化；宽度小于 300 或高度小于 400 会单独标记为低清，不与网络损坏状态混为一谈
- 低清作品会进入现有严格 TMDb 补图队列，只有 TMDb ID、唯一严格标题或既有高置信规则通过时才替换，未匹配项保留原图并等待 7 天后重试
- 不带 `width` 的图片代理保留上游响应的真实 `Content-Type` 和字节；带受支持 `width` 的请求返回 WebP 变体，转码失败时安全回退原图

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

### Prime Video / Hulu / Disney+ 官方上新与 Max 受限状态

Prime Video、Hulu 和 Disney+ 只同步官方页面中的平台上新和排期，不生成热度排名。日历会区分“平台新增”“平台首发”“剧集更新”等语义，平台旧片上架不会被当成作品首次发行。

- Prime Video 从 About Amazon 娱乐频道发现最新月度上新文章，只保留美国区电影与剧集，排除直播体育、音乐和类型不明确的活动
- Hulu 使用 `https://press.hulu.com/schedule/`
- Disney+ 使用 `https://www.disneyplus.com/explore/articles/new-to-disney-plus`
- 平台页面只证明上架地区，不证明作品原始语言或制片国家；无明确字段时这两项保持未知
- Max 解析器仍保留，但 WBD Pressroom 当前要求登录或返回 403，因此来源被标记为受限且不会进入调度
- Prime Video、Hulu 和 Disney+ 均为 daily schedule，默认关闭，需在设置页显式启用
- 手动同步：
  - `npm run sync:prime-video --workspace backend`
  - `npm run sync:hulu --workspace backend`
  - `npm run sync:disney-plus --workspace backend`
  - Max 恢复公开访问前不要执行 `npm run sync:max --workspace backend`

### 数据质量维护

- 平台完整快照同步后，已不在最新快照中的来源关联会自动停用
- 小时任务会合并无冲突的重复 TMDb 身份，并把“同类型、同名、发行年份兼容且只有一个外部身份锚点”的来源孤立记录并入该作品；存在多个身份候选时保持分离
- 对完全没有外部 ID 的记录，只有两个以上独立来源同时给出相同作品类型、规范化标题和精确首发日期时才自动归并
- 启动与日任务还会清理严格判定的无排期、无热度、全来源失效的平台孤立作品
- 两项维护均可先预览再执行：`npm run reconcile:duplicate-identities --workspace backend`、`npm run cleanup:platform-orphans --workspace backend`，确认后追加 `-- --apply`

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

### 优酷、爱奇艺与腾讯视频预约

- 优酷通过 `mtop.youku.columbus.gateway.new.execute` 的独立待播节点分页读取电影和剧集，保存预约人数、待播状态、作品链接与来源排名，不再使用频道首页
- 爱奇艺读取 `https://www.iqiyi.com/newOnlinePCW` 的完整待播列表，保存预约人数；未上线且没有明确日期的条目仍按待播处理
- 腾讯视频向 `getMVLPage` 结构化接口提交电影和剧集频道的“即将上线”筛选，分页保存待播片单及“预约破 N 万”等下限信号；接口的 `publish_date` 只补充作品首发日期，不作为腾讯上线日期
- 三个来源均属于小时组，进入主库前必须先在国内源沙盒验收；关闭来源不会删除已经采集的快照
- 手动同步：`npm run sync:youku --workspace backend`、`npm run sync:iqiyi --workspace backend`、`npm run sync:tencent --workspace backend`

### 芒果TV

芒果TV 旧频道首页数据无法稳定表达真实待播预约，当前已标记为 blocked。保留研究代码和目录项，但不进入调度，也不要把旧首页结果作为产品数据恢复。

### 哔哩哔哩

哔哩哔哩来源读取 pgc 季度排行榜 API（`api.bilibili.com/pgc/season/rank/web/list`），同步番剧、国创和纪录片三个完整榜单（近 3 日综合得分）。

- 榜单不需 WBI 签名，纯 HTTP JSON；字段含排名、标题、海报、播放量、追番数、评分和更新进度
- "更新至第 N 话"记为 `ongoing`/`available`，"全 N 话/完结"记为 `ended`；榜单无上线日期，release 不带 `releaseDate`
- 三个榜单作为完整快照，下一次同步不在榜的信号会转为历史
- pgc 排行端点可能随时加签名或下线，解析失败会可见报错，不伪装成功
- 手动同步：`npm run sync:bilibili --workspace backend`

### Apple TV+

Apple TV+ 来源读取官方 Press RSS feed（`https://www.apple.com/tv-pr/news-feed.xml`，Atom XML），同步最近 10 条上新资讯。

- `tv.apple.com` collection 本地 HTTP 返回 404，不硬接平台片库，改用官方 RSS 作为 news_signal 来源
- `<updated>` 是新闻发布日期，首版作为 `releaseDate`（非精确上线日）；非影视类新闻（无 series/movie/documentary/special 关键词）会被过滤
- 来源默认关闭，需在设置页启用后手动同步
- 手动同步：`npm run sync:apple-tv-plus --workspace backend`

### 豆瓣

豆瓣来源读取电影 TOP250 chart 接口（`movie.douban.com/j/chart/top_list`）作为口碑评分信号，同时低频分页读取移动端独立待映待播页面，同步完整的电影“即将上映”和剧集“即将播出”列表。

- daily 调度与 `sync:douban` 都依次执行两个独立 scope：`popularity` 只拉 TOP250，`upcoming` 只拉待映待播；两者独立记录运行与健康状态
- TOP250 只输出 media 与评分 popularity signal（`sourceCategory: chinese_reputation`）
- 独立页面输出 release calendar，并把页面排序和想看人数记录为 `douban_upcoming` 期待信号
- 同步入口：`m.douban.com/rexxar/api/v2/movie/coming_soon`、`m.douban.com/rexxar/api/v2/tv/coming_soon`
- 来源默认关闭，需在设置页启用后手动同步；`DOUBAN_COOKIE` 可选，不得高频爬取或绕过登录/验证码
- 手动同步：`npm run sync:douban --workspace backend`

## ✅ 验证

```bash
npm run typecheck
npm run test
npm run build
```

## 📄 License

本项目尚未声明开源许可证。如需公开分发或接受外部贡献，建议添加 LICENSE 文件（如 MIT）以明确使用条款。
