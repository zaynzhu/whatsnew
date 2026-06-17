# WhatsNew 新片新剧监控网站设计

> 日期：2026-06-17
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：设计通过，进入实现计划

## 背景

`whatsnew` 是一个独立项目，用来持续监控全球与中国的新片新剧播出、上架和热度变化。它参考 PixelReel 的 Radar 模块经验，但不是 PixelReel 的收藏库，也不直接复制 PixelReel 代码。PixelReel 更偏个人影剧游记录；`whatsnew` 更偏公开情报台、榜单监控、上新日历和热度变化追踪。

研究报告给出的判断是：没有单一来源能同时做好全球覆盖、热门榜单、结构化接口和中文内容及时性。系统需要把来源分成四层：

- 官方流媒体上新页与榜单页
- 第三方元数据/API 层
- 跨平台热门度聚合层
- 中国本土热榜与口碑层

本项目首版采用“分阶段情报台”方案：先把稳定 API 骨架和热度基础层跑起来，再逐步接入网页榜单与中国平台。

## 产品定位

首版回答四个问题：

1. 这是什么片/剧
2. 什么时候播或上架
3. 在哪播或在哪看
4. 现在热不热

电影和剧集都是一等公民。剧集化内容包括电视剧、网剧、动漫、综艺和短剧；电影包括院线电影、流媒体电影、网络电影和平台原创电影。

首版不做用户收藏库、不做评分短评、不做社交讨论，也不追求一次接齐所有平台。目标是先形成一个可靠的数据骨架、事件流和可浏览的情报台。

## 类型体系

类型必须明确区分，不能把所有内容都塞进“剧集”或“影视”。

### 一级类型：`mediaType`

- `movie`：电影
- `series`：剧集
- `anime`：动画 / 番剧 / 国创
- `variety`：综艺
- `short_drama`：短剧
- `documentary`：纪录片

### 二级类型：`releaseForm`

用于表达作品的发行形态：

- `theatrical_movie`：院线电影
- `streaming_movie`：流媒体电影
- `tv_series`：电视剧 / 网剧
- `web_series`：网络剧
- `animated_series`：动画连续剧
- `anime_season`：番剧季度
- `variety_season`：综艺季
- `micro_drama`：短剧
- `documentary_film`：纪录电影
- `documentary_series`：纪录剧集

### 来源类型：`sourceContentType`

用于保留来源原始分类，不直接等同于系统类型：

- TMDb：`movie | tv`
- TVmaze：`scripted | animation | reality | documentary | talk_show`
- Trakt：`movie | show`
- 国内平台：保留原始频道名，如电视剧、电影、动漫、综艺、短剧、纪录片

系统展示和筛选优先使用 `mediaType + releaseForm`；来源原始分类保存在 `sourceContentType` 中，便于排查和重新归类。

## 推荐方案

采用“分阶段情报台”：

### 第一阶段：稳定数据骨架

优先接入结构化程度高的来源：

- TVmaze：剧集排期、剧集基础信息、集数日历
- TMDb：电影/剧集基础信息、趋势、正在上映、即将上映、正在播出、即将播出
- Trakt：电影和剧集 trending / popular
- Demo seed：没有 API key 时仍能验证 UI、API 和数据流

### 第二阶段：热度增强

逐步接入：

- IMDb TVMeter / Most Popular Movies
- JustWatch Streaming Charts
- FlixPatrol 平台榜和日历

这些来源不强行合成一个“真实热度”，而是作为不同口径的热度信号共同展示。

### 第三阶段：中国补强

先选择 1-2 个中国网页源试水，再扩展。首选优酷，次选爱奇艺：

- 优酷电视剧/电影频道
- 爱奇艺新片速递、风云榜、热播榜
- 腾讯视频电视剧频道、电影频道、热榜
- 芒果TV 热播剧集、预约、追更日历
- 豆瓣电影/电视口碑层

中国源默认可失败、可关闭，不能影响核心 API 源同步。

## 核心数据模型

### `mediaItem`

标准影视实体，保存“这是什么”。

关键字段：

- `id`
- `mediaType`：`movie | series | anime | variety | short_drama | documentary`
- `releaseForm`
- `sourceContentType`
- `titleDisplay`
- `titleOriginal`
- `titleAliases`
- `overview`
- `posterUrl`
- `productionCountries`
- `originalLanguage`
- `genres`
- `firstReleaseDate`
- `status`：`upcoming | released | ongoing | ended | returning | unknown`
- `tmdbId`
- `tvmazeId`
- `imdbId`
- `traktId`
- `tvdbId`
- `createdAt`
- `updatedAt`

说明：

- 不再使用只适合剧集的 `show` 作为核心命名。
- 电影和剧集共享实体层，差异进入 `mediaType` 和 release 字段。
- 对电影来说，`firstReleaseDate` 是首映/上线日期；对剧集来说，是首播日期。
- 类型筛选必须同时支持一级类型和二级发行形态，避免“动画电影”和“动画剧集”、“纪录电影”和“纪录剧集”混在一起。

