# backend 测试套件失败定性（预存在失败 + 随机超时）

## 结论速览

- **最终方案**：全量 `npm test` 红了先按本文件归因三步定性（区分超时/断言失败 → stash 基线对比 → 复跑看复现），再决定修代码还是等环境；稳定红的 4 个预存在失败见下方 🔶 条目。
- **适用条件**：vitest 2.0.5 + Node 22 + `singleFork` 顺序执行 + 远程 MySQL 测试库（192.168.50.233:13306），2026-09-23 仍有效。

## ✅ 测试套件随机超时：远程测试库负载击穿 5s 超时线，归因三步定性（2026-09-23）

- **为何值得记**：全量跑一次出现 7 个失败，其中 4 个不在预存在清单，差点按新增回归去修代码；实际花了 4 轮测试执行（全量 → 单跑 → stash 基线单跑 → 复跑）才定性为环境现象。下次直接走归因三步，省掉全部探索。
- **现象原文**（全量跑，测试名两轮之间完全不重叠）：

  ```
  Test Files  3 failed | 62 passed (65)
       Tests  7 failed | 431 passed (438)
  ```
  失败里 6 个是 `Test timed out in 5000ms.`（实耗 5960–6904ms），只有 2–3 个是真断言失败。
- **错误原因**：测试库是局域网另一台机器上的 MySQL（`192.168.50.233:13306`），vitest 默认 `testTimeout: 5000ms`；数据库负载/延迟波动时，大量 DB 密集测试（`runSourceSync` 系列，单个 4–7 秒）随机击穿超时线。超时测试名每次跑都不一样，说明按负载随机击中。
- **失败形态会漂移（易误判点）**：同一测试两次跑可能一次超时、一次断言失败；甚至断言失败也可能是时序次生现象——`keeps title aliases within the database storage limit` 一次跑报 `AssertionError: expected [ 'Ocean Frontier' ] to include 'Short alias'`，复跑即通过且不再复现。
- **归因三步（可复制）**：

  ```bash
  # 1. 全量跑留完整日志（不要接管道，见 shell-pipe-masks-exit-code.md），区分失败类型
  npm test > /tmp/whatsnew-full-test.log 2>&1; echo "EXIT=$?"
  grep -E "^\s+×" /tmp/whatsnew-full-test.log
  grep -E "AssertionError|timed out" /tmp/whatsnew-full-test.log
  # 超时（timed out）优先怀疑环境；断言失败先对照下方预存在清单

  # 2. 单跑失败最集中的文件，看失败名是否稳定
  npm run test --workspace backend -- tests/sync.test.ts > /tmp/sync-single.log 2>&1; echo "EXIT=$?"

  # 3. stash 全部改动跑基线（关键步骤，实锤"与我的改动无关"）
  git stash push -u -m "归因对比"
  npm run test --workspace backend -- tests/sync.test.ts > /tmp/sync-stash.log 2>&1; echo "EXIT=$?"
  git stash pop
  # 4. pop 后复跑一次：失败消失/漂移 = 随机环境现象；稳定复现 = 进预存在清单再排查
  ```

- **验证证据**（2026-09-23 实录，四轮）：带我改动全量 7 失败（4 超时）→ 单跑 8 失败（6 超时 + title aliases 断言 + 预存在 #4）→ stash 后基线单跑**同样 6 失败全超时**（含预存在 #4，但其形态也漂移成超时 5417ms）→ pop 后复跑只剩预存在 #4 断言失败（4670ms，断言原文与 2026-09-22 记录一字不差），全部超时消失。
- **适用条件**：远程测试库 + 5s 超时线 + DB 密集测试；换本地快速库可能不复现超时。
- **易错点**：
  - 把随机超时当新增回归去改代码——白费功夫；先跑基线对比。
  - 反过来把稳定断言失败也归给环境——`expected [] to have a length of 1 but got +0` 这类断言原文每次一致的才是稳定失败，对照预存在清单区分。
  - 归因实验用 `git stash push -u`（`-u` 包含新增未跟踪文件）；pop 前不要在 stash 状态下改其他文件。
- **交叉验证**：单 agent，但基线对比（stash 前后）是独立于改动存在性的强证据；相关日志落 `/tmp/whatsnew-full-test.log`、`/tmp/sync-stash.log`（会话内临时文件，未长期留存）。

## 🔶 4 个预存在失败待排查（2026-09-22 定性，未解决）

- **当前推断**（定性已验证，根因为推断/未知）：
  - 失败清单（2026-09-19 全量 `npm test`，`Test Files 3 failed | 61 passed (64)`、`Tests 4 failed | 419 passed (423)`）：
    1. `tests/api.test.ts > counts unique works instead of episode rows in calendar summaries`
    2. `tests/api.test.ts > returns the complete Douban preview beyond the former 500-row cap`
    3. `tests/doubanAdapter.test.ts > replaces a generic coming-soon image from the same Douban subject detail`
    4. `tests/sync.test.ts > marks source signals missing from the next complete snapshot as historical`（断言 `expected [] to have a length of 1 but got +0`，`tests/sync.test.ts` 内 popularitySignals 相关）
  - **归属实锤**：stash 掉 `e7deeeb` 全部改动后，原始代码三文件组合跑失败 **5 个**（上述 4 个 + `loads matching candidates only once per source sync`）——预存在失败比带修复时还多，定性成立：与 durationMs 修复无关。
  - **顺序敏感现象**（已验证的表象）：`sync.test.ts` 的失败 4 在**单文件跑**时也失败；`loads matching candidates only once per source sync` 只在**三文件组合跑**时失败、单文件跑通过——测试套件存在隔离/顺序问题。
- **已到哪一步**：只完成归属定性（本修复无责）与复现方式固化；4 个失败的业务根因未逐个排查。
- **下一步验证动作**：
  ```bash
  cd "/Users/zaynzhu/code/claude code/project/whatsnew"
  # 逐个单跑缩小范围（组合跑会引入顺序变量）
  npm run test --workspace backend -- tests/api.test.ts -t "counts unique works"
  npm run test --workspace backend -- tests/api.test.ts -t "complete Douban preview"
  npm run test --workspace backend -- tests/doubanAdapter.test.ts
  # 查这些测试的最近改动与对应功能提交
  git log --oneline -5 -- backend/tests/api.test.ts
  ```
  api.test.ts 两个失败的测试名（calendar 去重、Douban preview 500 行上限）像是功能改动后断言未跟进——先看对应实现的最近提交再定是修测试还是修实现。
> 修订 2026-09-23：新增随机超时归因条目（✅ 归因三步）；本轮验证同时复证了 4 个预存在失败的归属仍与改动无关——`marks source signals missing...` 的断言原文两次记录一字不差。

- **为何值得继续**：全量 `npm test` 永远红会**掩盖新增失败**——本次 durationMs 修复期间就花了额外 stash 对比才能确认无新增回归；清掉这 4 个失败后，测试套件才能重新承担回归防线职能。另见上方 ✅ 条目：新增失败与随机超时的归因三步。
- **相关坑**：全量跑时用管道 `| tail` 会掩盖真实退出码，见 [shell-pipe-masks-exit-code.md](shell-pipe-masks-exit-code.md)。