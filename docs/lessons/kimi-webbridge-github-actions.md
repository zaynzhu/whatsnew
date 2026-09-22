# kimi-webbridge 触发 GitHub Actions 手动构建（workflow_dispatch）

## 结论速览

- **最终方案**：navigate 到 `https://github.com/<org>/<repo>/actions/workflows/<文件名>.yml` → evaluate 执行 `document.querySelector('details.js-dropdown-details').open = true` 展开 Run workflow 面板 → evaluate 填 `input[name="inputs[version]"]`、校验 hidden `input[name="branch"]` → 点击面板内 class 含 `Button--primary` 且文本为 `Run workflow` 的按钮。
- **适用条件**：GitHub 新版 Actions UI + kimi-webbridge v2.0.5（真实浏览器 daemon）+ macOS。

## ✅ 用 webbridge 触发 workflow_dispatch 构建并确认成功（2026-09-22）

- **为何值得记**：摸索 3 轮才找对入口——快照按钮名误导、a11y 树不含表单、shell 引号三连坑；最终一次触发成功并验收 run 完成。
- **最终方案**（关键调用原文，macOS；所有含引号/方括号的 JSON 一律走文件 body）：

  ```bash
  # 1. 打开 workflow 页面
  curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
    -d '{"action":"navigate","args":{"url":"https://github.com/<org>/<repo>/actions/workflows/build-nas-images.yml","newTab":true,"group_title":"构建"},"session":"<task>"}'

  # 2. 展开 Run workflow 面板（JSON 用 Write 工具写到唯一名临时文件后 POST）
  {"action":"evaluate","args":{"code":"(() => { const d = document.querySelector('details.js-dropdown-details'); d.open = true; return 'opened' })()"}}

  # 3. 填输入 + 校验分支 + 点击触发（一次 evaluate 原子完成，值不符则中止）
  {"action":"evaluate","args":{"code":"(() => { const d = document.querySelector('details.js-dropdown-details'); const ver = d.querySelector('input[name=\"inputs[version]\"]').value; const branch = d.querySelector('input[name=\"branch\"]').value; if (ver !== '<目标版本>' || branch !== '<目标分支>') return JSON.stringify({abort: true, ver, branch}); const btn = [...d.querySelectorAll('button')].find(b => b.textContent.trim() === 'Run workflow' && b.className.includes('Button--primary')); btn.click(); return JSON.stringify({triggered: true, ver, branch}) })()"}}
  ```

- **为什么这样做**：
  - a11y 快照树**不包含** `<details>` 展开后的表单内容（输入框、分支、按钮全无 @e ref），必须 evaluate 直接读 DOM。
  - 快照里名为 "Show workflow options" 的按钮是页面筛选视图按钮，**不是** Run workflow 入口；真身是 `<summary>Run workflow</summary>`，包在 `details.js-dropdown-details details-overlay` 里。
  - 触发前在同一个 evaluate 里校验 hidden `input[name="branch"]` 的值——表单记住上次使用的分支，不能默认它就是目标分支。
- **适用条件**：GitHub 未改版（details.js-dropdown-details 结构）；workflow 为手动触发（workflow_dispatch）型。
- **验证证据**：run `35677362926`（版本 `<目标版本>` 值已按触发时实际值执行）成功创建、状态 `in_progress` → `conclusion: success`，`gh api repos/<org>/<repo>/actions/runs/<run_id> --jq '.status,.conclusion'` 复核。
- **交叉验证**：单 agent 单次跑通（3 次失败调用后收敛），证据为会话内真实 run 链接与 gh api 输出。
- **易错点**：
  1. macOS bash **inline JSON 遇到内嵌单引号必炸**（`querySelector('details')` 的引号被 shell 吃掉 → `ReferenceError: details is not defined`）——一律 Write 工具写唯一名 JSON 临时文件 → `curl --data-binary @文件` → 用完即删（skill 自身也这么要求）。
  2. **zsh 把 JSON 里的 `[...]` 当 glob**（`no matches found`）——同样靠文件 body 规避。
  3. workflow 页面 `sleep` 后直接快照可能拿不到新内容（DOM 更新时序），关键状态用 evaluate 查，或刷新页面后再查。
  4. 表单字段定位：版本输入 `input[name="inputs[version]"]`；分支是 hidden input 而非可见 select（新版 UI 用 SelectMenu 组件）。
  5. `close_session` 只在任务结束时调用；同一任务全程固定一个 session 名。