# WhatsNew 热度历史与 Netflix Top 10 设计

> 日期：2026-06-21
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：设计完成，等待复核

## 背景

WhatsNew 已有 TVmaze、TMDb、优酷和爱奇艺四个活跃来源，也能保存 `PopularitySignal` 并展示热度榜。但当前同步会先删除同来源旧信号，再写入本次结果，因此存在三个直接问题：

- 无法形成历史曲线，`rankDelta` 基本只能保持为空
- 无法可靠生成新进榜、上升、下降和热度突增事件
- `MediaItem.heatScore` 会被最后同步的单一来源覆盖，可能把其他来源的有效热度归零

继续接新榜单之前，必须先把热度信号改造成可追踪的历史快照。完成底座后，首个新增来源选择 Netflix 官方 Top 10。Netflix 提供全周 XLSX，字段包含周次、类别、排名、作品名、季名、观看小时、片长、观看次数和累计入榜周数，公开程度和自动化稳定性都高于需要商务授权的 IMDb Meters、JustWatch API 与 FlixPatrol API。

## 目标

本阶段完成两层能力：

1. 让已有 TMDb、优酷和爱奇艺热度信号形成可查询、可比较、可清理的历史
2. 接入 Netflix 官方全球周榜，覆盖电影、剧集、英语与非英语四种榜单

成功后，用户能回答：

- 一部作品当前在哪些榜单、排第几
- 相比上一快照上升或下降了多少位
- 最近 30 天如何变化
- 为什么被标记为热度上升或新进榜
- Netflix 本周全球 Top 10 有哪些电影和剧集

## 非目标

本阶段不做：

- 把不同来源合成为唯一“真实热度榜”
- IMDb Meters 商业数据接入
- JustWatch 或 FlixPatrol 商业 API 接入
- 中国平台新增抓取器
- 通知推送
- 无限期保留历史数据

## 方案比较

### 方案 A：历史优先，再接官方榜单

先改造热度存储、变化事件和查询，再接 Netflix。优点是新旧来源立即共享同一套变化能力，风险和返工最小。

### 方案 B：先增加更多来源

直接增加 Netflix、IMDb 或跨平台榜单。短期来源数变多，但同步仍会覆盖历史，无法形成真正的排名变化。

### 方案 C：先做跨源综合分

为不同来源设计权重并输出综合榜。实现快，但会把平台观看、用户点击、社区关注和预约数混成伪客观数字，违背已经确认的 source-specific 热度原则。

采用方案 A。

## 数据模型

### PopularitySignal 扩展

在现有模型上增加：

- `sourceSyncRunId: String?`：产生快照的同步任务
- `isCurrent: Boolean`：该信号口径的当前快照
- `previousRank: Int?`：上一快照排名，便于 API 直接解释

保留现有字段：

- `source`
- `sourceCategory`
- `platform`
- `region`
- `window`
- `rank`
- `rankDelta`
- `value`
- `valueLabel`
- `capturedAt`
- `sourceUrl`

增加索引：

- `mediaItemId + source + isCurrent`
- `source + window + isCurrent + rank`
- `capturedAt + isCurrent`
- `sourceSyncRunId`

`SourceSyncRun` 增加到热度快照的可选关系。历史记录删除时使用 `onDelete: SetNull`，避免同步任务清理影响热度数据。

### 信号身份

同一热度口径由以下字段确定：

```text
mediaItemId + source + platform + region + window
```

空平台和空地区统一视为固定空值，不因 `null` 比较产生重复口径。

### 排名变化语义

排名越小越好，统一定义：

```text
rankDelta = previousRank - currentRank
```

- 正数：排名上升
- 负数：排名下降
- `null`：没有可比较的上一排名

适配器不再自行计算 `rankDelta`。所有来源都由同一个历史服务计算，避免语义不一致。

## 热度快照服务

新增 `PopularitySnapshotService`，负责单一职责：把适配器的当前热度信号写成历史快照。

