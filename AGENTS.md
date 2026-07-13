# WhatsNew 项目规则

## 项目定位

WhatsNew 是独立的全球与中国电影、剧集上新及热度监控项目。PixelReel 只作为配置和数据分层参考，不是本项目的代码基底。

## 目录与职责

- `backend/`：Express、Prisma、来源适配器、同步任务与设置 API
- `frontend/`：React 管理界面，默认端口 `19992`
- `shared/`：前后端共享类型
- `docs/architecture.md`：数据模型、同步流、状态聚合和 API 路由
- `docs/operator-runbook.md`：环境变量、运行命令、调度和排障
- `docs/integration-guide.md`：私有 API 接入示例和错误语义
- `docs/handoff.md`：当前分支、已接入来源和交接清单
- `docs/superpowers/specs/`：已归档的设计规格，只保留历史决策上下文
- `docs/superpowers/plans/`：已归档的实施计划，不作为当前运行状态来源
- `.superpowers/sdd/`：本机执行材料，大部分被 Git 忽略，同样不作为当前运行状态来源

## 开发与验证

```bash
npm run dev:backend
npm run dev:frontend
npm run typecheck
npm test
npm run build
```

后端默认端口为 `19993`。Prisma schema 变更后先执行：

```bash
npm run prisma:generate --workspace backend
npm run prisma:push --workspace backend
```

## 数据与来源约束

- 电影与剧集必须保留明确的 `mediaType`，不得把不同类型合并为同一作品
- 热度信号必须保留来源、平台、地区和时间窗口，不生成无法解释的跨源真实排名
- 所有外部 API 请求必须使用统一限频机制，同一服务连续请求间隔不低于 2 秒
- TheTVDB 只允许免费 project API Key，不接入或回退到付费能力
- Trakt 日历表示发行或播出排期，不等同于流媒体已上架
- demo seed 仅用于显式开发测试，不得作为真实数据同步步骤或生产初始化步骤
- 国内来源先在 `whatsnew_china_sandbox` 验收；沙盒强制关闭调度和全部来源，禁止把沙盒业务数据复制回主库
- 优酷只使用 MTop 独立待播预约节点，爱奇艺只使用 `newOnlinePCW` 待播页；腾讯视频只使用 `getMVLPage` 的频道“即将上线”筛选，电视剧固定 `channel_id=100113, iyear=1`，电影固定 `channel_id=100173, iyear=999`，不得把 `publish_date` 当作腾讯上线日期；芒果TV 当前为 blocked，不得按旧频道首页方案恢复
- 平台页面的语言和地区不得直接推断为作品原始语言或制片国家；缺少作品级字段时保持未知
- 同名作品自动归并必须同时满足媒体类型一致、年份兼容且只有一个外部身份锚点；多个候选身份必须保留分离
- 无外部身份的同名作品只允许在至少两个独立来源同时给出相同媒体类型和精确首发日期时归并
- Prime Video 只使用 About Amazon 官方月度上新文章，必须排除直播体育、音乐和无法可靠判断影视类型的条目；娱乐频道页仅用于发现最新月度文章
- 缺失海报优先复用库内唯一的近期同类型作品，再通过 TMDb ID、唯一严格标题或 Netflix 高置信近期候选补全；外部 ID 冲突和无法拉开置信差距的歧义必须跳过
- 前端影视图片默认通过 `MediaPoster` 的 `srcset` 请求 `/api/media/:id/poster?width=320|640|960`；后端只缩小、不放大并缓存 WebP 变体。爱奇艺 adapter 会把 `iqiyipic.com` 上已知的 `120×160` / `141×188` 竖版缩略图严格规范为 `579×772` 后入库；已有低清图只允许同一稳定爱奇艺来源身份、同一素材 ID 的高清地址替换。豆瓣 adapter 必须把 `doubanio.com` 的 `s_ratio_poster` 规范为同一素材的 `l_ratio_poster`，已有记录也只允许相同稳定豆瓣来源身份和相同素材路径升级。热度页仍保留 direct-first 作为旧数据兜底，其他页面沿用统一代理方案
- 图片可用性与清晰度分开记录；`posterQuality=undersized` 表示实测宽度小于 300 或高度小于 400，只能通过现有严格 TMDb 身份规则替换，不得放宽标题匹配
- 响应式 WebP 缓存默认上限为 512 MB，超过后每日调度按最旧条目清理至 90%；写入不足一小时的临时或孤立文件不得删除
- 图片尺寸验证按热度优先持续消化：小时组最多 20 张，启动同步和日组最多 100 张；网络失败、损坏和尺寸未知项必须遵守既有退避窗口
- 缺图补全必须在图片健康接口中区分尚未尝试、7 天冷却中和可以重试；最近尝试时间只表示严格查询已执行，不表示已经找到可靠匹配
- 图片健康接口和设置页必须分别统计缺图补全与低清替换任务，不能把两类任务的未尝试、冷却中和可重试数量混为一组
- 多 scope 来源的状态必须通过 `aggregateLatestSourceRuns()` 聚合，避免 `/api/sources` 与 `/api/settings` 显示不一致
- 来源健康样本必须与 scope 语义严格对应；例如豆瓣 `popularity` 只能使用 `douban_top`，不得被 `douban_upcoming` 样本代替
- 豆瓣 `/preview` 必须完整返回当前未来及待定档条目，不得用任意固定行数截断页面数据
- 后端启动时会收尾中断遗留的 `running` 同步记录；不要把无 `finishedAt` 的旧运行状态当作真实正在同步
- 调度由 `SCHEDULER_HOURLY_INTERVAL_HOURS` 和 `SCHEDULER_DAILY_TIME` 控制，设置页保存后必须立即停止旧任务并重排后续任务；沙盒始终保持 `SCHEDULER_ENABLED=false`

## 安全红线

- `backend/.env`、代理地址、API Key、Token、Cookie 和数据库凭据不得提交或输出到日志
- 设置 API 只返回敏感字段的配置状态和掩码，不返回明文
- 设置接口没有身份认证，只能部署在可信内网，不得直接暴露到公网
- 本地 `.env` 及备份文件权限保持为 `0600`

## Git

- 当前集成分支为 `codex/whatsnew-mvp`
- Commit 使用 `type: 中文描述`，每次只提交一个独立变更
- 远端为 `https://github.com/zaynzhu/whatsnew.git`
