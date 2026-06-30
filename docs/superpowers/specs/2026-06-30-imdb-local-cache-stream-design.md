# WhatsNew IMDb 本地缓存流式同步设计

> 日期：2026-06-30
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：IMDb 第三阶段设计，面向本地缓存 gzip 读取、目标筛选和 CLI 手动同步

## 背景

IMDb 前两阶段已经完成：

1. `title.basics` 与 `title.ratings` 的 TSV 解析和安全映射。
2. 基于当前库作品的目标索引与目标筛选，避免从 IMDb 全量数据集创建陌生作品。

下一步需要把这套纯函数能力接到真实文件上。IMDb 官方 `title.basics.tsv.gz` 当前约 213MB，解压后更大，因此第三阶段不能复用“把整份文本读进内存再解析”的第一阶段 parser。缓存同步必须用 gzip 流式读取，只保存已命中的小集合。

## 目标

本阶段完成：

1. 支持从 `IMDB_DATASET_CACHE_DIR` 指向的本地目录读取：
   - `title.basics.tsv.gz`
   - `title.ratings.tsv.gz`
2. 用 gzip + readline 流式读取 TSV，不把全量数据集读入内存。
3. 先扫描 basics，按当前库目标索引筛出命中行和命中 `tconst`。
4. 再扫描 ratings，只保留已命中 `tconst` 的评分行。
5. 输出 IMDb `AdapterItem[]`，仍保持 `createIfMissing=false`。
6. 增加 CLI 手动同步入口 `npm run sync:imdb --workspace backend`。
7. IMDb 来源继续保持 `planned`，不进入设置页启用、API 手动同步或 scheduler。

## 非目标

本阶段不做：

- 不自动下载 IMDb 数据集。
- 不覆盖或清理用户本地缓存文件。
- 不把 IMDb 注册进 hourly/daily adapter registry。
- 不开放前端设置页的 IMDb 启用开关。
- 不新增 Prisma 表或迁移。
- 不使用 IMDb Developer 商业 API、Meters、TVMeter、Most Popular 或付费 Bulk Data。
- 不把 IMDb 评分计入 `heatScore` 或跨源综合热度。

## 方案比较

### 方案 A：本地缓存 + CLI 手动同步

用户自己把 IMDb gzip 文件放到指定目录，WhatsNew 只负责读取、筛选和写入已有作品。优点是低风险、可在 NAS 上稳定运行、不碰自动下载和网络失败；缺点是用户需要自己更新缓存文件。

这是推荐方案。

### 方案 B：应用自动下载缓存

系统直接下载 IMDb gzip 到缓存目录，再同步。优点是自动化程度更高；缺点是需要处理断点、临时文件、校验、代理和大文件失败恢复，范围明显扩大。

后续阶段再做。

### 方案 C：导入数据库暂存表

先把 IMDb 全量数据导入 MySQL 暂存表，再做 SQL 匹配。优点是查询灵活；缺点是 schema、索引、磁盘占用和清理策略都需要新增设计。

当前不采用。

## 组件设计

### `imdbDatasetStream`

新增流式 TSV 读取模块：

- `streamGzipTsvRows(filePath, requiredFields, mapRow)`：异步产出解析后的行。
- 使用 `fs.createReadStream()`、`zlib.createGunzip()` 和 `readline.createInterface()`。
- 第一行必须是 header。
- 缺少必需字段时抛出 `IMDb TSV 缺少必需字段: <field>`。
- 数据行里的 `\N` 和空字符串继续按 `null` 处理。
- 不记录整行原始内容。

### `imdbDatasetsParser`

保留第一阶段文本 parser，并补充可复用的单行映射函数：

- `imdbTitleBasicsFromParsedRow(row)`
- `imdbTitleRatingFromParsedRow(row)`

这样文本 parser 和流式 parser 共用字段转换规则，避免两套解析逻辑漂移。

### `imdbDatasetTargets`

在第二阶段目标索引上补充匹配提示：

