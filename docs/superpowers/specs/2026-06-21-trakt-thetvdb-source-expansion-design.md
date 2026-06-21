# WhatsNew Trakt 与 TheTVDB 来源扩展设计

> 日期：2026-06-21
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：方案已通过，等待书面复核

## 背景

WhatsNew 已能从 TVmaze、TMDb 和 Netflix 获取真实数据，并把电影、剧集、播出日历与来源独立热度保存到 MySQL。优酷和爱奇艺虽然已有适配器，但目前返回的内容不能稳定代表最新作品，用户已在设置中关闭这两个来源。

下一阶段需要继续兼容原规划中的国际来源，首批选择：

- Trakt：补充电影和剧集的社区热度、期待度与公开播出日历
- TheTVDB：补充电影和剧集的结构化元数据、外部 ID、首播与下一集日期

PixelReel 已配置可用的 Trakt 应用凭据。TheTVDB 账号已登录，但尚未创建 v4 API Key。

## 硬约束

### TheTVDB 必须免费

TheTVDB 只允许使用免费项目 API Key：

- 不购买个人订阅
- 不选择或自动升级到付费套餐
- 不绑定付费方式
- 不把付费 Key 或其他项目的 Key 复制到 WhatsNew
- 免费申请未通过、免费资格不满足或条款发生变化时，来源保持禁用

TheTVDB 不可用不会阻塞项目。WhatsNew 继续使用 TMDb、TVmaze 和 Trakt 提供核心数据。

提交 TheTVDB 免费申请属于创建持久凭据的外部操作，必须在用户看到最终申请内容并明确确认后执行。本设计和后续代码实现都不能代替这次确认。

### 来源语义必须真实

- 不把不同来源的数值合成为伪客观的“全球热度”
- Trakt 的 `watchers` 和 `list_count` 分别展示，不混为同一种指标
- TheTVDB 的 `score` 只可用于其接口内部排序提示，不保存为热度信号
- Trakt 和 TheTVDB 是数据来源，不等于作品的流媒体播放平台
- 来源未提供播放平台时，UI 明确显示“平台未提供”

### 网络与凭据

- 同一外部服务连续请求间隔不低于 2 秒
- API Key、Client ID、Client Secret、Bearer Token 和代理地址不进入日志、数据库或 API 响应
- 设置页只显示“已配置 / 未配置”，不回显凭据
- 用户在设置页修改代理或凭据后立即生效，无需重启服务

## 目标

本阶段完成：

1. Trakt 公开电影、剧集热度和期待榜同步
2. Trakt 未来 14 天电影上映与剧集播出日历同步
3. TheTVDB 免费 v4 Key 的配置、鉴权与每日增量元数据同步
4. 按来源能力拆分小时任务和每日任务
5. 在日历、热度榜、详情和设置页准确显示来源、口径和采集时间
6. 保持优酷和爱奇艺关闭，不让调度器自动重新启用

## 非目标

本阶段不做：

- Trakt 用户 OAuth、收藏、历史记录或个性化日历
- TheTVDB 付费订阅或商业授权
- 使用 TheTVDB 构建热度榜
- 修复或重写优酷、爱奇艺适配器
- JustWatch、FlixPatrol 商业 API
- IMDb、Apple TV、Prime Video、Hulu、Disney+、Max 的正式适配器
- 跨来源综合热度分

## 方案比较

### 方案 A：Trakt 全能力 + TheTVDB 每日元数据

Trakt 同时提供热度、期待榜和播出日历；TheTVDB 只补充近期作品元数据。两者按真实能力分工，第一批即可同时改善热度和新片发现。

### 方案 B：只接 Trakt

实现更快，但会继续把 TheTVDB 留在“规划中”，无法验证免费 Key、增量同步和元数据归并链路。

### 方案 C：一次接入全部规划来源

来源数增长最快，但 IMDb 数据集、Apple 官方榜单和各流媒体页面的协议、字段、地区差异较大，会放大验证范围，并降低首批真实数据的可靠性。

