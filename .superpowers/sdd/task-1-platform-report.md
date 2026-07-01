# Task 1 平台共享工具实现报告

## 实现内容

- 在 `backend/package.json` 与 `package-lock.json` 中新增 `cheerio@1.0.0` 依赖，为后续 Hulu、Disney+、Max 平台页面解析准备统一 HTML 解析能力
- 新增 `backend/src/adapters/platformPageUtils.ts`，提供以下共享能力：
  - `PlatformReleaseCandidate`
  - `PlatformAdapterConfig`
  - `cleanPlatformText`
  - `parseEnglishReleaseDate`
  - `candidateToAdapterItem`
- `cleanPlatformText` 同时处理了字面 `&nbsp;`、已解码的 `\u00a0`、重复空白和首尾空格
- `parseEnglishReleaseDate` 支持 `July 1`、`Jul. 9, 2026` 这类英文日期格式，并在缺少年份时使用 `fallbackYear`
- `candidateToAdapterItem` 会：
  - 保留明确 `mediaType`
  - 为平台页面候选项生成稳定 `sourceId`
  - 只产出 release 数据，不生成 `PopularitySignal`
  - 对缺少具体日期或无法判断媒体类型的候选项返回 `null`
- 分类逻辑额外做了词边界匹配，避免把 `Showcase` 这种普通单词误判为 `show`

## 测试结果

- `npm test --workspace backend -- platformPageUtils`：通过，`1` 个测试文件、`4` 个测试全部通过
- `npm run typecheck --workspace backend`：通过

## TDD RED/GREEN 证据

### RED

先新增 `backend/tests/platformPageUtils.test.ts`，再运行：

```bash
npm test --workspace backend -- platformPageUtils
```

结果失败，核心证据：

```text
FAIL tests/platformPageUtils.test.ts
Error: Failed to load url ../src/adapters/platformPageUtils.js
Does the file exist?
```

这说明测试先于实现存在，且失败原因符合预期。

### GREEN

新增 `backend/src/adapters/platformPageUtils.ts` 后再次运行：

```bash
npm test --workspace backend -- platformPageUtils
```

结果通过，核心证据：

```text
✓ tests/platformPageUtils.test.ts (4)
Tests 4 passed (4)
```

中间还经历了一次有效失败：`Showcase` 被误判为 `show`，随后将分类逻辑改成词边界匹配后恢复为全绿。

## 变更文件

- `backend/package.json`
- `package-lock.json`
- `backend/src/adapters/platformPageUtils.ts`
- `backend/tests/platformPageUtils.test.ts`

## 自审结论

- 变更范围控制在任务指定的 4 个文件内
- 没有改动 MySQL schema
- 没有输出或提交 `.env`、代理、API Key、Token、Cookie、数据库凭据
- 保持电影与剧集显式区分，未做跨类型合并
- 首版平台工具未生成 `PopularitySignal`
- 实现与现有 `AdapterItem`、`MediaType`、`ReleaseForm` 对齐，通过了 focused test 与 typecheck

## 疑虑

- 当前模块已安装 `cheerio`，但本任务 brief 没有要求在 `platformPageUtils.ts` 内直接封装 HTML 载入 helper，因此本次只完成依赖铺设与文本/日期/候选项映射工具；后续 Hulu、Disney+、Max 适配器接入时如果需要统一 `load`/DOM 查询辅助函数，再在后续任务补充更合适

## 2026-07-01 Task 1 审查修复记录

### 修复背景

- 审查发现 `sourceId` 仅由 `title + releaseDate + sourceUrl` 组成，电影和剧集在同标题、同日期、同来源页时会碰撞
- 现有词边界分类虽然避免了 `Showcase` 误判，但漏掉了 `Movies`、`Documentaries`、`Specials`、`Shows` 等常见复数标签

### 修复内容

- 调整 `backend/src/adapters/platformPageUtils.ts` 的 `sourceId` 组成，补入已判定的 `classification.mediaType`、`classification.releaseForm` 与规范化后的 `sourceContentType`
- 将分类关键字匹配改成显式正则模式，覆盖以下复数和变体，同时保留严格词边界：
  - `movie|movies|film|films`
  - `documentary|documentaries|docuseries`
  - `series|season|seasons|episode|episodes|show|shows`
  - `special|specials|reality`
- 继续保持 `Showcase` 这种非独立单词不命中 `show`

### 回归测试补充

- 新增同标题同日期同来源页但不同媒体类型时，`sourceId` 必须不同
- 新增 `Documentaries`、`Specials`、`Shows` 标签的分类覆盖
- 新增 `Summer Showcase` 仍返回 `null`，防止 `show` 误判回归

### 测试结果

#### RED

先补测试后运行：

```bash
npm test --workspace backend -- platformPageUtils
```

失败结果符合预期，核心表现：

- 电影与剧集的 `sourceId` 相同
- `Documentaries` 标签未被识别，返回 `undefined`

#### GREEN

修复实现后重新运行：

```bash
npm test --workspace backend -- platformPageUtils
npm run typecheck --workspace backend
```

结果：

- `npm test --workspace backend -- platformPageUtils`：通过，`1` 个测试文件、`6` 个测试全部通过
- `npm run typecheck --workspace backend`：通过
