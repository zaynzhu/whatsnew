# WhatsNew for Mac 第一版实施计划

状态：已确认方向，等待按里程碑实施
日期：2026-08-15

## 1. 产品结论

WhatsNew for Mac 是现有 WhatsNew NAS 服务的完整原生客户端，不是 WebView 包装，也不在 Mac 上复制后端运行时。

- NAS Docker 继续承载 Express API、来源适配器、定时同步、数据维护和海报处理。
- NAS 上的 MySQL 与持久化缓存继续作为数据底座。
- macOS 客户端只通过一个用户配置的 NAS 基础地址访问 HTTP API 和海报接口。
- NAS 后端继续是唯一 scheduler；Mac 客户端不得启动 Node、连接 MySQL 或执行本地同步任务。
- 现有 React 前端继续作为 NAS 管理后台和兼容入口，不因第一版 macOS 客户端而删除或降级。

## 2. 第一版范围

第一版以当前 React 前端可见能力的完整原生覆盖为边界。开发可以分里程碑完成，但正式交付前必须覆盖下列全部模块。

### 2.1 内容浏览

1. 情报台
   - 今日上线
   - 本周片单
   - 精选作品
   - 当前热度
   - 最近事件
   - 最近来源运行状态
2. 发现
   - 标题、别名、来源和平台搜索
   - 作品类型、发行形态和状态筛选
   - Heat、首发日期和更新时间排序
3. 热度
   - 来源、平台、地区、窗口和榜单范围筛选
   - 当前名次、前次名次、变化和值
   - 同一作品的全部当前来源信号
4. 前瞻
   - 豆瓣未来日期分组
   - 未定档条目
   - 电影、剧集和热门摘要
   - 热门名次与想看人数
   - 豆瓣前瞻手动同步
5. 日历
   - 月视图每日作品计数和代表海报
   - 单日完整排期
   - 作品类型筛选
   - 同一作品的多集、多平台和多来源排期完整保留
6. 作品详情
   - 标题、原名、类型、发行形态、首发日期和状态
   - 海报、简介、国家、语言、类型标签和 Heat
   - Release、当前热度信号、来源引用和变更事件
   - 最近 30 天热度历史

### 2.2 控制中心

1. 数据源目录
   - 分组、实现状态、启用状态、可运行状态和凭据完整性
   - 来源语义、覆盖范围、频率、访问方式和风险说明
   - 最近运行状态与本地文件状态
2. 来源健康
   - passed、degraded、failed、blocked 汇总
   - scope、调度组、时效性、原因、最近成功时间和样本
3. 来源操作
   - 连通性测试
   - 只读数据预览
   - 单来源手动同步
   - 失败来源重新同步
4. 同步记录
   - 来源和状态筛选
   - scope、耗时、条目数和脱敏错误
5. 图片健康
   - 覆盖率、可用状态和清晰度
   - 缺图补全与低清替换的未尝试、冷却和可重试统计
   - 原图与响应式变体缓存统计
   - broken、degraded、missing 和 undersized 高优先级样本

### 2.3 原生设置

1. NAS 连接
   - 首次启动填写 `http://NAS地址:19992` 或 HTTPS 地址
   - 规范化末尾斜杠，拒绝缺少 host 的地址
   - 通过 `GET /api/health` 验证服务身份和环境
   - 保存最近一次验证成功的地址
   - 支持断开并重新配置
2. 全局网络
   - HTTP、HTTPS 代理配置状态
   - 代理连通性测试
3. 内容关注权重
   - 展示说明、当前值和默认值
   - 保存后立即刷新受影响页面
4. 调度
   - 启用状态、强制禁用状态、小时组间隔和日组时间
   - 时区与下次运行时间
5. 单来源配置
   - 启用开关、代理模式、Base URL、普通字段和敏感字段
   - 敏感字段只显示服务端掩码，不读取或缓存明文
   - 支持填写新值或明确清除

## 3. 第一版明确不做

- 不使用 WKWebView 加载现有 React 页面。
- 不在 Mac 内嵌 Node、Prisma、MySQL、Nginx 或 Docker。
- 不创建第二个 scheduler，不提供本地同步 CLI。
- 不改变现有来源匹配、归并、Heat、图片和调度语义。
- 不增加当前 Web 产品没有的收藏、账号、多 NAS 自动发现、菜单栏、通知中心或离线数据库。
- 不直接把现有 TypeScript 共享代码自动生成成 Swift；第一版手工维护所需 Codable 模型，降低构建链复杂度。
- 不把设置接口暴露到公网；第一版仍限定可信局域网。

## 4. 支持环境与技术选型

