# WhatsNew IMDb 非商业数据集设计

> 日期：2026-06-30
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：按“继续完善项目”的阶段目标落档，第一批实现只做解析和低风险映射基础

## 背景

WhatsNew 当前已经有 `imdbId` 字段和基于外部 ID 的归并逻辑，但 IMDb 来源仍停留在规划状态。IMDb 对本项目的价值不是“再做一个热度榜”，而是补充两个稳定能力：

1. IMDb ID：提高跨 TMDb、Trakt、TheTVDB、TVmaze 的作品归并可靠性。
2. IMDb 评分：作为口碑信号展示，不参与伪综合热度排名。

2026-06-30 使用 `tavily-search-enhanced` 核对官方资料后，确认 IMDb 仍提供 Non-Commercial Datasets 页面；每个数据集是 gzip 压缩的 UTF-8 TSV，首行是表头，`\N` 表示空值。IMDb Developer 也存在商业 API、Bulk Data 和 Meters 产品入口；本项目默认不使用这些商业能力。

## 目标

本阶段完成：

1. 建立 IMDb Non-Commercial Datasets 的解析和映射基础。
2. 支持 `title.basics.tsv.gz` 与 `title.ratings.tsv.gz` 的字段解析。
3. 将 IMDb 标题行映射为 WhatsNew 的 `AdapterItem`，但默认 `createIfMissing=false`，只用于补充已有作品。
4. 将 IMDb 评分映射为 `PopularitySignal` 的口碑信号，来源独立、排名为空、数值为 IMDb 平均分。
5. 为后续流式下载、缓存和手动同步保留清晰接口。

## 非目标

本阶段不做：

- 不接入 IMDb Developer 商业 API。
- 不接入 IMDb Meters、TVMeter、Most Popular 付费或商业数据。
- 不通过 IMDb 全量数据集创建陌生作品库。
- 不把 IMDb 评分计入 `heatScore` 或跨源综合榜。
- 不新增数据库表或 Prisma migration。
- 不在调度器中自动下载大型 IMDb 数据集。

## 数据集范围

第一批只处理：

- `title.basics.tsv.gz`
- `title.ratings.tsv.gz`

`title.basics` 使用字段：

- `tconst`
- `titleType`
- `primaryTitle`
- `originalTitle`
- `isAdult`
- `startYear`
- `endYear`
- `runtimeMinutes`
- `genres`

`title.ratings` 使用字段：

- `tconst`
- `averageRating`
- `numVotes`

空值统一按 `\N` 解析为 `null`。

## 映射规则

### 媒体类型

首批只接受：

| IMDb `titleType` | `mediaType` | `releaseForm` |
| --- | --- | --- |
| `movie` | `movie` | `theatrical_movie` |
| `tvMovie` | `movie` | `streaming_movie` |
| `tvSeries` | `series` | `tv_series` |
| `tvMiniSeries` | `series` | `tv_series` |

不接受：

- `tvEpisode`
- `videoGame`
- `short`
- `tvSpecial`
- `podcast*`
- `isAdult=1`

### 作品字段

- `source=imdb`
- `sourceId=imdb:<tconst>`
- `imdbId=<tconst>`
- `titleDisplay=primaryTitle`
- `titleOriginal=originalTitle`，如果与 `primaryTitle` 相同则仍可保留
- `titleAliases` 包含 `primaryTitle` 与 `originalTitle` 去重后的别名
- `firstReleaseDate=<startYear>-01-01`
- `genres` 来自逗号分隔字段
- `status=unknown`
- `createIfMissing=false`

IMDb 数据集没有平台、地区、真实上线状态；不得生成 `Release`。

### 评分信号

当存在 ratings 行时，生成一个口碑信号：

- `source=imdb_rating`
- `sourceCategory=metadata_rating`
- `platform=IMDb`
- `region=GLOBAL`
- `window=lifetime`
- `rank=null`
- `value=averageRating`
- `valueLabel=<averageRating>/10 · <numVotes> votes`
- `sourceUrl=https://www.imdb.com/title/<tconst>/`

因为 rank 为空，现有 `heatScore` 计算不会把 IMDb 评分当成排名热度。

## 下载与同步设计

大型 IMDb 数据集不进入小时或日级自动同步。后续实现分两层：

1. 解析层：纯函数解析 TSV 和映射 AdapterItem，可在单元测试中用小样本验证。
2. 同步层：后续通过流式下载或本地缓存处理 gzip，不把全量数据一次性加载成大数组。

同步层必须先读取当前库内作品作为目标集合，再从数据集中筛选匹配项。匹配策略优先级：

1. 当前作品已有 `imdbId`，按 `tconst` 精确匹配。
2. 当前作品缺 IMDb ID 时，用标题、年份和媒体类型做候选匹配。
3. 未匹配的 IMDb 行丢弃，不创建新作品。

## UI 与来源状态

IMDb 仍可保持 `planned`，直到同步层具备真实下载、缓存和手动同步能力后再改为 `active`。来源目录继续说明：

- 访问方式：公开非商业数据集。
- 风险：数据集体积大，导入需要缓存和流式处理。
- 信号类型：元数据、口碑。

## 错误与安全

- 不输出下载 URL 中的敏感参数；IMDb 非商业 URL 本身不需要 API Key。
- 解析失败时返回明确行号和字段名。
- 遇到未知列时忽略，遇到缺少必需列时失败。
- 不记录全量原始行，避免日志膨胀。

## 验证标准

- 单元测试覆盖 `\N` 空值、标题类型过滤、成人内容过滤、评分映射和 `createIfMissing=false`。
- 类型检查通过。
- 全量测试和构建通过。

## 外部核对记录

2026-06-30 使用 `tavily-search-enhanced` 核对：

- IMDb Non-Commercial Datasets 官方页面显示数据集为 gzip TSV，UTF-8，`\N` 表示空值。
- IMDb Developer 文档存在 Bulk Data、API、Ratings 和 Meters 等产品入口；这些不作为 WhatsNew 默认 IMDb 接入方案。
