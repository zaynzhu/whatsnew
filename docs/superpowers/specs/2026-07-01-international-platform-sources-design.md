# WhatsNew 国际平台上新源扩展设计

> 日期：2026-07-01
>
> 项目路径：`/Users/zaynzhu/code/claude code/project/whatsnew`
>
> 状态：设计已获用户确认，等待用户审核文档后进入实现计划

## 背景

WhatsNew 已经接入 TVmaze、TMDb、Trakt、TheTVDB、Netflix、优酷、爱奇艺和 IMDb 本地 datasets。Netflix 当前通过官方 Top 10 XLSX 提供稳定平台榜单；Prime Video、Hulu、Disney+、Max、Apple TV+ 仍在来源目录中标记为 planned。

本阶段目标不是把所有平台都立刻变成 active，而是把可解释、可验证、可持续维护的官方来源先落成一批。公开平台页面通常分为三种形态：

1. 官方结构化或半结构化上新页，例如 Hulu Press Schedule。
2. 官方月度文章或新闻稿，例如 Disney+ New to Disney+、WBD Pressroom What's New。
3. 客户端渲染集合页，例如 Prime Video 和 Apple TV 页面。

这些来源不能混用一个语义。月度文章和 press schedule 可以证明“平台宣布此内容上线或将上线”，但不能证明它是平台热榜；客户端集合页如果没有明确排名字段，也不能把展示顺序当作真实 Top 10。

## 已核对事实

2026-07-01 使用 `tavily-search-enhanced` 和本地 HTTP 可达性探测核对：

| 平台 | 可用官方入口 | 本地可达性 | 初步结论 |
| --- | --- | --- | --- |
| Hulu | `https://press.hulu.com/schedule` | HTTP 200，普通 HTML，包含表格 | 首版优先实现，可做上新/排期 |
| Disney+ | `https://www.disneyplus.com/explore/articles/new-to-disney-plus` | HTTP 200，Next.js 页面，文章内容可达 | 首版实现月度文章解析 |
| Max | `https://press.wbd.com/.../whats-new-max-june` 等 WBD Pressroom 月度页 | HTTP 200，普通 HTML | 首版实现月度文章解析 |
| Prime Video | `https://www.primevideo.com/collection/newandupcoming` | HTTP 200，但页面参数、分页和内容偏客户端化 | 作为实验源，不默认启用 |
| Apple TV+ | `tv.apple.com` collection URL | 本地 HTTP 返回 404；Apple TV Press 可达 | 首版暂缓平台集合采集，只保留 planned 或未来 press-only |

Hulu 的 `www.hulu.com/hub/...` 页面在当前网络探测中会跳转到 Disney+ 首页，因此首版不以 Hulu hub 页面作为同步入口。

Apple TV+ 的 `tv.apple.com` collection 在搜索索引里能找到，但当前本地 HTTP 客户端不可达；首版不使用浏览器渲染采集，也不把 Apple TV Press 新闻列表等同于平台上新目录。

## 目标

首版完成：

1. 将 Hulu、Disney+、Max 设计为官方上新/排期来源。
2. 保持 Prime Video 为实验来源，允许后续用 fixture 验证页面结构，但不默认 active。
3. 保持 Apple TV+ 为 planned，更新来源说明，明确 `tv.apple.com` 当前不可作为稳定 HTTP 同步入口。
4. 修正来源口径：首版主要是 `platform_catalog` 和 `release_calendar`，不把这些页面标为 `platform_rank`。
5. 所有外部请求继续走统一 `SourceHttpClient`、代理设置和至少 2 秒限频。
6. 同步失败必须保存真实错误状态，不能把解析失败伪装成成功。

## 非目标

首版不做：

- 不绕过登录、地区限制、App 限制、验证码、DRM 或付费墙。
- 不使用 Playwright/真实浏览器作为后台定时采集依赖。
- 不把 Prime Video 或 Apple TV+ 客户端集合页默认启用。
- 不计算跨平台综合热度。
- 不把 press 新闻稿解析成平台热榜。
- 不改动 MySQL schema；如果实现阶段发现现有 `Release` / `MediaItem` 无法表达官方上新，先停止并补设计，不在同一计划里附带迁移。

## 推荐接入顺序

### 第一批：Hulu、Disney+、Max

这三类官方入口更适合当前架构。

Hulu 使用 `press.hulu.com/schedule`。它是表格型页面，字段包含日期、标题、来源网络或品牌、动作状态等。适合生成：