- 最低系统：macOS 14。
- UI：SwiftUI，必要时使用少量 AppKit 能力打开外部链接和处理窗口行为。
- 并发：Swift Concurrency，所有视图状态更新在 `@MainActor`。
- 网络：`URLSession`，原生请求不受浏览器 CORS 限制。
- 状态：Observation；按 feature 建立小型 view model，不创建单个巨型全局 store。
- 图表：Swift Charts。
- 持久化：`UserDefaults` 只保存 NAS 地址和非敏感 UI 偏好。
- 图片：`URLCache` 配合受限的 `NSCache`，统一请求 `/api/media/:id/poster?width=320|640|960`。
- 第三方依赖：第一版不引入。

局域网 HTTP 由应用 Info.plist 使用 `NSAllowsLocalNetworking`，并提供 `NSLocalNetworkUsageDescription`。不得使用全局 `NSAllowsArbitraryLoads`。如果用户配置公开域名，默认要求 HTTPS。

## 5. 仓库结构

第一版新增独立 `macos/`，不改动现有前后端目录职责。

```text
macos/
├── Package.swift
├── Sources/
│   ├── WhatsNewCore/
│   │   ├── Models/
│   │   ├── Networking/
│   │   ├── Images/
│   │   ├── Persistence/
│   │   └── Presentation/
│   └── WhatsNewMac/
│       ├── App/
│       ├── DesignSystem/
│       ├── Components/
│       └── Features/
│           ├── Connection/
│           ├── Dashboard/
│           ├── Discover/
│           ├── Trending/
│           ├── Preview/
│           ├── Calendar/
│           ├── MediaDetail/
│           ├── Sources/
│           ├── SourceRuns/
│           ├── PosterHealth/
│           └── Settings/
├── Tests/
│   ├── WhatsNewCoreTests/
│   └── Fixtures/
└── Resources/
```

当前机器只有 Command Line Tools，没有完整 Xcode。第一版沿用页匣的开发方式：Swift Package 源码与应用都在当前 GitHub 仓库维护，本机使用 `swift build`、`swift test` 和打包脚本完成开发、验证与 `dist/WhatsNew.app` 构建；GitHub Actions 只执行同一组自动化检查，不上传应用产物。第一版不制作 DMG，不做 Developer ID 签名、公证或 GitHub Release。

## 6. 应用信息架构

使用 `NavigationSplitView`，把内容体验和运维能力清晰分组。

### 浏览

- 情报台
- 发现
- 热度
- 前瞻
- 日历

### 控制中心

- 数据源
- 同步记录
- 图片健康

### 系统

- 设置

全局搜索放在工具栏。列表或海报进入作品详情时使用主内容区导航，不强制打开新窗口。来源原始链接通过系统默认浏览器打开。

## 7. 视觉方向

第一版采用“原生影视情报台”，避免把 Web 管理后台逐像素移植到 Mac。

- 遵循 macOS 侧边栏、工具栏、Inspector、sheet 和 Settings scene 的交互习惯。
- 信息密度高于流媒体消费应用，但主内容仍以海报、时间和信号为视觉中心。
- 使用系统语义色支持浅色与深色模式；强调色只用于 Heat、状态和操作反馈。
- 同一状态在全应用复用一套 badge、图标和颜色语义。
- 海报保持稳定宽高比，列表滚动时不因图片返回造成布局跳动。
- 空状态、首次加载、刷新中、离线、权限不足和服务错误必须有不同表现。
- 控制中心允许较高信息密度，但不得把凭据、代理和危险写操作放在内容首页。

## 8. API 覆盖矩阵

| 原生模块 | 方法与接口 | 第一版用途 |
|---|---|---|
| 连接 | `GET /api/health` | 验证 NAS 地址、环境和服务身份 |
| 情报台 | `GET /api/dashboard` | 首页全部内容 |
| 发现 | `GET /api/media` | 搜索、筛选和排序 |
| 详情 | `GET /api/media/:id` | 作品全部详情 |
| 热度历史 | `GET /api/media/:id/popularity-history` | 30 天 Swift Charts |
| 海报 | `GET /api/media/:id/poster?width=` | 原生图片加载 |
| 热度 | `GET /api/trending` | 当前来源信号与筛选 |
| 日历 | `GET /api/calendar` | 月摘要与单日完整排期 |
| 前瞻 | `GET /api/preview` | 豆瓣前瞻完整内容 |
| 前瞻同步 | `POST /api/preview/sync` | 手动刷新豆瓣前瞻 |
| 数据源 | `GET /api/sources` | 来源目录与状态 |
| 来源健康 | `GET /api/source-health` | scope 健康详情 |
| 同步记录 | `GET /api/source-runs` | 运行日志筛选 |
| 来源测试 | `POST /api/sources/:source/test` | 单源连通性测试 |
| 来源预览 | `POST /api/sources/:source/preview` | 只读采集预览 |
| 来源同步 | `POST /api/sources/:source/sync` | 单源同步和失败重试 |
| 图片健康 | `GET /api/poster-health` | 图片质量与缓存健康 |
| 设置读取 | `GET /api/settings` | 代理、调度、来源和权重 |
| 设置保存 | `PUT /api/settings` | 原子更新与清除字段 |
| 代理测试 | `POST /api/settings/proxy/test` | 全局代理连通性 |