### `release`

播出、上映或上架记录，保存“什么时候、在哪播/看”。

关键字段：

- `id`
- `mediaItemId`
- `platform`
- `region`
- `releaseDate`
- `releaseTime`
- `releasePattern`：`theatrical | streaming_drop | weekly | daily | batch | unknown`
- `releaseStatus`：`announced | upcoming | airing_today | available | delayed | ended | unknown`
- `seasonNumber`
- `episodeNumber`
- `source`
- `sourceUrl`
- `fetchedAt`

说明：

- 同一部作品可以有多条 release。例如一部电影可有院线档期、Netflix 上架、Apple TV 租赁；一部剧可有不同地区、平台和季集更新。
- `seasonNumber` 和 `episodeNumber` 对电影为空。

### `popularitySignal`

热度信号，保存“热不热、为什么热”。

关键字段：

- `id`
- `mediaItemId`
- `source`
- `sourceCategory`：`official_platform | cross_platform | metadata_community | chinese_reputation`
- `platform`
- `region`
- `window`：`current | day | week | month`
- `rank`
- `rankDelta`
- `value`
- `valueLabel`
- `capturedAt`
- `sourceUrl`

说明：

- Netflix Top 10、JustWatch、FlixPatrol、IMDb TVMeter、TMDb Trending、Trakt Trending、优酷热播、爱奇艺风云榜、腾讯热榜都写入这里。
- 不把不同来源伪装成同一个客观排名。
- 可额外计算 `heatScore` 作为排序辅助，但 UI 必须显示原始来源和口径。

### `sourceSyncRun`

数据源同步状态，保存“采集是否健康”。

关键字段：

- `id`
- `source`
- `status`：`running | success | warning | failed`
- `startedAt`
- `finishedAt`
- `durationMs`
- `itemCount`
- `errorMessage`
- `nextRunAt`

### `changeEvent`

变化事件，保存“这次有什么值得看”。

关键字段：

- `id`
- `mediaItemId`
- `eventType`：`media_detected | release_announced | airing_today | available_now | rank_entered | rank_changed | heat_rising | delayed | source_failed`
- `title`
- `description`
- `source`
- `sourceUrl`
- `eventAt`
- `payload`

## 后端采集层

后端拆成五类模块。

### `source adapters`

每个来源一个 adapter，统一输出：

- `NormalizedMediaInput`
- `ReleaseInput`
- `PopularitySignalInput`

首版建议实现：

- `tvmazeAdapter`
- `tmdbAdapter`
- `traktAdapter`
- `demoSeedAdapter`
- `chinaYoukuAdapter` 首选试水
- `chinaIqiyiAdapter` 次选预留

### `normalizer`

负责字段标准化：

- 标题清洗
- 别名合并
- 地区、语言、平台名标准化
- 媒体类型归类
- URL 和图片字段清洗

### `matcher`

负责判断不同来源是否指向同一作品。

匹配优先级：

1. 外部 ID 精确匹配：`tmdbId / tvmazeId / imdbId / traktId`
2. 标题 + 年份 + 原语言
3. 标题别名 + 平台 + 日期近似匹配

首版只自动合并高置信匹配。低置信冲突先记录，不强行合并。

### `sync scheduler`

负责定时同步和手动同步。

建议频率：

- 热度榜：每 30-60 分钟
- 播出/上新：每天 2-4 次
- 元数据补全：每天 1 次
- 国内网页源：每 2-6 小时

所有外部 API 和网页请求必须：

- 有 timeout
- 有 source 级 RateLimiter
- 同一外部服务连续请求间隔不低于 2 秒
- 写入 `sourceSyncRun`

### `event generator`

同步后比较新旧数据，生成事件：

- 新片/新剧发现
- 定档
- 今日播出/今日上架
- 进入榜单
- 排名变化
- 热度快速上升
- 改档
- 数据源失败

首页展示的是事件和聚合视图，不直接暴露原始同步结果。

## 前端信息架构

首版前端是工作台，不做营销首页。

### `/`

情报台首页：

- 今日开播/上映/上架
- 本周新片新剧
- 热度上升
- 中国区关注
- 最新变化事件
- 数据源健康状态

### `/discover`

发现列表，支持筛选：

- 类型：电影 / 电视剧 / 动漫 / 综艺 / 短剧 / 纪录片
- 地区：全球 / 美国 / 韩国 / 日本 / 中国大陆 / 港台 / 东南亚
- 状态：即将上线 / 今日上线 / 正在播出 / 已上线 / 完结
- 平台：Netflix / Disney+ / Apple TV+ / Youku / iQIYI / Tencent / MangoTV 等
- 热度来源：TMDb / Trakt / IMDb / JustWatch / FlixPatrol / 国内榜单

