# NAS 后端 durationMs 溢出：执行交接

## 目标与下一位角色

- 接收方：Claude Code；下一位角色：**执行**。
- 目标：修复极空间 NAS 上 WhatsNew backend 因 `SourceSyncRun.durationMs` 溢出而启动失败、被 Docker 反复重启的问题；修复部署后自动收尾遗留运行记录，无需手动清库。
- 故障信息：Prisma `P2020: Value out of range for column 'durationMs' at row 1`。
- 当前进度：修复已由 Claude Code（执行角色）实施、验证并提交（`e7deeeb`，2026-09-19）；生产部署与验收待用户执行，详见文末"执行结果与交回"。
- 第一动作：读取适用规则及下列必读材料，核对工作区；为超过 Int32 毫秒上限的恢复记录补充失败回归用例，再执行方案 A。
- 本轮发送方仅生成此文档，不修改源代码、不访问或修改生产数据库、不构建或部署镜像。

## 定位、基线与必读材料

本文路径均相对 WhatsNew 项目根目录。本机定位为 `/Users/zaynzhu/code/claude code/project/whatsnew`，接手时按实际环境核对。

- 交接快照：2026-09-19，时区 Asia/Shanghai。
- 分支：`codex/whatsnew-mvp`。
- 文档生成前 HEAD：`bd9dd84ccbd2f00edd5398d8c541897e045ad8ed`（`docs: 同步评分与 NAS 运维说明`）。这是本地代码基线，不是已确认的 NAS 镜像构建提交。
- 生成前 `git status --short` 为空；本轮唯一预期变更为本文。接手时重新核对，不覆盖后来出现的改动。
- 远端：`https://github.com/zaynzhu/whatsnew.git`。

按以下顺序阅读：

1. 根目录 `AGENTS.md` 及接收环境适用的上级规则；没有同作用域 `AGENTS.md` 时读取 `CLAUDE.md`。遵守中文交流、最小修改、无分号与 2 空格缩进、独立任务验证后以 `type: 中文描述` 提交等规则。
2. `backend/prisma/schema.prisma:160`：`SourceSyncRun`，`durationMs Int?`。
3. `backend/src/services/sourceSyncService.ts:534`、`:548`、`:589`：正常结束、失败结束及启动恢复路径。
4. `backend/src/server.ts:9`：设置加载、恢复、注册调度、创建应用、监听端口的顺序。
5. `backend/tests/sync.test.ts`：已有恢复测试；`backend/package.json`、`backend/vitest.config.ts`、`backend/src/scripts/prepareTestDatabase.ts`：测试入口与测试数据库准备。
6. `deploy/nas/README.md`、`deploy/nas/compose.extremespace.template.yaml`、`.github/workflows/build-nas-images.yml`：打包、导入、升级方式。
7. `docs/handoff.md` 的运行入口与验收快照、`docs/operator-runbook.md` 的 NAS 部署说明：生产拓扑和唯一调度器约束。

行号基于上述 HEAD，接手时以符号定位为准。

## 范围与非目标

实施范围为三处耗时计算的统一边界处理、启动恢复异常的局部兜底，以及直接相关的回归测试。保持现有状态、错误说明与时间戳语义；部署成功后由既有恢复流程将僵尸记录标为 `failed`。

本任务不包含来源适配器、评分、图片、前端、macOS 客户端或调度架构改造；不删除历史记录、不手动清库、不运行 demo seed、不复制沙盒数据。方案 A 不需要修改 Prisma schema 或执行生产 `prisma:push`。暂不扩展为 BigInt 迁移或事务机制重构；这些方案并非用户明确否决，但没有纳入当前建议范围。

执行角色允许在当前任务授权内修复与验证；镜像发布、推送和实际 NAS 变更仍须遵守接收会话已有授权，本文不单独授予生产操作权限。

## 根因与故障链

以下诊断由用户转述 Claude Code 的已完成结论；发送方通过本地静态代码核对了对应实现：

