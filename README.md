# WhatsNew

新片新剧监控情报台，用来追踪全球与中国影视内容的上新、播出、上架和热度变化。

## MVP 范围

- 电影、剧集、动漫、综艺、短剧、纪录片分类型展示
- 展示今日上线、本周新片新剧、热度上升、数据源状态
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
npm run dev:backend
npm run dev:frontend
```

前端默认端口 `19992`，后端默认端口 `19993`。

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
