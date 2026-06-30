# WhatsNew IMDb 缓存与目标筛选同步设计

> 日期：2026-06-30
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：IMDb 第二阶段设计，面向本地缓存、目标筛选和后续手动同步

## 背景

第一阶段已经实现 IMDb Non-Commercial Datasets 的 TSV 解析与 `AdapterItem` 映射。该阶段刻意不接入下载、调度或数据库同步，因为 IMDb 数据集体积较大，直接全量读入内存或直接导入全库都会带来两个风险：

- `title.basics.tsv.gz` 当前响应头显示约 213MB，解压后明显更大，不适合一次性读入内存。
- IMDb 是全量资料源，不是上新榜单；若不先筛目标作品，容易把陌生作品或低置信匹配写入本地库。

2026-06-30 核对官方直链：

- `https://datasets.imdbws.com/title.basics.tsv.gz` 返回 `200`，`content-length=223538452`，`x-amz-meta-run-date=2026-06-29`。
- `https://datasets.imdbws.com/title.ratings.tsv.gz` 返回 `200`，`content-length=8528464`，`x-amz-meta-run-date=2026-06-28`。
- Tavily 限定官方域名搜索没有返回可用结果，因此端点可达性以官方直链响应头为准。

## 目标

本阶段建立一个可测试的同步中间层：

1. 从当前库作品生成 IMDb 目标索引。
2. 对 IMDb `title.basics` 行先做目标筛选，再映射为 `AdapterItem`。
3. ratings 只为已命中的 basics 行补充评分信号。
4. 保持 `createIfMissing=false`，不从 IMDb 全量数据集创建陌生作品。
5. 为后续本地缓存读取、gzip 流式处理和手动同步保留接口边界。

## 非目标

本阶段不做：

- 不注册 IMDb 定时任务。
- 不开放设置页中的 IMDb 启用或同步按钮。
- 不自动下载或覆盖本地 gzip 文件。
- 不新增 Prisma 表或迁移。
- 不使用 IMDb Developer 商业 API、Meters、TVMeter、Most Popular 或付费 Bulk Data。
- 不把 IMDb 评分计入 `heatScore` 或跨源综合榜。

## 方案比较

### 方案 A：目标筛选优先

先读取当前库作品，生成 `imdbId` 精确集合和标题年份媒体类型集合，再筛 IMDb 行。优点是实现小、可测试、不会误创建陌生作品；缺点是暂时不能自动发现全新 IMDb 作品。

这是推荐方案。

### 方案 B：全量导入后靠 `createIfMissing=false` 丢弃

把 IMDb 行先全部映射为 `AdapterItem`，再交给同步服务按现有匹配逻辑处理。优点是改动少；缺点是内存和 CPU 浪费大，且会把“筛选安全边界”藏到同步服务内部。

不采用。

### 方案 C：直接实现下载、解压、手动同步全链路

一次完成缓存下载、gzip 流式读取、目标筛选和同步 API。优点是更接近可用功能；缺点是本阶段验证面过大，容易把下载失败、文件损坏和匹配策略混在一起调试。

后续阶段再做。

## 组件边界

### `imdbDatasetsParser`

保留第一阶段职责：

- 解析 TSV 文本。
- 转换 IMDb 空值。
- 映射单条 basics + rating 为 `AdapterItem`。

该模块不关心数据库、缓存文件和目标集合。

### `imdbDatasetTargets`

新增纯函数模块，负责：

- 接收 `ExistingMediaCandidate[]`。
- 生成 `ImdbTargetIndex`。
- 判断一条 `ImdbTitleBasicsRow` 是否属于当前库目标。
- 将命中的 basics 与 ratings 合成为 `AdapterItem[]`。

目标索引只使用当前库已有信息，不访问数据库。

### 后续缓存同步层

后续再新增文件级同步能力，职责包括：

- 读取 `IMDB_DATASET_CACHE_DIR` 指向的本地缓存目录。
- 校验 `title.basics.tsv.gz` 与 `title.ratings.tsv.gz` 是否存在。
- 使用 gzip 流式读取，不把全量数据一次性加载成数组。
- 把流式命中的行交给 `imdbDatasetTargets`。

## 匹配规则

目标筛选比通用 `findBestMatch` 更保守，按以下顺序判断：

1. 当前库作品有 `imdbId` 时，IMDb 行的 `tconst` 必须精确命中。
2. 当前库作品没有 `imdbId` 时，允许标题、年份和媒体类型匹配。
3. 标题匹配使用现有 `normalizeTitle()`，包含 `titleDisplay` 和 `titleAliases`。
4. 年份匹配使用 `firstReleaseDate` 的前四位和 IMDb `startYear`。
5. 媒体类型按第一阶段 `titleType` 映射结果判断，只接受 movie 与 series。
6. 缺年份、缺标题或 unsupported title type 的行不走弱匹配。
7. 成人内容和 unsupported title type 仍由 `imdbRowsToAdapterItem()` 最终过滤。

这样可以补到“库里已有作品但还没有 IMDb ID”的条目，同时避免仅同名作品误合并。

## ratings 合并规则

ratings 数据集按 `tconst` 建索引，只有 basics 行已经命中目标时才读取对应评分：

- basics 未命中时，ratings 不产生任何输出。
- ratings 存在但 basics 因成人内容或 unsupported title type 被过滤时，不产生输出。
- 输出的评分信号仍保持 `source=imdb_rating`、`sourceCategory=metadata_rating`、`rank=null`。
- 不设置 `completePopularitySources`，避免局部导入时把旧 IMDb 评分误标成历史。

## 配置与 UI

本阶段不新增设置字段。原因是第一批实现只做纯函数目标筛选，不读取真实缓存目录。

后续缓存同步阶段再加入：

- `IMDB_DATASET_CACHE_DIR`
- 设置页只展示目录是否配置，不回显敏感路径以外的凭据。
- IMDb 来源从 `planned` 变为 `active` 的条件是本地缓存读取和手动同步完成，并通过真实小批量验证。

## 错误与安全

- 目标筛选函数不记录原始 IMDb 行。
- 解析错误继续由 parser 抛出明确字段错误。
- 本阶段不处理网络下载，因此不会输出代理、Token 或 Cookie。
- 后续缓存路径只允许读取显式目录，不递归扫描任意用户目录。

## 测试标准

后端单元测试必须覆盖：

- 有 `imdbId` 的现有作品按 `tconst` 精确命中。
- 没有 `imdbId` 的现有作品可按标题、年份和媒体类型命中。
- 同名但年份不同不命中。
- 同名同年但媒体类型不同不命中。
- 未命中 IMDb 行不会产生 `AdapterItem`。
- ratings 只为命中的 basics 行生成评分信号。
- 过滤结果的 `AdapterItem` 继续保持 `createIfMissing=false`。

全量验证仍需通过：

- `npm run typecheck`
- `npm test`
- `npm run build`