第一版不调用没有出现在当前 Web 界面中的隐藏维护脚本或批量修复 CLI。

## 9. 网络与模型层

### 9.1 `ServerProfile`

- 保存用户输入和规范化后的基础 URL。
- 只接受 `http`、`https`。
- 删除 query、fragment 和末尾多余斜杠。
- `http` 只允许局域网主机、IP、`localhost`、无点短主机名或 `.local`。
- 首次成功连接前不覆盖上一个可用配置。

### 9.2 `APIClient`

- 由 `ServerProfile` 构造所有 URL，feature 不自行拼接 host。
- GET、POST、PUT 使用同一个 JSON 编解码和错误映射入口。
- POST、PUT 统一发送 `Content-Type: application/json`。
- 超时、离线、HTTP 状态、服务端错误代码和模型解码失败分别呈现。
- 日志不得输出设置请求体、Cookie、Token、代理地址或完整敏感 URL。
- 支持注入 `URLSession`，便于测试。

### 9.3 Codable 模型

- 模型字段严格覆盖当前响应，不凭空增加服务端语义。
- 服务端自由文本状态第一版优先保留为 `String`，由 Presentation 层映射显示，避免未知状态导致整个响应解码失败。
- ISO 8601 时间在模型层保留原始值，并由共享格式化器生成本地日期和相对时间。
- 所有可空字段保持 optional，不用空字符串伪造缺失值。

## 10. 状态与交互规则

- App 级只保存连接状态、当前 `ServerProfile` 和全局刷新信号。
- 每个 feature 自己拥有 idle、loading、loaded、empty、failed 状态。
- 页面重新出现时显示现有内容并后台刷新，不先清空界面。
- 用户主动刷新显示明确进度；自动刷新不打断当前浏览位置。
- 写操作必须禁用重复提交，并显示服务器返回的真实错误语义。
- 来源同步、预览和测试完成后只刷新相关数据，不全应用重载。
- 设置保存成功后重新读取 `/api/settings`，确认服务端有效状态。
- 连接中断时保留当前只读内容，同时在工具栏显示离线状态和重试入口。

## 11. 安全边界

- 第一版只面向可信家庭局域网；设置页必须明确提示当前服务没有身份认证。
- App 只连接用户确认的单一 NAS 基础地址，不跟随跨 host API 重定向。
- 来源 `sourceUrl` 只能交给 `NSWorkspace` 打开，不能当 API 地址使用。
- 敏感字段只在用户编辑期间存在于内存，不写入 `UserDefaults`、日志或错误报告。
- 清除敏感字段必须由明确操作加入 `clearKeys`，不能因为输入框为空自动清除。
- App 不直接访问 MySQL、缓存目录、Docker socket 或 NAS 文件系统。
- Mac 客户端不得提供启动本地 scheduler 的代码路径。

## 12. 性能目标

以下是第一版验收目标，不是当前成品实测值。

- 冷启动到连接页或已保存地址的主界面骨架不超过 2 秒。
- 普通浏览物理内存目标低于 150 MB。
- 大量海报滚动后的稳定物理内存目标低于 250 MB。
- 首屏只请求可见及邻近海报，离屏任务可以取消。
- 月历先请求 summary，再请求选中日期的完整数据。
- 图片只请求最接近显示尺寸的 320、640 或 960 变体，不下载原图。
- 页面切换不重复创建独立 `URLCache` 或无限增长的图片任务。

## 13. 实施里程碑与验证

### M0：计划与工具链基线

工作：

- 固化本计划。
- 核对 Swift、SwiftUI 和 Command Line Tools 可用性。
- 明确第一版不依赖完整 Xcode。

验证：

- Markdown 格式检查通过。
- 工作树只包含计划文档。

提交：`docs: 添加 macOS 第一版实施计划`

### M1：客户端基础设施

工作：

- 建立 Swift Package、Core target、App target 和 Tests target。
- 实现 `ServerProfile`、连接持久化、`APIClient`、API 错误和时间格式化。
- 实现全部 Codable API 模型。
- 完成首次连接页和基础 App shell。

验证：

- 地址规范化、非法地址、健康检查和不覆盖旧配置测试通过。
- 核心 JSON fixtures 全部解码通过。
- `swift build`、`swift test` 通过。

提交：`feat: 建立 macOS 原生客户端基础`

### M2：内容浏览

工作：

- 实现情报台、发现、热度、前瞻、日历和作品详情。
- 实现海报加载、占位状态、筛选、搜索和热度历史图表。
- 接入前瞻同步。