- `Release`：平台 `Hulu`，地区 `US`，`releasePattern = platform_schedule`。
- `MediaItem`：标题、媒体类型从行文本、栏目或明确标签推断；如果无法判定 `mediaType`，该条不创建新作品，记录为解析跳过项，由 TMDb/IMDb/Trakt 后续补齐。
- 可选 `PopularitySignal`：首版不生成，因为 schedule 不是热榜。

Disney+ 使用 `New to Disney+` 月度文章。它适合生成平台上新和月度排期：

- 从文章标题和段落中提取月份、作品标题、发布日期。
- `platform = Disney+`，地区优先 `US`，如果页面语言或路径明确地区，再写入对应地区。
- 不把文章展示顺序当排名。

Max 使用 WBD Pressroom 的 What's New 月度页。它适合生成 Max 平台月度上新：

- 通过搜索或配置入口找到当前月份或最新月份页面。
- 解析正文中的日期分组和标题列表。
- `platform = Max`，地区由 press URL 推断，首版优先 `US` / `NA`。

### 第二批：Prime Video 实验源

Prime Video 的 `newandupcoming` collection 可以访问，但 URL 中存在动态 `serviceToken`、分页参数和地区化内容。首版设计为实验适配器：

- catalog 状态保持 `planned`，不新增实现状态枚举，不默认 runnable。
- 可写解析器和 fixture 测试，但真实同步入口需要人工确认页面结构稳定后再开放。
- 只输出 `platform_catalog`，不输出 `platform_rank`。
- 失败时返回清晰说明：页面结构变化、地区限制、分页 token 失效或内容为空。

### 暂缓：Apple TV+

Apple TV+ 首版保持 planned：

- 更新 source catalog URL，优先指向可达的 Apple TV Press 新闻页或保留 `tv.apple.com` collection 作为参考入口，但明确当前 HTTP 同步不可用。
- 不接入浏览器渲染采集。
- 不把 Apple TV Press 新闻列表当作上新目录；如果后续做 press-only，只生成 `news_signal`，不生成平台排期。

## 后端架构

新增国际平台源时沿用现有 Netflix/优酷/爱奇艺的边界：

- 每个平台一个 adapter 文件，负责请求、解析和映射 `AdapterItem`。
- 解析器与 HTTP 请求分离，保证页面 fixture 可以单测。
- adapter 只输出事实观察，不做跨源合并决策。
- 合并仍交给 `sourceSyncService` 和 matcher。
- source catalog 负责声明实现状态、信号类型、访问方式、风险说明和测试 URL。

建议新增共享小工具，但不做过度抽象：

- `pressDateParser`：解析英文月份、日期范围和年份。
- `htmlTextExtractor`：基于 `cheerio` 或现有 HTML 解析库提取标题、列表、表格文本。
- `platformSourceMapping`：把平台名、默认地区和默认 `releasePattern` 固化到 adapter 本地常量。

如果项目当前没有 HTML parser，首版实现时优先引入一个小而稳定的解析库，而不是用大段正则解析 HTML。

## 数据映射

### MediaItem

平台上新源只提供有限元数据。首版映射原则：

- `source` 使用平台 source id：`hulu`、`disney_plus`、`max`。
- `sourceId` 必须稳定，建议由平台、标题、日期、来源 URL 组合后 slug/hash。
- `mediaType` 能确定电影、剧集、纪录片或综艺时写入对应枚举；不能确定时跳过该条，不猜测成电影。
- `releaseForm` 按平台流媒体形态映射：电影为 `streaming_movie`，剧集为 `tv_series`。
- `titleAliases` 只保存短别名，不把长描述塞入别名字段。
- `overview` 只使用明确简介，不使用整段新闻稿。

### Release

平台上新最核心的是 `Release`：

- `platform`：`Hulu`、`Disney+`、`Max`。
- `region`：首版默认 `US` 或从 press URL 推断。
- `releaseDate`：能解析到具体日期就写日期；只能确定月份时不生成具体日期 release，避免制造假日期。
- `releasePattern`：`platform_schedule` 或 `platform_new_release`。
- `releaseStatus`：未来日期为 `upcoming`，当天为 `airing_today`，过去为 `available`。
- `sourceUrl`：必须指向原始官方页面。

### PopularitySignal

首版 Hulu、Disney+、Max 不生成热度信号。

