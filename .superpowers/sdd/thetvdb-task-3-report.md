# TheTVDB Task 3 实施报告

## 状态

完成。TheTVDB 已切到 `active` 并注册 daily `updates` 任务，但仍保持 `defaultEnabled=false`；缺少 `THETVDB_API_KEY` 时 `runnable=false`，不会自动启用、不会触发付费回退。

## 修改

- `backend/src/settings/sourceCatalog.ts`
  - 将 TheTVDB 标记为 `active`
  - 开启 `supportsSync` / `supportsEnable`
  - 保持 `defaultEnabled=false`
  - 保持必填 `THETVDB_API_KEY` 与可选 `THETVDB_PIN`
- `backend/src/adapters/adapterRegistry.ts`
  - 注册 `{ sourceId: "thetvdb", scheduleGroup: "daily", adapter: theTvdbAdapter }`
- `backend/src/scripts/syncTheTvdb.ts`
  - 新增单源手动脚本
  - 仅输出 `scope/status/items`
  - disabled、missing credentials、failed 时非零退出
- `backend/package.json`
  - 新增 `sync:thetvdb`
- `backend/src/routes/media.ts`
  - 详情接口返回按来源排序的 `sourceRefs`
- `frontend/src/api/types.ts`
  - 新增 `MediaSourceRef`
- `frontend/src/pages/MediaDetailPage.tsx`
  - 渲染 `数据来源 TheTVDB`
  - 非活跃来源仅在 `历史来源` 中展示
  - release 继续把 `Unspecified` 显示为“平台未提供”
- `frontend/src/utils/sourceLabel.ts`
  - 新增 `thetvdb -> TheTVDB`
- `backend/.env.example`
  - 明确 `THETVDB_PIN`、`SOURCE_THETVDB_ENABLED=false`、`SOURCE_THETVDB_PROXY_MODE=inherit`
- `README.md`
  - 明确 free-only project API Key、默认关闭、48 小时 overlap、40 条详情上限
  - 明确旧 metadata update 不算新标题、忽略 `score`、有 TheTVDB 数据就展示归属、绝不自动付费回退

## TDD 记录

### RED

- `npx vitest run tests/sourceCatalog.test.ts tests/scheduler.test.ts tests/settingsApi.test.ts`（backend）
  - 失败点：TheTVDB 仍是 `planned`，daily registry 未注册
- `npx vitest run tests/pages.test.tsx tests/settingsPage.test.tsx`（frontend）
  - 失败点：详情页未显示 `数据来源 TheTVDB`

### GREEN

- `npx vitest run tests/sourceCatalog.test.ts tests/scheduler.test.ts tests/settingsApi.test.ts`
  - 3 个测试文件通过，17 项测试通过
- `npx vitest run tests/pages.test.tsx tests/settingsPage.test.tsx`
  - 2 个测试文件通过，16 项测试通过
- `npm run typecheck`
  - 通过
- `npm run build`
  - 通过
- `git diff --check`
  - 通过

## 验证边界与 concerns

- 已按要求补写 `backend/tests/api.test.ts` 的 `sourceRefs` 断言，但未运行
- 未运行原因：该测试依赖 MySQL 测试库，而当前 NAS MySQL 不可用
- 未运行 `npm test`，也不会伪称完整测试通过
- 全程未访问真实 TheTVDB 网络，未申请账户、未读取真实 Key/PIN、未改本地 `.env`
- 优酷 / 爱奇艺的用户开关状态未被此任务改写；本轮只调整 TheTVDB 的 catalog 默认值

## 后续完整回归修复

### RED

- `npm test`（backend）
  - MySQL 测试库准备成功
  - 22 个测试文件中 21 个通过、1 个失败；142 项测试中 141 项通过、1 项失败
  - 唯一失败为 `runtimeSettings.test.ts` 的陈旧断言：TheTVDB 激活后，`sourceEnabled("thetvdb")` 按设计返回 `true`

### 修复

- 保留“非 active 来源不受环境变量启用”测试语义，将夹具改为仍处于 `planned` 的 IMDb
- 使用 `SOURCE_IMDB_ENABLED=true`，断言 `sourceEnabled("imdb")` 为 `false`
- 未修改生产代码

### GREEN

- `npx vitest run tests/runtimeSettings.test.ts`（backend）
  - 1 个测试文件通过，15 项测试通过
- `npm test`（仓库根目录）
  - MySQL 测试库准备成功
  - backend 22 个测试文件通过，142 项测试通过
  - frontend 3 个测试文件通过，17 项测试通过
  - `api.test.ts` 13 项测试通过，原 MySQL 不可用的验证边界已解除