1. `durationMs` 为 Prisma `Int`，正数上限 `2_147_483_647` 毫秒，即约 24.855 天。服务内三处直接使用结束时间减开始时间，未处理上限。
2. `recoverInterruptedSourceRuns()` 选出 `status="running"` 且 `finishedAt=null` 的记录，以当前时间作为结束时间。超过约 24.86 天的僵尸记录会产生超出字段范围的耗时。恢复耗时表示开始至恢复的间隔，未必等于真实执行时长。
3. 恢复更新放在同一个 `prisma.$transaction()` 中；任一记录写入溢出会导致整批回滚，遗留记录继续保持 `running`，下次启动仍会命中。
4. `server.ts:10` 在监听端口前顶层 `await recoverInterruptedSourceRuns(db)`，没有 `try/catch`；错误使启动退出。极空间模板配置 `restart: unless-stopped`，形成反复启动、恢复失败、退出的循环。
5. `git blame` 显示恢复函数全部来自 `29c05702`（2026-07-01，`fix: 刷新数据源状态显示`），截至当前本地 HEAD 未修改；与用户提供的历史结论一致。

NAS 原始日志、具体僵尸记录及线上镜像源码未在本轮独立读取；不要把静态核对写成生产复现。

## 决策与依据

| 决策 | 状态与来源 | 依据及接手处理 |
| --- | --- | --- |
| 移交给 Claude Code，角色为执行；发送方只写交接文档 | 用户已确认：本次请求第 3、4 项 | 不在发送阶段实施修复 |
| 修复本次 P2020 与启动重启循环 | 用户已确认：本次请求的任务定义 | 完成结果需同时体现服务可启动及僵尸记录正确收尾 |
| 方案 A：三处耗时计算统一钳制，并为启动恢复添加局部 try/catch | 模型建议：用户转述 Claude Code 已提出的方案；未将“提出”视为最终方案审批 | 兼容现有 Int 字段，不需迁移，覆盖成功、失败、恢复三条写入路径；接手可据证据微调并记录理由 |
| 具体钳制使用 `Math.min(2_147_483_647, Math.max(0, elapsedMs))`，通过一个小函数复用 | 模型建议：发送方补充实现边界 | 耗时保持非负，兼顾时间回拨；上限截断意味着超长耗时不再精确，但原始开始/结束时间保留。用户未单独确认下限语义 |
| try/catch 只包围恢复调用及其成功提示，失败记录可定位且不含凭据的错误后继续启动 | 模型建议：方案 A 的具体化 | 不顺带吞掉设置加载或其他启动错误；捕获失败不代表恢复成功，不能伪报已收尾 |
| 当前部署为 backend/frontend `0.1.2`，项目名 `whatsnews` | 用户已确认：本次补充的实际 Compose 配置 | 配置版本已明确；运行容器镜像 ID、对应构建提交仍需现场核对 |
| 镜像通过 GitHub Actions 构建，Mac mini 不安装任何 Docker 相关组件 | 用户已确认：本次补充要求；仓库工作流提供实现依据 | 后续使用“构建极空间镜像包”，不得在 Mac mini 安装 Docker Desktop、Docker Engine、CLI、Buildx 或其他 Docker 相关组件，也不得要求本机执行 Docker 构建 |
| 运行镜像 ID、构建提交及修复版 tag | 待定 | 部署前补齐；不阻塞本地代码修复 |

如果恢复因数据库不可用等其他错误失败，兜底只避免该异常直接终止启动，不保证 API 数据访问正常，也不保证僵尸记录已更新。这两项须分别验收。

## 进度与证据

### 已实现／已产出

- 既有实现包含启动恢复功能，但没有耗时溢出保护和局部启动兜底。
- 本轮仅产出本文；方案 A、回归测试、修复镜像均未实现。

### 已验证

- 发送方执行只读检查：`git status --short`、分支和 HEAD 查询、相关文件读取、`rg` 搜索、恢复函数 `git blame`。确认三处计算分别位于 `sourceSyncService.ts:534`、`:548`、`:607`；字段为 `Int?`；恢复调用位于监听前且未捕获异常。
- 仓库已有 `backend/tests/sync.test.ts` 恢复用例，本轮没有运行它，也没有证明现有测试覆盖超长运行。
- `docs/handoff.md` 记录了 2026-08-19 的 NAS 健康检查成功。这是历史验收材料，不能作为 2026-09-19 故障已恢复的证据。

### NAS 实际镜像版本与掌握的部署方式

