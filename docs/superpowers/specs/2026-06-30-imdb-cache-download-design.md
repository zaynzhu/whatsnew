# WhatsNew IMDb 缓存下载设计

> 日期：2026-06-30
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：IMDb 第四阶段设计，面向官方 gzip 手动下载、缓存元信息和失败保护

## 背景

IMDb 第三阶段已经支持从 `IMDB_DATASET_CACHE_DIR` 读取本地 `title.basics.tsv.gz` 与 `title.ratings.tsv.gz`，并通过 `sync:imdb` 把命中的 IMDb 条目补到已有作品。当前仍需要用户自行准备 gzip 文件。

第四阶段补齐“把官方 Non-Commercial Datasets 下载到缓存目录”的能力。2026-06-30 重新核对官方直链：

- `title.basics.tsv.gz` 返回 `200`，`content-length=223538452`，`last-modified=Mon, 29 Jun 2026 12:34:11 GMT`，`etag="52f98a4242139c903ebf2898bec6beac-27"`。
- `title.ratings.tsv.gz` 返回 `200`，`content-length=8530166`，`last-modified=Mon, 29 Jun 2026 12:35:12 GMT`，`etag="ca7b9d2c9320481fd957e7796e33bb84-2"`。

这说明下载器必须按大文件处理，不能把响应一次性读入内存。

## 目标

本阶段完成：

1. 新增手动 CLI：`npm run download:imdb --workspace backend`。
2. 从 IMDb 官方公开直链下载：
   - `https://datasets.imdbws.com/title.basics.tsv.gz`
   - `https://datasets.imdbws.com/title.ratings.tsv.gz`
3. 下载写入 `IMDB_DATASET_CACHE_DIR` 指定目录。
4. 使用临时文件下载，成功后原子替换正式缓存文件。
5. 写入 sidecar 元信息，用于记录 `etag`、`lastModified`、`contentLength`、`downloadedAt` 和实际 `bytesWritten`。
6. 当远端 `etag` 或 `last-modified` 与 sidecar 相同，且本地文件存在时跳过下载。
7. 复用 `SourceHttpClient.request()`，继承统一代理、超时、错误脱敏和同服务限流。

## 非目标

本阶段不做：

- 不把 IMDb 下载注册进 scheduler。
- 不让 `sync:imdb` 默认自动下载。
- 不开放前端按钮。
- 不新增数据库表或 Prisma migration。
- 不实现断点续传或 range resume。
- 不解压校验全量数据。
- 不使用 IMDb Developer 商业 API、Meters、TVMeter、Most Popular 或付费 Bulk Data。

## 方案比较

### 方案 A：手动下载 CLI + sidecar 跳过

提供 `download:imdb` 命令，用户需要时手动刷新缓存。下载器先做 HEAD 元信息检查，若 sidecar 与远端一致则跳过；否则 GET 流式下载到临时文件，成功后替换。

这是推荐方案。它把网络失败和同步入库分开，适合 NAS 私有部署，也避免每次同步都触发 200MB 级下载。

### 方案 B：`sync:imdb` 每次先下载

同步命令自动下载后再入库。优点是一步完成；缺点是每次同步都受网络影响，而且同步失败原因会混合“下载失败”和“数据写入失败”。

当前不采用。

### 方案 C：后台定时下载

加入 daily scheduler 自动刷新缓存。优点是自动化；缺点是 IMDb basics 文件较大，NAS 网络和磁盘策略还没设计完成，失败重试也会扩大风险。

后续阶段再评估。

## 组件设计

### `imdbDatasetDownloader`

新增下载模块，负责：

- 数据集清单：
  - `title.basics.tsv.gz`
  - `title.ratings.tsv.gz`
- 官方 URL 常量。
- 目标路径、临时路径和 sidecar 路径计算。
- `headDataset()` 读取远端 `etag`、`last-modified` 和 `content-length`。
- `downloadDataset()` 用 `SourceHttpClient.request()` GET 响应体，并通过 stream pipeline 写入临时文件。
- `downloadImdbDatasets()` 顺序处理两个数据集，返回每个文件的下载结果。