每个信号在短事务中完成：

1. 查询相同口径的 `isCurrent=true` 快照
2. 计算 `previousRank` 与 `rankDelta`
3. 将上一快照标记为 `isCurrent=false`
4. 写入新的 `isCurrent=true` 快照
5. 基于变化生成最多一个事件
6. 读取该作品所有当前信号并重算 `heatScore`

若传入快照的 `capturedAt` 与当前快照相同，则更新当前快照，不新增历史和事件。这个规则保证 Netflix 同一周文件重复同步时保持幂等。

### heatScore

`heatScore` 只作为列表排序辅助，不作为跨源真实排名。

对每个当前信号计算：

```text
signalScore = rank 存在时 max(0, 101 - rank)，否则 0
heatScore = 所有当前 signalScore 的最大值
```

这样可以避免来源权重争议，也不会因某个无热度信号的来源后同步而归零。UI 必须继续展示原始来源、排名、数值和窗口。

## 异动事件

每个快照最多生成一个事件，避免重复噪音：

1. 没有上一快照且当前进入前 10：`rank_entered`
2. 上升至少 5 位，或从前 10 外进入前 10：`heat_rising`
3. 其他绝对变化至少 3 位：`rank_changed`
4. 变化 1-2 位或没有变化：不生成事件

事件 payload 保存：

- `source`
- `platform`
- `region`
- `window`
- `previousRank`
- `currentRank`
- `rankDelta`
- `capturedAt`

payload 不保存凭据、代理或抓取响应正文。

## 历史保留

默认保留 90 天热度历史：

- 只删除 `isCurrent=false` 且早于 90 天的记录
- 每个来源成功同步后，仅清理该来源产生的历史
- 当前快照永不由保留策略删除
- 清理失败不回滚已成功的数据同步，但同步结果记为 `warning`

本阶段暂不把保留天数加入设置 UI，避免扩大配置面；常量集中在服务模块中，后续确有需要再开放。

## API

### GET /api/trending

默认只返回 `isCurrent=true` 的信号，保留现有筛选并增加：

- `movement=new|rising|falling|stable`
- `platform=`
- `region=`

排序规则：

- `new`：当前排名升序
- `rising`：`rankDelta` 降序，再按当前排名升序
- `falling`：`rankDelta` 升序
- 默认：当前排名升序，再按抓取时间降序

### GET /api/media/:id/popularity-history

查询参数：

- `source=` 可选
- `days=1..90`，默认 30
- `limit=1..1000`，默认 300

返回按 `capturedAt` 升序排列的快照，不包含作品主体的重复字段。

### GET /api/media/:id

详情响应中的 `popularitySignals` 只返回当前快照，避免历史增长后详情接口无限膨胀。

## 前端

### 热度榜

保留现有紧凑工作台风格，新增：

- `全部 / 新进 / 上升 / 下降` 标签页
- 来源、平台、类型筛选
- 每行显示来源、当前排名、变化箭头与位数、窗口、采集时间
- 正数使用 teal，负数使用 red，新进榜使用 amber
- 筛选状态写入 URL 查询参数，可刷新和分享

不同来源保持独立行，不把一部作品的多个来源压成一条综合排名。

### 作品详情

新增“热度时间线”区域：

- 默认最近 30 天
- 按来源分组
- 显示日期、排名、变化、数值说明
- 没有历史时只显示当前信号

首版使用可扫描的时间线表格，不新增图表依赖。后续数据密度足够时再评估折线图。

## Netflix Top 10

### 数据来源

使用 Netflix 官方全周 XLSX：

`https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx`

实际字段：

- `week`
- `category`
- `weekly_rank`
- `show_title`
- `season_title`
- `weekly_hours_viewed`
- `runtime`
- `weekly_views`
- `cumulative_weeks_in_top_10`

### 适配规则

新增 `netflixTop10Adapter`，只读取文件中最新周次，覆盖四类榜单：