### `/trending`

热度榜：

- 综合热度
- TMDb Trending
- Trakt Trending
- IMDb TVMeter
- 国内平台榜
- 排名变化：上升 / 下降 / 新进榜

每个条目展示“为什么热”，例如：

- `Trakt 24h trending #4`
- `TMDb weekly trending #12`
- `腾讯热榜 #3`

### `/calendar`

播出/上映/上架日历：

- 今日
- 本周
- 本月
- 即将上线
- 改档提醒

### `/sources`

数据源状态：

- 最近成功时间
- 最近失败时间
- 最近错误
- 本次抓到多少条
- 是否启用
- 下一次同步时间

### `/media/:id`

详情页：

- 标准标题、原名、别名
- 海报、简介、地区、语言、类型
- 外部 ID
- 播出/上映/上架平台与地区
- 档期与更新模式
- 热度信号时间线
- 变化事件
- 来源链接

## API 设计

### `GET /api/dashboard`

首页聚合数据：

- 今日开播/上映/上架
- 本周新片新剧
- 热度上升
- 中国区关注
- 最新事件
- 数据源状态摘要

### `GET /api/media`

发现列表。

查询参数：

- `mediaType=movie|series|anime|variety|short_drama|documentary`
- `releaseForm=`
- `region=`
- `status=`
- `platform=`
- `source=`
- `sort=heat|firstReleaseDate|updatedAt`
- `cursor=`
- `limit=`

### `GET /api/media/:id`

作品详情，包含：

- media item
- releases
- popularity signals
- change events
- source links

### `GET /api/trending`

热度榜。

查询参数：

- `source=tmdb|trakt|imdb|youku|iqiyi|tencent`
- `mediaType=movie|series|anime|variety|short_drama|documentary`
- `releaseForm=`
- `region=`
- `window=day|week|month|current`

### `GET /api/calendar`

播出/上映/上架日历。

查询参数：

- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`
- `region=`
- `platform=`
- `mediaType=`
- `releaseForm=`

### `GET /api/sources`

数据源状态。

### `POST /api/sources/:source/sync`

手动触发单源同步。

### `POST /api/sync`

手动触发全量同步。开发期可开放，后续需要鉴权。

## 首版技术建议

首版推荐使用轻量全栈结构：

- 后端：Express + TypeScript
- 前端：React + Vite + TypeScript
- 数据库：MySQL，使用 NAS 上已有 MySQL 实例
- ORM：Prisma
- 定时任务：node-cron
- HTTP：fetch 或 axios，统一封装 RateLimiter、timeout、重试

选择 MySQL 是因为 NAS 已有可用 MySQL，不需要额外 Docker 服务，也避免后续迁移成本。`whatsnew` 数据库已独立于 PixelReel 创建。

## 视觉方向

整体气质偏“情报雷达 / newsroom / ops dashboard”，不是个人收藏海报墙。

原则：

- 首页第一屏就是可用工作台
- 信息密度高，海报辅助展示
- 强调来源、时间、变化和热度理由
- 深色背景可以用，但避免整站单一蓝紫
- 颜色用于表达状态：新上线、热度上升、数据源失败、即将开播

## 首版验证标准

实现阶段需要证明：

1. 空库启动后，可以运行同步任务写入 `mediaItem / release / popularitySignal / sourceSyncRun`
2. 外部源失败时，站点仍可访问，`/api/sources` 能看到失败原因
3. 首页能显示至少 4 类情报：今日/本周/热度/来源状态
4. 同一作品从不同来源进入时，不会因为标题差异轻易重复
5. 热度来源分开显示，不伪装成唯一客观排名
6. 所有外部请求有超时和限频，同一服务连续请求间隔不低于 2 秒
7. 没有 API key 时，可以用 demo seed 验证 UI、API 和数据流
8. 电影和剧集都能进入列表、详情、日历和热度榜
9. 类型筛选能区分电影、剧集、动漫、综艺、短剧、纪录片，以及院线电影/流媒体电影/动画剧集等二级发行形态

## 暂不做

首版暂不做：

- 用户注册登录
- 个人收藏、评分、短评
- 多用户推荐
- 通知推送
- 全量中国平台抓取
- JustWatch / FlixPatrol 商务 API 深度集成
- 复杂人工合并后台

这些能力可以在数据骨架稳定后再扩展。

## 开放问题

后续 implementation plan 需要进一步确认：

- 首个中国网页源优酷已确定，爱奇艺作为次选
- 首版不需要 Docker Compose，直接连接 NAS MySQL
- API key 配置方式使用后端 `.env`
- NAS MySQL 连接参数是否需要单独建低权限用户
- 首版中文优先，不做 i18n
- 等你提供 GitHub 空仓库地址后，再配置 remote 并推送本地提交