第二批 Prime Video 实验计划中，只有页面明确存在 Top/Ranking 文案和稳定 rank 字段时才允许生成 `PopularitySignal`。否则只生成 `Release` 或 `MediaItem`。

## 来源目录调整

实现计划阶段需要更新 `SOURCE_SEMANTICS` 和 `SOURCE_CATALOG`：

- Hulu：`signalKinds = ["platform_catalog", "release_calendar"]`，`access = "public_page"`，状态可从 planned 升到 active。
- Disney+：`signalKinds = ["platform_catalog", "release_calendar"]`，`access = "public_page"`，状态可从 planned 升到 active。
- Max：`signalKinds = ["platform_catalog", "release_calendar"]`，`access = "public_page"`，状态可从 planned 升到 active。
- Prime Video：`signalKinds = ["platform_catalog"]`，保持 planned，风险说明强调客户端化和地区化。
- Apple TV+：`signalKinds = ["news_signal"]`，保持 planned，说明 Apple TV Press 只能作为未来资讯信号候选；首版不设 runnable。

第一批 active 的三个来源默认关闭，由用户在设置页启用后才参与 daily 同步。这样避免刚上线时因为页面结构变化污染数据。

## 调度与手动命令

Hulu、Disney+、Max 首版使用 daily schedule，不加入 hourly。

每个 active 来源提供手动命令：

- `npm run sync:hulu --workspace backend`
- `npm run sync:disney-plus --workspace backend`
- `npm run sync:max --workspace backend`

命令输出只包含 source、scope、status、itemCount、duration，不输出页面正文。

## 错误处理

必须显式处理：

- 官方页面不可达或重定向到错误站点。
- 页面结构变化导致关键字段缺失。
- 页面可达但没有可解析条目。
- 日期无法解析。
- 地区限制或跳转到登录/营销页。

错误写入 `SourceSyncRun.errorMessage` 时沿用现有脱敏策略。对公开 URL 不需要隐藏，但不记录大段 HTML。

如果页面部分解析成功、部分条目失败，首版倾向整体 warning 而不是静默丢弃。实现计划阶段再按每个平台确定 warning 阈值。

## 测试策略

实现阶段必须覆盖：

1. 每个平台解析器的 fixture 单测。
2. 日期解析：完整日期、只有月份、跨月或带年份文本。
3. 空页面、结构变化、非目标重定向。
4. adapter 输出的 `AdapterItem` 字段：`sourceId` 稳定、`mediaType` 不乱猜、`Release` 平台和地区正确。
5. source catalog：状态、信号类型、访问方式、scheduleGroup 和 supportsSync。
6. 手动同步脚本输出。
7. `npm run typecheck`、`npm test`、`npm run build`。

真实同步验证至少包含：

- Hulu Press Schedule 成功解析并同步。
- Disney+ 当前 New to Disney+ 页面成功解析并同步。
- Max 最新可达 What's New press 页面成功解析并同步。
- Prime Video 和 Apple TV+ 在设置页仍不能误启用。

## 实现阶段拆分建议

第一份实现计划只覆盖第一批：

1. 新增 HTML 解析依赖和共享解析工具。
2. 实现 Hulu Press Schedule parser + adapter + 脚本 + catalog。
3. 实现 Disney+ New to Disney+ parser + adapter + 脚本 + catalog。
4. 实现 Max WBD Press parser + adapter + 脚本 + catalog。
5. 更新 README 和设置页提示。
6. 做真实同步验证。

Prime Video 和 Apple TV+ 单独开第二份设计或实现计划，不混在第一批里。

## 风险

- 平台页面文案会随地区和月份变化，fixture 不能替代真实同步验证。
- Disney+ 和 Max 月度文章格式可能不稳定，需要 parser 保守失败。
- Hulu hub 页面当前会跳转到 Disney+，只能依赖 Hulu Press Schedule。
- Apple TV+ 的 `tv.apple.com` 当前 HTTP 不可用，不应硬接。
- Prime Video 页面可能因地区、token、分页策略变化导致解析失败。

## 成功标准

- 设计第一批只开放 Hulu、Disney+、Max。
- 三个 active 来源同步出来的数据都能在 UI 中标注官方来源 URL、平台和地区。
- 不新增无法解释的热度排名。
- 不绕过登录或地区限制。
- Prime Video 和 Apple TV+ 仍清楚展示为未稳定接入。
- 全量验证通过并提交原子 commit。