采用方案 A。完成并验证后，再按独立设计推进 IMDb 与 Apple TV。

## 来源能力与配置

### Trakt

来源状态从 `blocked` 调整为 `active`，默认是否启用由凭据完整性决定。

所需配置：

- `TRAKT_CLIENT_ID`：必需
- `TRAKT_BASE_URL`：可选，默认官方 v2 API 地址

本阶段只调用公开接口，不需要：

- `TRAKT_CLIENT_SECRET`
- `TRAKT_ACCESS_TOKEN`
- `TRAKT_REDIRECT_URI`

实现时可以从 PixelReel 的本地环境配置安全复制 `TRAKT_CLIENT_ID` 到 WhatsNew 的忽略文件，但不得打印或提交实际值。

### TheTVDB

来源状态从 `planned` 调整为 `active`，但在免费 Key 配置完成前保持关闭。

所需配置：

- `THETVDB_API_KEY`：必需
- `THETVDB_PIN`：可选，仅当免费项目 Key 明确要求时使用
- `THETVDB_BASE_URL`：可选，默认官方 v4 API 地址

设置页必须同时显示来源开关和凭据状态。缺少必需凭据时，即使数据库中的 `enabled=true`，调度器也不得运行该来源，并返回明确的 `credential_missing` 状态。

## 调度设计

现有来源注册表需要增加“来源 + 任务组”维度，使同一来源可以按不同频率执行不同能力：

```text
sourceId + scheduleGroup + adapter
```

任务组：

- `hourly`：Trakt 热度与期待榜
- `daily`：Trakt 日历、TheTVDB 增量元数据
- `manual`：手动同步指定来源的全部已配置能力

手动同步 Trakt 时依次运行热度和日历适配器，结果归入同一个父同步请求，但每个子能力保留独立的成功、失败和数量。这样可以避免日历接口失败时把已经成功写入的热度伪装成全部失败，也不会把几百条日历数据每小时重复拉取。

## Trakt 设计

### 请求与限流

所有请求使用：

- `trakt-api-version: 2`
- `trakt-api-key: <TRAKT_CLIENT_ID>`
- 独立的 Trakt `RateLimiter`
- 请求开始时间间隔至少 2 秒

公开接口返回 `401` 或 `403` 时标记凭据错误，不自动尝试用户 OAuth。

### 热度与期待榜

小时任务调用：

- `GET /movies/trending?limit=50`
- `GET /shows/trending?limit=50`
- `GET /movies/anticipated?limit=50`
- `GET /shows/anticipated?limit=50`

生成两类来源独立信号：

| 信号 | 来源分类 | 原始数值 | 排名语义 |
|------|----------|----------|----------|
| `trakt_trending` | `metadata_community` | `watchers` | 当前观看用户形成的榜单排名 |
| `trakt_anticipated` | `metadata_community` | `list_count` | 加入期待列表形成的榜单排名 |

两类信号使用不同的 `window`，不能互相覆盖：

- trending：`current`
- anticipated：`upcoming`

UI 展示原始数值、排名、来源、窗口和采集时间。作品可同时出现两行，不能压成一个综合排名。

### 播出日历

每日任务调用：

- `GET /calendars/all/movies/{today}/14`
- `GET /calendars/all/shows/{today}/14`

电影使用 `released` 作为上映日期。剧集使用 `first_aired` 或 `released`，并保存季号、集号和单集标题。

日历只用于发现未来 14 天作品和单集，不表示作品可以在 Trakt 播放。写入 `Release` 时：

- `source=Trakt`
- `platform=Unspecified`
- UI 显示“平台未提供”

### 身份映射与幂等

Trakt 响应中的 ID 按原值保存：

- `traktId`
- `tmdbId`
- `imdbId`
- `tvdbId`

来源条目稳定键：

```text
trakt:movie:<traktId>
trakt:show:<traktId>
```

归并优先级：

1. 同类型精确外部 ID
2. 标准化标题 + 年份
3. 无可靠匹配时创建新作品

相同榜单同一采集时间重复同步时更新当前快照，不增加重复历史。相同日历条目的唯一键由作品、日期、季号、集号和来源共同确定。

