# backend 测试套件预存在失败（4 个）

## 结论速览

- **当前现状**：`npm test` 全量固定红 4 个失败，**在 durationMs 修复（`e7deeeb`）之前就存在**，与任何新改动无关（stash 对比实锤）；根因尚未逐个排查。
- **适用条件**：vitest 2.0.5 + Node 22 + `singleFork` 顺序执行，2026-09-22 定性；改动这些测试相关功能前先读本条，避免把预存在失败误归因于新改动。

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
- **为何值得继续**：全量 `npm test` 永远红会**掩盖新增失败**——本次 durationMs 修复期间就花了额外 stash 对比才能确认无新增回归；清掉这 4 个失败后，测试套件才能重新承担回归防线职能。
- **相关坑**：全量跑时用管道 `| tail` 会掩盖真实退出码，见 [shell-pipe-masks-exit-code.md](shell-pipe-masks-exit-code.md)。