# WhatsNew 数据源手动命令提示设计

> 日期：2026-06-30
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：IMDb 管理体验增强，面向“该运行什么命令”的可见提示

## 背景

IMDb 已经有本地缓存下载、缓存状态检查和本地缓存同步能力：

- `npm run download:imdb --workspace backend`
- `npm run sync:imdb --workspace backend`

页面现在能显示 IMDb 缓存是否就绪，但还没有告诉用户下一步该在终端运行什么。直接在网页里执行下载会把 200MB 级大文件、代理、失败重试和长时间任务混到前端交互里，风险偏大。

## 目标

本阶段完成：

1. 数据源目录支持返回只读 `manualCommands`。
2. IMDb 返回下载缓存和同步缓存两个手动命令。
3. 设置页的 IMDb 配置弹窗展示这两个命令。
4. 数据源页的 IMDb 行展示首要命令提示。
5. 命令只作为文本提示，不提供执行按钮。

## 非目标

本阶段不做：

- 不从网页触发 `download:imdb`。
- 不从网页触发 `sync:imdb`。
- 不添加任务队列、日志流、后台进度条或 WebSocket。
- 不把 IMDb 改成 active 来源。
- 不把命令提示用于任何包含 secret 的命令。

## 方案比较

### 方案 A：静态命令元数据

在来源目录里给 IMDb 配置 `manualCommands`，API 透传给前端。优点是简单、可测试、不会引入远程执行风险。

这是推荐方案。

### 方案 B：前端写死 IMDb 命令

前端根据 `source.id === "imdb"` 写死命令。优点是改动少；缺点是 UI 和来源目录会漂移，后续其他本地命令源难复用。

当前不采用。

### 方案 C：网页执行命令

后端提供 `/api/sources/imdb/download` 或 `/api/sources/imdb/sync`。优点是方便；缺点是需要处理长任务、并发、权限、日志、失败恢复和误触确认。

当前不采用。

## 数据模型

新增共享类型：

```ts
export type SourceManualCommandView = {
  label: string
  command: string
  description: string
}
```

`SourceSettingsView` 增加：

```ts
manualCommands: SourceManualCommandView[]
```

IMDb 命令：

```ts
[
  {
    label: "下载或刷新 IMDb 缓存",
    command: "npm run download:imdb --workspace backend",
    description: "从 IMDb 官方 datasets 下载 gzip 到已配置缓存目录"
  },
  {
    label: "同步 IMDb 本地缓存",
    command: "npm run sync:imdb --workspace backend",
    description: "只补充当前库已有作品的 IMDb ID 和评分，不创建陌生作品"
  }
]
```

## 前端设计

### 数据源页

IMDb 行在风险说明下方显示第一条命令：

```text
npm run download:imdb --workspace backend
```

这只是提示，不是按钮。

### 设置页配置弹窗

如果来源有 `manualCommands`，在字段表单下方显示“本地操作”区块：

- 命令标题。
- 命令文本。
- 一句说明。

命令用 `code` 样式展示，不提供复制按钮，避免把交互范围扩大。

## 安全与错误

- `manualCommands` 只能放静态命令，不允许包含 API Key、Token、Cookie、代理地址或数据库凭据。
- 命令文本不会被后端执行。
- 命令提示不改变 `supportsSync`、`supportsEnable` 和 `implementationStatus`。
- 旧客户端忽略新字段也不影响现有来源状态。

## 测试标准

必须覆盖：

- 来源目录里 IMDb 有两条 `manualCommands`。
- `/api/settings` 和 `/api/sources` 返回 IMDb 命令。
- 设置页 IMDb 配置弹窗显示两条命令。
- 数据源页 IMDb 行显示首要命令。
- 没有命令的来源不显示“本地操作”区块。
- `npm run typecheck`、`npm test`、`npm run build` 通过。