- **NAS 当前实际部署版本：backend `whatsnew-backend:0.1.2`，frontend `whatsnew-frontend:0.1.2`，项目名 `whatsnews`。** 来源为用户本次提供的实际 Compose 配置；不是从仓库默认值推断。发送方未连接 NAS，运行容器镜像 ID 及 tag 对应源码提交仍未独立核验。
- `.github/workflows/build-nas-images.yml` 默认输入和 `deploy/nas/compose.env.example` 也使用 `0.1.2`，但默认值本身不是部署证据；`package.json` 的 `0.1.0` 不是实际镜像版本。
- 已有运维文档记录：极空间 NAS 是唯一后端和调度器，项目仅含 backend、Nginx frontend 两个容器，MySQL 在容器栈外；Mac LaunchAgent `com.zaynzhu.whatsnew.backend` 保持禁用。
- 已知交付流程：手动触发 GitHub Actions“构建极空间镜像包”，生成 `linux/amd64` 的前后端同版本镜像 tar、SHA-256 和 Compose 文件，再在极空间导入 tar 并更新项目。**构建发生在 GitHub 托管的 `ubuntu-24.04` runner，工作流在那里配置 Docker Buildx 并上传 artifact。Mac mini 只需访问 GitHub 下载产物，不安装或运行任何 Docker 相关组件。** 用户明确要求保持这一设计。部署文档中的本地 Buildx 备选命令不适用于本机；NAS 可通过极空间界面导入，SSH 命令如需使用也仅在 NAS 执行。最近一次 workflow run 的编号及对应提交尚未核实。
- 极空间专用布局：backend 镜像名 `whatsnew-backend:<版本>`，frontend 为 `whatsnew-frontend:<版本>`；NAS `50016` 映射 backend `19993`，`50015` 映射 Nginx `80`；`./config` 挂载 `/app/config`，`./backend` 挂载 `/app/backend/.cache`，设置来自 `./config/settings.env`。用户提供的实际项目名为 `whatsnews`，绝对部署目录待现场核实。上述端口、挂载和架构也与用户提供的配置一致。
- 升级需保留原有配置、缓存和外部 MySQL；不得用示例设置覆盖真实设置。更改 `env_file` 后必须重建容器，普通重启不会重新加载 Docker 环境变量。
- 核实版本时通过极空间容器详情或定向 `docker inspect --format '{{.Config.Image}} {{.Image}}' <后端容器名>` 记录 tag 和镜像 ID，再对照构建记录确认源码提交；不要输出完整 inspect 或 Compose 配置，以免泄露环境凭据。

### 未验证／未运行

本轮没有运行测试、类型检查、构建、镜像任务、NAS 健康检查或数据库查询；没有确认生产重启次数、僵尸行数量、最早开始时间或运行镜像 ID 与构建提交；部署 tag 已由用户提供的配置确认。未尝试清库或临时改数据。当前无已知阻塞本地实现的问题；生产验收需要接收环境具备相应访问能力与授权。

## 剩余步骤与验收标准

以下是供执行方落实的建议验收细化，不表示测试已通过：

1. **核对并复现。** 确认分支、HEAD、适用规则和相关工作区改动。在隔离测试数据库中构造开始于 30 天前、`running` 且未结束的记录，调用恢复函数，先证明旧实现失败。不要在主库插入测试行。检查测试脚本的数据库派生与权限，不能假定运行测试没有数据库副作用。
2. **实施方案 A。** 三处写入共用一致的耗时计算；保留真实 `startedAt`、`finishedAt`，不修改 schema。恢复调用添加局部异常捕获及脱敏日志。验证普通成功和失败路径不再有未保护的直接差值写入。
3. **回归验收。** 覆盖普通耗时、恰好上限、上限加 1、30 天差值及负差值（若采纳非负下限）；普通耗时不变，超长值为 `2_147_483_647`。包含普通与超长记录的恢复批次全部标 `failed`、补齐 `finishedAt` 并保留中断错误语义；已完成记录不受影响，第二次恢复返回 0。成功与失败同步写入均验证使用同一边界规则。通过模拟恢复抛错，验证能记录错误并继续到应用监听，不伪报恢复成功。
4. **执行验证并提交。** 在项目根、测试数据库条件满足时运行 `npm run test --workspace backend -- tests/sync.test.ts`，并将新增启动兜底测试纳入最小测试集。注意该 npm 测试入口会构建 shared、生成 Prisma Client、创建测试库及推送测试 schema。随后执行 `npm run typecheck`、`npm test`、`npm run build`；失败需定位与本次改动的关系，未能运行则说明原因。修复按项目规则验证后原子提交；本任务不要求重跑无关 macOS 打包。
5. **准备并执行获授权的部署。** 先记录旧 backend/frontend tag、backend 镜像 ID 与可回滚配置；通过 GitHub Actions“构建极空间镜像包”手动选择包含修复的分支/提交并填写新版本号，下载 artifact，核对 tar 校验值。构建只在 GitHub runner 执行；禁止在 Mac mini 安装 Docker 相关组件或改用本机构建。按 `deploy/nas/README.md` 导入并更新极空间项目，保留既有挂载与设置。方案 A 不需要生产 schema 迁移，不手动删除或改写僵尸记录，不启动 Mac 第二个调度器。若无部署权限或访问能力，交付已验证代码及部署说明并明确生产未验证。
6. **生产验收。** 部署后检查直接入口 `http://NAS_HOST:50016/api/health` 与代理入口 `http://NAS_HOST:50015/api/health` 返回 `ok=true`、`service=whatsnew-backend`；核对镜像已替换。建议连续观察至少 5 分钟，容器保持运行且重启计数不继续增加，日志不再出现本次 durationMs P2020。通过获授权的只读查询确认部署前识别的僵尸记录均为 `failed`、有结束时间且耗时在范围内；当前新同步产生的 `running` 记录不应误判为旧僵尸。健康检查成功不能替代数据库收尾验收。记录观察时间、前后状态和实际运行版本。