验证：

- 每个模块至少有成功、空数据和失败 fixture 测试。
- 海报 URL 只使用 NAS 代理宽度接口。
- 所有导航都能到达并返回。
- `swift build`、`swift test` 通过。

提交：`feat: 完成 macOS 内容浏览功能`

### M3：控制中心

工作：

- 实现数据源、来源健康、同步记录、图片健康。
- 实现来源测试、预览、同步与失败重试。

验证：

- 同步中的按钮不可重复提交。
- 预览明确显示 `persisted=false`。
- 错误信息保持服务端脱敏结果。
- `swift build`、`swift test` 通过。

提交：`feat: 添加 macOS 数据控制中心`

### M4：完整设置

工作：

- 实现全局代理、内容权重、调度和单来源配置。
- 实现敏感字段更新与明确清除。
- 实现代理连通性测试。

验证：

- 设置 payload 只包含用户明确修改的 values 和 clearKeys。
- 敏感值不进入持久化与日志。
- 保存后 readback 与服务端一致。
- `swift build`、`swift test` 通过。

提交：`feat: 完成 macOS 原生设置管理`

### M5：视觉、无障碍与性能验收

工作：

- 统一布局、层级、状态色、占位、错误和空状态。
- 验证浅色、深色、窗口缩放、键盘导航和 VoiceOver 标签。
- 测量首屏、滚动和页面切换内存。

验证：

- 从本地 `.app` 启动后逐页截图验收。
- `footprint` 与系统进程采样达到第 12 节目标，或记录真实差距。
- 所有交互可通过键盘完成。

提交：`style: 完善 macOS 原生界面体验`

### M6：本地应用打包与 GitHub 检查

工作：

- 增加 `scripts/build-macos-app.sh`，用 Release 可执行文件、Info.plist 和图标组装 `dist/WhatsNew.app`。
- 使用本地 ad-hoc 签名生成仅供本人使用的 Apple Silicon 应用。
- GitHub Actions 在标准 macOS runner 执行 Swift 构建、测试和 Release 检查。
- 工作流保持只读，不使用 Secret，不上传 `.app`，不创建 DMG 或 GitHub Release。

验证：

- `codesign --verify --deep --strict` 通过。
- `open "dist/WhatsNew.app"` 可启动并连接 NAS。
- GitHub Actions 与本地核心检查通过。
- 构建与运行全程不依赖完整 Xcode。

提交：`build: 添加 macOS 本地应用打包`

## 14. 测试矩阵

| 层 | 必测内容 |
|---|---|
| URL | IP、端口、短主机名、`.local`、HTTPS、末尾斜杠、非法 scheme、query 和 fragment |
| 网络 | 200、204、400、404、409、429、500、超时、断网、非 JSON 和解码失败 |
| 连接 | 正确服务、错误服务、服务不可达、沙盒环境、保留上一个可用地址 |
| 模型 | Dashboard、Media、Trending、Calendar、Preview、Sources、Health、Runs、PosterHealth、Settings |
| 图片 | 320、640、960 选择、取消、失败占位、缓存和重复请求合并 |
| 写操作 | 来源测试、预览、同步、前瞻同步、设置保存、字段清除和代理测试 |
| 安全 | 敏感字段不持久化、不日志输出、不在错误信息中回显 |
| UI | loading、empty、loaded、failed、offline、浅色、深色、窄窗口和全屏 |

## 15. 主智能体与 lunara 分工

### 主智能体负责

- 架构与第一版范围判断。
- 本计划与每个里程碑的明确编码步骤。
- 审查 `lunara` 的全部改动。
- 运行构建、测试、live API 对照、视觉和内存验收。
- 处理测试失败、Bug、诊断、安全判断和最终提交。

### lunara 负责

- 只在用户本次明确授权下编写 M1–M4 的新功能代码。
- 严格限定在 `macos/`，除非主智能体明确指出一个必需的后端契约改动。
- 不修改现有后端业务语义、React 前端、Docker、部署文件和用户已有改动。
- 不自行处理 Bug 修复、失败测试、架构变更或最终验收。

## 16. 完成定义

第一版只有同时满足以下条件才算完成：

1. 原生客户端能通过用户填写的 NAS 地址连接当前 Docker 服务。
2. 当前 React 前端全部可见内容和操作都能在 SwiftUI 中到达。
3. 所有写操作仍由 NAS API 执行，Mac 不存在本地服务或 scheduler。
4. 敏感设置不落地到 Mac，错误和日志不泄露凭据。
5. `swift build`、`swift test` 和现有 `npm run typecheck`、`npm test`、`npm run build` 通过。
6. 本地 `.app` 完成逐页视觉、无障碍和内存验收。
7. ad-hoc 签名、本地启动与 GitHub Actions 检查通过。