接口：

```ts
type ImdbDatasetDownloadResult = {
  fileName: string
  url: string
  status: "downloaded" | "skipped"
  bytesWritten: number
  contentLength: number | null
  etag: string | null
  lastModified: string | null
}
```

### sidecar 元信息

每个 gzip 文件旁边写一个 JSON 文件：

- `title.basics.tsv.gz.meta.json`
- `title.ratings.tsv.gz.meta.json`

内容：

```json
{
  "url": "https://datasets.imdbws.com/title.basics.tsv.gz",
  "etag": "\"...\"",
  "lastModified": "Mon, 29 Jun 2026 12:34:11 GMT",
  "contentLength": 223538452,
  "bytesWritten": 223538452,
  "downloadedAt": "2026-06-30T00:00:00.000Z"
}
```

跳过条件：

- 正式 gzip 文件存在。
- sidecar 存在且可解析。
- sidecar 的 `etag` 与远端 `etag` 相同，或 sidecar 的 `lastModified` 与远端 `last-modified` 相同。

如果远端没有 `etag` 和 `last-modified`，不跳过，重新下载。

### 临时文件策略

每次下载写入：

- `<fileName>.download`

流程：

1. 删除旧临时文件。
2. 流式写入临时文件。
3. 如果远端 `content-length` 存在，校验实际写入字节数一致。
4. 校验通过后 `rename()` 替换正式文件。
5. 写 sidecar JSON。
6. 失败时删除临时文件，保留旧正式文件和旧 sidecar。

### 代理与限流

下载器复用：

- `sourceHttpClient.request("imdb", url, ...)`
- `captureSourceProxySettings(settings.view(), "imdb")`

IMDb 来源仍在 catalog 中是 `planned`，但下载命令不经过 `sourceRunnable()`。这允许用户只配置 `IMDB_DATASET_CACHE_DIR` 和代理，就能刷新缓存。

同服务连续请求间隔沿用 `SourceHttpClient` 的 2 秒限流。HEAD 和 GET 都通过同一个 client，因此也会受限流保护。

### CLI

新增：

```bash
npm run download:imdb --workspace backend
```

行为：

1. `runtimeSettings.load()`
2. 读取 `IMDB_DATASET_CACHE_DIR`
3. 未配置时输出 `source=imdb status=missing_cache_dir files=0` 并非 0 退出
4. 调用 `downloadImdbDatasets()`
5. 输出每个文件状态：
   - `file=title.basics.tsv.gz status=downloaded bytes=223538452`
   - `file=title.ratings.tsv.gz status=skipped bytes=8530166`
6. 有任何文件失败则输出 `source=imdb status=failed files=<count>` 并非 0 退出

## 错误与安全

- 不输出代理 URL、Token、Cookie、数据库凭据。
- 下载失败不覆盖旧缓存。
- `content-length` 不一致时报错并删除临时文件。
- 缓存目录必须显式配置，不默认写入项目目录。
- 创建缓存目录使用 `mkdir(..., { recursive: true })`。
- sidecar JSON 不包含敏感信息。

## 测试标准

必须覆盖：

- GET 响应流会写入临时文件并 rename 成正式 gzip。
- 下载成功会写入 sidecar 元信息。
- sidecar 与远端 `etag` 相同且本地 gzip 存在时跳过下载。
- 下载失败时旧正式文件保留、临时文件被清理。
- `content-length` 与实际字节数不一致时报错。
- CLI 未配置 `IMDB_DATASET_CACHE_DIR` 时非 0 退出。
- 下载器调用 `SourceHttpClient.request()`，不使用 `fetchBuffer()`。

全量验证仍需通过：

- `npm run typecheck`
- `npm test`
- `npm run build`