### 失败语义

- 四个热度接口中任一失败：热度子任务失败，不把未返回的榜单标记为离榜
- 两个日历接口中任一失败：日历子任务失败，不清理已有日历
- 成功响应为空：记录成功空快照，并按既有规则处理当前状态
- 单条作品归并失败：记录警告并继续，响应正文不写日志

## TheTVDB 设计

### 免费申请

TheTVDB 免费申请只填写当前项目的真实情况：

- 收入档位：项目实际适用的最低免费档位
- 项目名称：`WhatsNew`
- 用途：个人自托管、非商业的新电影和新剧监控面板
- 数据用途：元数据、外部 ID、图片、首播日期和下一集日期
- 媒体中心：选择 `Other` 或与实际情况一致的选项
- 归属说明：页面展示 TheTVDB 来源标识

建议英文说明：

```text
Personal self-hosted non-commercial dashboard that monitors upcoming and newly released movies and TV series. It uses TheTVDB metadata, external IDs, artwork, first-air dates and next-air dates. TheTVDB attribution is displayed. Data is not resold.
```

用户确认前不点击提交。若页面要求付费、付款信息或不符合免费条件，立即停止申请并保持来源禁用。

### 鉴权

使用 `POST /login` 发送 API Key 和可选 PIN，获得 v4 Bearer Token。

- Token 只缓存在后端内存
- 不写 `.env`、数据库或日志
- 进程重启后重新登录
- 遇到鉴权失败时清空缓存并最多重试登录一次
- 不依赖文档标称有效期，在每日任务前检查本地缓存并在失败时刷新

登录请求和数据请求共享 TheTVDB `RateLimiter`，连续请求间隔至少 2 秒。

### 每日增量同步

每日任务按 UTC 时间读取最近 48 小时更新，保留一天重叠窗口用于补偿调度失败：

- `GET /updates?since=<timestamp>&type=movies&page=<page>`
- `GET /updates?since=<timestamp>&type=series&page=<page>`

处理规则：

1. 跨页收集 `recordId`
2. 按类型和 ID 去重
3. 删除事件只更新已有来源条目状态，不创建新作品
4. 创建和更新事件按最新时间排序
5. 每日最多获取 40 个详情，避免单次运行无限延长
6. 超出上限的 ID 留待下一次重叠窗口继续处理

详情接口：

- `GET /movies/{id}/extended?short=true`
- `GET /series/{id}/extended?short=true`

### 新片过滤

TheTVDB 的更新流包含大量老作品资料修订，不能把“今天更新”当成“今天上映”。详情只有满足以下条件才进入发现链路：

- 电影：`first_release` 在今天前 30 天至未来 180 天之间
- 剧集：`firstAired` 在今天前 30 天至未来 180 天之间
- 或剧集 `nextAired` 在今天至未来 30 天之间

不满足窗口的条目：

- 已存在作品可以更新外部 ID、别名、图片和状态
- 不创建新的 `MediaItem`
- 不创建新的 `Release`
- 不生成热度信号

### 字段映射

TheTVDB 可补充：

- `tvdbId`
- IMDb、TMDb 等外部 ID
- 标题、别名、原始语言、国家或地区
- 海报或图片
- 类型、状态
- `first_release`、`firstAired`、`nextAired`

来源条目稳定键：

```text
thetvdb:movie:<tvdbId>
thetvdb:series:<tvdbId>
```

TheTVDB 不提供明确播放平台时，`Release.platform` 写入 `Unspecified`，UI 显示“平台未提供”。TheTVDB 的 `score` 不映射到 `heatScore`、`PopularitySignal.value` 或排名。

## 数据模型与服务边界

优先复用现有 `MediaItem`、`Release`、`PopularitySignal`、`SourceItem` 和 `SourceSyncRun`。只有当前模型不能保存 Trakt/TheTVDB 外部 ID 时，才增加明确字段或结构化外部 ID 关系，不创建来源专用作品表。

新增或调整的服务职责：

