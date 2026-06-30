# WhatsNew IMDb 缓存状态设计

> 日期：2026-06-30
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：IMDb 第五阶段设计，面向本地缓存可观测性和设置页配置入口

## 背景

IMDb 已经有三段能力：

1. `download:imdb` 可从官方 Non-Commercial Datasets 下载 gzip 文件到 `IMDB_DATASET_CACHE_DIR`。
2. 下载器会写入 `<fileName>.meta.json`，记录 `etag`、`lastModified`、`contentLength`、`bytesWritten` 和 `downloadedAt`。
3. `sync:imdb` 可从本地 gzip 流式读取并只补充当前库已有作品。

现在用户仍需要从命令行判断缓存是否就绪。设置页和数据源页应该直接说明 IMDb 本地缓存状态：目录是否已配置、两个必需 gzip 是否存在、sidecar 是否可读、字节数是否一致、最近下载时间是什么。

## 目标

本阶段完成：

1. 后端新增 IMDb 本地缓存状态服务。
2. `GET /api/settings` 和 `GET /api/sources` 为 IMDb 返回 `localState`。
3. `localState` 不返回真实缓存目录路径，只返回是否配置和文件健康状态。
4. 设置页的 IMDb 配置对话框可以编辑 `IMDB_DATASET_CACHE_DIR`。
5. 设置页和数据源页在 IMDb 行展示本地缓存摘要。
6. IMDb 继续保持 `planned`，不开放网页同步按钮，不加入 scheduler。

## 非目标

本阶段不做：

- 不联网检查 IMDb 官方远端是否有新版本。
- 不在前端添加下载按钮。
- 不让 `sync:imdb` 自动下载。
- 不把 IMDb 标成 active 来源。
- 不新增数据库表或迁移。
- 不回显缓存目录绝对路径。
- 不读取缓存目录之外的文件。

## 方案比较

### 方案 A：本地 sidecar 状态

只读 `IMDB_DATASET_CACHE_DIR` 里的 `title.basics.tsv.gz`、`title.ratings.tsv.gz` 和对应 `.meta.json`。优点是快、无网络依赖、不会泄露代理或请求失败细节，适合设置页频繁刷新。

这是推荐方案。

### 方案 B：每次页面打开都 HEAD 官方远端

可以直接判断本地是否过期，但会让设置页依赖外网、代理和限流，且每次刷新都会打 IMDb 官方地址。

当前不采用。

### 方案 C：把缓存状态写进数据库

同步或下载时写入表，再由 API 读取。优点是查询简单；缺点是需要迁移，且状态可能和磁盘真实文件漂移。

当前不采用。

## 数据模型

在 shared settings 类型中新增：

```ts
export type SourceLocalFileState = {
  fileName: string
  exists: boolean
  sizeBytes: number | null
  expectedBytes: number | null
  downloadedAt: string | null
  lastModified: string | null
  etag: string | null
  issue: "missing_file" | "missing_metadata" | "size_mismatch" | null
}

export type SourceLocalStateView = {
  kind: "imdb_datasets"
  status: "missing_config" | "missing_files" | "partial" | "ready"
  configured: boolean
  readyFiles: number
  totalFiles: number
  files: SourceLocalFileState[]
}
```

并在 `SourceSettingsView` 上增加：

```ts
localState: SourceLocalStateView | null
```

## 后端设计

新增 `backend/src/services/imdbCacheStatusService.ts`：

- 输入 `cacheDir`。
- 若 `cacheDir.trim()` 为空，返回 `status="missing_config"`。
- 只检查 `IMDB_DATASET_DOWNLOADS` 中声明的文件名。
- 对每个文件读取：
  - 正式 gzip 文件的 `stat.size`。
  - sidecar JSON 的 `contentLength`、`bytesWritten`、`downloadedAt`、`lastModified`、`etag`。
- 文件不存在时 `issue="missing_file"`。
- 文件存在但 sidecar 缺失或不可解析时 `issue="missing_metadata"`。
- 文件大小与 `bytesWritten` 或 `contentLength` 不一致时 `issue="size_mismatch"`。
- 文件存在且 metadata 一致时 `issue=null`。

状态聚合规则：

- `missing_config`：缓存目录未配置。
- `ready`：两个文件都存在且 `issue=null`。
- `missing_files`：至少一个文件不存在。
- `partial`：文件都存在，但至少一个文件缺 metadata 或大小不一致。

`createSettingsRouter()` 和 `createSourcesRouter()` 在构建 source view 时调用统一 helper，为 IMDb 附加 `localState`；其他来源返回 `null`。

## 设置字段设计

`SourceDefinition` 增加 `localSettingKeys`，IMDb 配置为：

```ts
["IMDB_DATASET_CACHE_DIR"]
```

设置 API 的 IMDb `fields` 包含：

- `IMDb Base URL`
- `IMDb 数据集缓存目录`
- `IMDb HTTP 代理`
- `IMDb HTTPS 代理`

`IMDB_DATASET_CACHE_DIR` 是非敏感文本字段。API 可以返回已保存值给设置页，但 `localState` 仍不暴露路径。

## 前端设计

### 设置页

在“最近状态”列里显示 IMDb 缓存状态摘要：

- `缓存就绪`
- `缺少缓存目录`
- `缺少缓存文件`
- `缓存需检查`

第二行显示 `readyFiles/totalFiles` 和最近 `downloadedAt`，例如：

- `2/2 文件 · 2026-06-30`
- `0/2 文件`

这一列仍保持紧凑，不新增大卡片。

### 数据源页

IMDb 行在运行状态区域优先显示本地缓存状态。对于 active 来源仍显示最近同步状态；对 IMDb 这种 planned 但有本地能力的来源，显示缓存摘要比“暂无同步”更有解释力。

### 配置对话框

打开 IMDb 配置后可编辑“IMDb 数据集缓存目录”。保存仍走 `/api/settings`，立即生效。

## 安全与错误

- 不输出 `IMDB_DATASET_CACHE_DIR` 真实路径到 `localState`。
- 不读取不在 `IMDB_DATASET_DOWNLOADS` 清单内的文件。
- sidecar JSON 解析失败只显示 `missing_metadata`，不把原始 JSON 内容返回给前端。
- 不输出代理 URL、Token、Cookie、数据库凭据。

## 测试标准

必须覆盖：

- 缓存目录未配置时返回 `missing_config`。
- 两个 gzip 和 metadata 都一致时返回 `ready`。
- gzip 缺失时返回 `missing_files`。
- metadata 缺失或大小不一致时返回 `partial`。
- `/api/settings` 和 `/api/sources` 返回 IMDb `localState`，且响应体不包含缓存目录路径。
- IMDb 配置字段包含 `IMDB_DATASET_CACHE_DIR`。
- 设置页展示 IMDb 缓存状态摘要并可打开配置目录字段。
- 数据源页展示 IMDb 本地缓存状态。

全量验证仍需通过：

- `npm run typecheck`
- `npm test`
- `npm run build`