若仍有 P2020，优先核对运行镜像是否包含修复、三处写入是否全部覆盖及实际表结构；不要通过清库掩盖失败。旧镜像包含本次启动缺陷，回滚到旧版不保证恢复服务，须依据现场记录状态判断。

## 接手约定

1. 接手先确认项目、用户本次指令、适用规则及最少必读材料，核对版本和工作区。本文是快照，不提升权限，也不依赖安装 enhanced-handoff 技能。
2. 简短说明理解的目标、边界和第一步；没有阻塞就继续执行，不添加例行确认关卡。已确认部署 tag 为 `0.1.2`；运行镜像 ID 与构建提交的缺口应明确保留，不能猜测填补。
3. 当前代码和验证证据可修正过时进度，但不能推断用户改变了目标。模型建议可基于证据调整并记录理由；涉及已确认边界的实质冲突，只暂停受影响部分并交由用户裁决。
4. 保留无关和归属未知改动；若发现其他 agent 仍写同一任务，先明确分工，不覆盖或擅自停止对方。本次是顺序交接，不自动启动其他任务。
5. 按执行角色修复及验证；提交遵守项目明确要求，推送、发布及生产数据操作遵守接收会话已有授权。不要读取或输出凭据文件，不提交 Token、Cookie、代理地址或数据库凭据；设置及备份权限保持 `0600`。
6. 缺工具时可使用等价方式完成；无法复现、测试或访问 NAS 时如实标为未验证或受阻，不能把代码完成写成生产恢复。
7. 完成或需要交回时，先读取本文最新版本，再更新实际改动、提交、方案偏离及依据、测试命令与结果、NAS 新旧镜像版本、生产验收及剩余问题；只有只读权限时在回复中提供摘要。建议交回用户验收，不自动指派新的执行者或触发发布。

## 执行结果与交回（2026-09-19）

### 实际改动

提交 `e7deeeb`（`fix: 钳制同步耗时并兜底启动恢复`），3 个文件、174 行新增：

- `backend/src/services/sourceSyncService.ts`：新增 `clampDurationMs`（`Math.min(2147483647, Math.max(0, elapsed))`，非负、上限截断），成功、失败、恢复三处 `durationMs` 写入统一改用该函数；新增导出 `recoverInterruptedSourceRunsForStartup`，内部 try/catch 包裹恢复调用及其成功提示，失败经 `errorMessageFrom` 脱敏后 `console.warn` 并返回 `null`，不阻塞启动，不伪报恢复成功。
- `backend/src/server.ts`：顶层恢复调用改为 `recoverInterruptedSourceRunsForStartup(db)`，成功日志移入函数内，语义不变。
- `backend/tests/sync.test.ts`：新增 4 个回归测试（见下）。schema 未改动，无生产迁移。

方案偏离说明：与决策表一致，无实质偏离；"局部 try/catch"具体化为 `recoverInterruptedSourceRunsForStartup` 函数以便单测覆盖。

### 验证结果