- `TraktClient`：请求头、限流、错误归一化
- `TraktPopularityAdapter`：四个榜单与信号映射
- `TraktCalendarAdapter`：电影和剧集日历映射
- `TheTvdbClient`：登录、内存 Token、限流和详情请求
- `TheTvdbUpdatesAdapter`：更新流、窗口过滤和字段映射
- `SourceAdapterRegistry`：按 `scheduleGroup` 选择适配器
- `RuntimeSettingsService`：来源开关与必需凭据共同决定可运行状态

所有适配器只产出统一 DTO，归并、历史快照、当前状态切换和数据库事务继续由现有同步服务负责。

## API 与前端

### 设置页

- Trakt 显示为“可用”，凭据完整后允许开启
- TheTVDB 显示为“可用”，免费 Key 配置前保持关闭
- 缺少凭据时禁用“立即同步”，并显示缺失项名称
- 优酷、爱奇艺保持用户当前的关闭状态
- 代理配置继续统一管理，并对新客户端立即生效

### 热度榜

- 来源筛选增加 Trakt
- 可区分“趋势榜”和“期待榜”
- 数值分别标注 `watchers` 与 `list_count`
- TheTVDB 不出现在热度来源中

### 日历与详情

- 日历卡片显示 Trakt 或 TheTVDB 来源
- 来源未给出流媒体平台时显示“平台未提供”
- 剧集显示季号、集号和单集标题
- 详情页展示外部 ID、来源归属与最后同步时间
- TheTVDB 数据出现时显示清晰来源标识

## 测试与验证

### 自动化测试

- Trakt 四类榜单 fixture 映射
- Trakt 电影和剧集日历 fixture 映射
- Trakt 公开接口只使用 Client ID，不要求 Access Token
- 两个客户端的请求开始时间间隔不低于 2 秒
- TheTVDB 登录、Token 缓存、401 后单次刷新
- TheTVDB 更新分页、ID 去重、删除事件与 40 条上限
- 老作品更新不会创建新作品或日历
- TheTVDB `score` 不产生热度信号
- 调度器按 `hourly`、`daily`、`manual` 选择正确适配器
- 缺少必需凭据时来源不可运行
- 凭据、Token 和代理不会出现在日志或 API 响应

### 真实链路验证

Trakt：

1. 使用 WhatsNew 本地 Client ID 调用四个榜单和两个日历接口
2. 连续请求间隔符合 2 秒限制
3. 手动同步后核对电影、剧集、两类热度信号和未来 14 天日历
4. 再次同步验证幂等与离榜逻辑

TheTVDB：

1. 用户明确确认后提交免费项目申请
2. 免费 Key 获批后配置到本地忽略文件
3. 验证登录、更新流、详情和 48 小时重叠窗口
4. 抽查老作品更新未被误标为新片
5. 验证页面归属标识和无付费依赖

最终运行后端测试、前端测试、typecheck、build，并用桌面和移动视口检查设置、热度榜、日历与详情页。

## 推进顺序

1. 实现凭据门控与按任务组调度
2. 实现并验证 Trakt 客户端、热度与日历
3. 更新设置、热度榜、日历和详情 UI
4. 在用户确认后提交 TheTVDB 免费申请
5. 免费 Key 获批后实现并验证 TheTVDB
6. 单独设计 IMDb 非商业数据集与 Apple TV 官方榜单
7. 分别评估 Prime Video、Hulu、Disney+、Max 的官方页面解析

JustWatch 和 FlixPatrol 继续标记为商业来源，不进入免费 MVP。

## 风险与回退

- Trakt 字段或限流变化：单独关闭 Trakt，不影响其他来源
- TheTVDB 免费申请未通过：保持关闭，不引入付费替代
- TheTVDB 更新量过大：依靠 40 条上限和 48 小时重叠窗口分批消化
- 标题归并不确定：保留来源条目，不做低置信度自动合并
- 官方页面或 API 条款变化：先停用对应来源，再更新设计和实现

每个来源都通过设置开关独立回退，数据库历史与其他来源不受影响。
