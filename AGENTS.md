# WhatsNew 项目规则

## 项目定位

WhatsNew 是独立的全球与中国电影、剧集上新及热度监控项目。PixelReel 只作为配置和数据分层参考，不是本项目的代码基底。

## 目录与职责

- `backend/`：Express、Prisma、来源适配器、同步任务与设置 API
- `frontend/`：React 管理界面，默认端口 `19992`
- `shared/`：前后端共享类型
- `docs/superpowers/specs/`：已确认的设计规格
- `docs/superpowers/plans/`：历史实施计划，不作为当前运行状态来源

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

## 安全红线

- `backend/.env`、代理地址、API Key、Token、Cookie 和数据库凭据不得提交或输出到日志
- 设置 API 只返回敏感字段的配置状态和掩码，不返回明文
- 设置接口没有身份认证，只能部署在可信内网，不得直接暴露到公网
- 本地 `.env` 及备份文件权限保持为 `0600`

## Git

- 当前集成分支为 `codex/whatsnew-mvp`
- Commit 使用 `type: 中文描述`，每次只提交一个独立变更
- 远端为 `https://github.com/zaynzhu/whatsnew.git`