- 新增测试先看 RED 后实施（TDD）：35 天僵尸记录批次复现 `P2020 Out of range value for column 'durationMs'`（与 NAS 生产报错一致）→ 修复后钳制为 `2147483647`，同批普通记录正常收尾、已完成记录不受影响；恰好上限（`2147483647`）精确保留、上限 +1 截断、时间回拨钳为 0、二次恢复返回 0；兜底失败路径（注入故障 client）返回 `null` 且日志不含 "Recovered" 成功提示、成功路径返回数量并提示。
- 全部 4 个新测试在 `vitest run tests/sync.test.ts` 与全量套件中通过。
- `npm run typecheck`、`npm run build` 通过。
- 全量 `npm test`：4 个失败全部实证为预存在（stash 本次改动后原始代码同样失败且更多一个），与本修复无关：
  - `tests/api.test.ts > counts unique works instead of episode rows in calendar summaries`
  - `tests/api.test.ts > returns the complete Douban preview beyond the former 500-row cap`
  - `tests/doubanAdapter.test.ts > replaces a generic coming-soon image from the same Douban subject detail`
  - `tests/sync.test.ts > marks source signals missing from the next complete snapshot as historical`
  这些失败呈现顺序敏感性（单文件与组合跑结果不同），属预存在的测试隔离问题，按范围约定未在本任务处理。

### 实现过程中的踩坑记录

对 Prisma delegate 使用 `vi.spyOn(prisma.sourceSyncRun, "findMany")` 后，`afterEach` 的 `vi.restoreAllMocks()` 未能恢复原方法，污染共享 `testPrisma` 单例导致后续测试失败（vitest 2.0.5）。兜底失败路径测试改为注入仅含故障 `findMany` 的假 client，不再 spy 共享单例。后续写测试应避免 spy Prisma delegate 方法。

### 剩余步骤（待用户执行）

1. 推送分支后手动触发 GitHub Actions"构建极空间镜像包"（选择包含 `e7deeeb` 的分支，填写新版本号），下载 artifact 并核对 SHA-256；构建仅在 GitHub runner 执行。
2. 按 `deploy/nas/README.md` 在极空间导入新镜像并更新 `whatsnews` 项目，保留既有挂载与 `settings.env`，不覆盖真实设置。
3. 按"剩余步骤与验收标准"第 6 条执行生产验收：`50016`/`50015` 两个 `/api/health` 返回 `ok=true`；观察 ≥5 分钟容器不再重启循环；日志不再出现本次 durationMs P2020；只读查询确认旧僵尸记录已标 `failed`。
4. 预存在的 4 个测试失败建议另立任务排查。

### 生产验收结果（2026-09-22）

- 部署 `whatsnew-backend:0.1.3` / `whatsnew-frontend:0.1.3` 成功（run #7，`35677362926`，构建 success）。
- `50016`/`50015` 两个 `/api/health` 均返回 `ok=true`、`service=whatsnew-backend`；`/api/preview` 返回 200（556KB）；iOS 客户端 dashboard、海报等业务请求全部 200。
- backend 启动日志：`WhatsNew backend (main) listening` 后输出 **`Recovered 17 interrupted source sync run(s)`**——历史多次重新部署累积的 17 条僵尸 `running` 记录（含超过 Int32 上限的行）一次全部收尾为 `failed`，未再出现 durationMs P2020。此前该批记录因事务全有全无被单条溢出行持续拖垮，与诊断的死循环机制一致。
- frontend 日志干净：仅一次正常启动序列，无重启循环；极空间面板图标抓取请求与 nginx 大响应缓冲 warn 为无害噪音。
- 部署过程备注：极空间项目更新时若先改 compose 后导入镜像，会触发对 Docker Hub 的 pull 报 `pull access denied`；正确顺序为先在极空间导入镜像 tar（`docker save` 合集，一包含两镜像）再更新项目。

## 可直接转发的启动指令

请阅读 WhatsNew 项目中的 `docs/handoffs/nas-durationMs-overflow.md`，以 Claude Code、角色“执行”接手。先核对适用规则、相关代码和工作区，简短说明目标、边界与第一步；无阻塞即继续修复和验证。当前部署镜像为 `0.1.2`，仍需核对镜像 ID 和构建提交；镜像仅通过 GitHub Actions 打包，Mac mini 不安装任何 Docker 相关组件。生产操作遵守本会话已有授权。完成或受阻时更新交接结果，不把本地通过当作 NAS 已恢复。
