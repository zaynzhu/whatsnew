# WhatsNew

新片新剧监控情报台，用来追踪全球与中国影视内容的上新、播出、上架和热度变化。

## MVP 范围

- 电影、剧集、动漫、综艺、短剧、纪录片分类型展示
- 展示今日上线、本周新片新剧、热度上升、数据源状态
- 按来源保留 90 天热度历史，展示新进、上升、下降和排名时间线
- 后端使用 Express + TypeScript + Prisma + MySQL
- 前端使用 React + Vite + TypeScript

## 开发

```bash
npm install
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 NAS MySQL 的真实用户名和密码
npm run prisma:generate --workspace backend
npm run prisma:push --workspace backend
npm run seed --workspace backend
npm run sync:tvmaze --workspace backend
npm run sync:tmdb --workspace backend
npm run sync:youku --workspace backend
npm run sync:iqiyi --workspace backend
npm run sync:netflix --workspace backend
npm run dev:backend
npm run dev:frontend
```

前端默认端口 `19992`，后端默认端口 `19993`。

## 系统设置

启动前后端后，通过 `http://127.0.0.1:19992/settings` 管理全局代理、数据源启用状态、单源代理策略、凭据、连通性测试和手动同步。

- 设置持久化到未纳入 Git 的 `backend/.env`，保存成功后立即更新运行时配置，不需要重启服务
- 敏感值不会回填到输入框或通过 API 返回明文，页面只显示掩码
- 全局代理分别支持 `HTTP_PROXY` 和 `HTTPS_PROXY`
- 单个数据源支持 `inherit`（跟随全局）、`direct`（直连）和 `custom`（自定义代理）
- 已接入并可同步的数据源为 TVmaze、TMDb、Trakt、Netflix、优酷和爱奇艺
- 规划中、接入受限和商业接口的数据源只作为目录展示，不能启用或同步

设置接口当前没有身份认证，只适合部署在可信的家庭局域网或 NAS 私有网络中。不要将 `19992`、`19993` 或设置接口直接暴露到公网。

## 热度历史

- 热度信号按 `作品 + 来源 + 平台 + 地区 + 窗口` 保存独立口径，不把不同平台混成一个“真实综合榜”
- 同一来源条目通过稳定的 `sourceId` 关联作品；下一次完整榜单未再出现的信号会转为历史
- `rankDelta = previousRank - currentRank`，正数表示上升，负数表示下降
- 默认保留 90 天非当前快照，当前快照不会被保留策略删除
- `GET /api/trending` 默认只返回当前信号，支持 `movement`、`source`、`platform`、`region`、`mediaType` 等筛选
- `GET /api/media/:id/popularity-history` 支持 1–90 天、最多 1000 条的有界历史查询
- `heatScore` 只取作品各当前来源中的最强排名用于列表排序，页面仍展示原始来源、名次、数值和采集时间

## Netflix Top 10

Netflix 来源读取官方全球全周 XLSX，只同步最新一周的四类榜单：英语电影、非英语电影、英语剧集和非英语剧集，共 40 条当前信号。

- 每日 `09:15`（`Asia/Shanghai`）检查一次，启动同步仍遵循 `SYNC_ON_START`
- 同一周重复同步按来源身份和周次保持幂等
- 下载沿用统一代理设置、10 秒超时和来源级 2 秒限频
- 手动同步：`npm run sync:netflix --workspace backend`

## Trakt

Trakt 公共数据同步只需要配置 `TRAKT_CLIENT_ID`，不需要用户授权凭据。

- 小时级同步趋势榜与期待榜；`watchers` 和 `list_count` 保留为两个来源特定的独立信号
- 日级同步未来 14 天的电影和剧集播出日历
- Trakt 日历只表示电影发行或剧集播出排期，不能证明内容已在某个流媒体平台可用
- 手动同步：`npm run sync:trakt --workspace backend`

## TheTVDB

TheTVDB 只支持免费 project API Key 接入，不会自动回退到任何付费访问方式。

- 仅支持 free-only project API Key；`THETVDB_PIN` 为可选项，不需要时留空即可
- 数据源默认关闭，只有用户显式设置 `SOURCE_THETVDB_ENABLED=true` 后才会参与 daily 同步
- daily updates 读取最近 48 小时重叠窗口，详情补拉最多 40 条记录
- 旧元数据更新不会被当作新的上新标题强行创建
- popularity 不读取 `score`，不会把它算进热度排序
- 只要页面展示了 TheTVDB 提供的数据，就会显示 TheTVDB 来源归属
- 手动同步：`npm run sync:thetvdb --workspace backend`

## 验证

```bash
npm run typecheck
npm run test
npm run build
```

## GitHub remote

等空仓库地址确认后，再执行：

```bash
git remote add origin <github-empty-repo-url>
git push -u origin HEAD
```