- `Films (English)` -> `movie / streaming_movie`
- `Films (Non-English)` -> `movie / streaming_movie`
- `TV (English)` -> `series / tv_series`
- `TV (Non-English)` -> `series / tv_series`

热度信号：

- `source = netflix_top10`
- `sourceCategory = official_platform`
- `platform = Netflix`
- `region = GLOBAL`
- `window = week`
- `rank = weekly_rank`
- `value = weekly_views`
- `capturedAt = week` 对应的 UTC 日期
- `valueLabel` 展示观看次数、观看小时和累计入榜周数

作品标题优先使用 `show_title`，`sourceContentType` 保存原始 `category`，有效的 `season_title` 只作为标题别名辅助匹配。首版只允许现有 matcher 的高置信规则自动合并；不确定项创建为 Netflix 来源条目，等待后续 TMDb 同名数据合并，不进行模糊强绑。

### XLSX 解析

后端新增专用 XLSX 解析依赖，只读取第一个工作表并校验必需列。解析错误必须包含缺失列名，但不得记录整个文件内容。

### 同步频率

Netflix 周榜不跟随每小时全量同步：

- 启动时可按现有 `SYNC_ON_START` 执行
- 定时任务每天检查一次
- 同一周重复下载通过 `capturedAt` 幂等处理
- 保留手动同步与连通性测试

来源目录中的 Netflix 从 `planned` 改为 `active`，并开放启用、测试和同步控制。

## 错误处理

- XLSX 下载沿用统一 `SourceHttpClient`、代理策略、10 秒超时和来源级 RateLimiter
- HTTP 错误、XLSX 损坏、缺列、空周次分别分类
- Netflix 失败不影响其他来源调度
- 单条热度写入失败使本次来源同步失败，并保留此前已经确认的当前快照
- 历史清理失败降级为 warning，不伪装成完全成功

## 测试

### 后端

- 两次同步保留两组快照，且只有后一组为 current
- 排名从 12 到 7 时 `rankDelta=5`
- 同一 `capturedAt` 重试保持幂等
- 无热度来源后同步不会把已有 `heatScore` 归零
- 事件阈值和“每快照最多一个事件”
- 90 天保留只删除非 current 历史
- `/api/trending` 只返回 current 并正确筛选 movement
- 历史 API 限制 `days` 与 `limit`
- Netflix XLSX 四类榜单映射、必需列校验和最新周筛选
- Netflix 重复同步同一周不产生重复快照
- 所有 Netflix 请求保持 2 秒最小间隔

### 前端

- 热度标签页与 URL 查询参数一致
- 上升、下降、新进榜状态显示正确
- 来源和平台筛选发送正确 API 参数
- 详情页历史加载、空状态和错误状态
- 桌面与 390px 宽度没有页面级横向溢出

### 全量验证

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

真实验收还需：

- 同步 Netflix 最新官方周榜并记录条数
- 连续两次同步证明同周幂等
- 使用测试数据制造一次上升事件并验证 API 与 UI
- 确认设置页显示 Netflix 为 active，未启用来源不能同步

## 安全与运维

- 不新增任何需要提交的密钥
- Netflix 使用公开文件，但仍遵守统一代理和限频规则
- 所有外部错误继续执行 URL、代理和凭据脱敏
- 数据库变更先在 `whatsnew_test` 执行 `prisma db push`，再应用到本地开发库
- 每个独立任务验证后原子提交

## 官方依据

- Netflix 官方 Top 10 数据：`https://www.netflix.com/tudum/top10/data/all-weeks-global.xlsx`
- TMDb Popularity & Trending：`https://developer.themoviedb.org/docs/popularity-and-trending`
- IMDb Developer 数据产品：`https://developer.imdb.com/documentation`
- JustWatch API：`https://apis.justwatch.com/docs/api`
- FlixPatrol API：`https://flixpatrol.com/about/api`