- 对已有 `imdbId` 的候选，仍按 `tconst` 精确匹配。
- 对缺 IMDb ID 的候选，用标题、年份、媒体类型匹配。
- 当标题键命中时，可把当前库候选的 `originalLanguage` 复制到输出 `AdapterItem.media.originalLanguage`，只作为现有 matcher 的匹配提示。
- 这个语言值不是来自 IMDb，不得在 UI 中标成 IMDb 提供。
- 如果候选本身没有 `originalLanguage`，则不制造语言；对应条目可能在持久化时被保守丢弃。

### `imdbDatasetCacheAdapter`

新增 adapter factory：

```ts
createImdbDatasetCacheAdapter({
  cacheDir,
  candidates
})
```

返回 `SourceAdapter<SourceFetchBatch>`：

- `source="imdb"`
- `scope="datasets_cache"`
- `fetchItems()` 读取本地 gzip 文件并返回 `{ items }`
- 不设置 `completePopularitySources`
- 不设置 `completeReleaseSources`

文件缺失时抛出：

- `IMDb 数据集缓存缺少文件: title.basics.tsv.gz`
- `IMDb 数据集缓存缺少文件: title.ratings.tsv.gz`

### `mediaCandidateService`

当前 `sourceSyncService` 内部已有读取 `ExistingMediaCandidate[]` 的私有逻辑。为了 IMDb CLI 在构造 adapter 前拿到目标候选，本阶段把这段逻辑提到：

```ts
loadExistingMediaCandidates(prisma)
```

`sourceSyncService` 复用它，保持行为不变。

### `syncImdb`

新增 CLI：

1. `runtimeSettings.load()`
2. 读取 `IMDB_DATASET_CACHE_DIR`
3. 未配置时输出 `source=imdb status=missing_cache_dir items=0` 并以非 0 退出
4. 读取当前库候选
5. 构造 `createImdbDatasetCacheAdapter({ cacheDir, candidates })`
6. 调用 `runSourceSync(db, adapter)`
7. 输出 `source=imdb scope=datasets_cache status=<status> items=<itemCount>`

## 配置

新增已知配置键：

- `IMDB_DATASET_CACHE_DIR`

该值是本地路径，不是 API key、token 或 cookie，默认不按敏感字段处理。路径仍不应写进仓库。

本阶段不要求 `.env.example` 提供真实路径；可以只文档说明。

## 持久化语义

- `AdapterItem.createIfMissing=false` 继续防止陌生作品创建。
- 精确 IMDb ID 匹配的候选会写入 IMDb source ref 和评分信号。
- 标题键命中的候选会带入候选语言作为 matcher hint，以便现有 `findBestMatch()` 能安全命中。
- ratings 不代表热度排名，`rank=null`，不影响 `heatScore`。
- 本阶段是局部导入，不设置 `completePopularitySources`，避免把旧 IMDb 评分误标为历史。

## 错误与安全

- 缓存目录必须显式配置，不能默认扫描用户目录。
- 文件缺失、gzip 损坏、TSV 缺字段都使本次同步失败，并写入 `SourceSyncRun.status=failed`。
- 错误消息不得包含代理、Token、Cookie 或数据库凭据。
- 不在日志中输出全量原始行。
- 读取本地文件不需要外部 API 限流；本阶段没有外部请求。

## 测试标准

必须覆盖：

- gzip TSV 流式读取可解析 basics 和 ratings 小样本。
- 缺少必需字段时报出字段名。
- 缺少缓存文件时报出固定文件名。
- adapter 只输出命中目标的 IMDb 条目。
- ratings 只附加到命中的 basics。
- 标题键命中时带入候选 `originalLanguage` 作为匹配提示。
- `syncImdb` 未配置缓存目录时返回非 0。
- `sourceSyncService` 改用 `loadExistingMediaCandidates()` 后既有同步测试保持通过。

全量验证仍需通过：

- `npm run typecheck`
- `npm test`
- `npm run build`
