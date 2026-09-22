# shell 管道掩盖命令真实退出码

## 结论速览

- **最终方案**：需要判断前一条命令成败时，不要把它的输出管道给 `tail`/`head` 后依赖整体退出码——在命令后立即 `; echo "EXIT_CODE=$?"` 显式取码，或用 `set -o pipefail`。
- **适用条件**：bash/zsh 下任何 `长命令 2>&1 | 过滤器` 的写法；`npm test`、CI 脚本、后台任务输出收集。

## ✅ `npm test 2>&1 | tail -30` 把失败报成成功（2026-09-22）

- **为何值得记**：同一次会话被连续骗两次——后台任务通知显示 exit 0，实际测试套件有 4 个失败；差一点把"全量通过"写进交付结论。
- **报错原文**（重跑后拿到的真实结果）：

  ```
  Test Files  3 failed | 61 passed (64)
       Tests  4 failed | 419 passed (423)
  EXIT_CODE=1
  ```

- **报错稳定片段**：`npm error Lifecycle script \`test\` failed with error:` + `npm error code 1`（真实失败时 npm 会打印这两行；被管道截断后看不到）
- **错误原因**：bash 管道默认取**最后一个命令**的退出码。`npm test 2>&1 | tail -30` 中 npm 失败（exit 1）被 `tail` 的 exit 0 覆盖，后台任务通知与判断全部失真；且 `tail` 只留了最后 30 行，失败清单也被截断，二次取证还得重跑一遍全量（约 5 分钟）。
- **最终方案**：

  ```bash
  # 方式一：显式取码（最直接）
  npm test > /tmp/full-test.log 2>&1; echo "EXIT_CODE=$?"

  # 方式二：pipefail 让管道继承第一个失败命令的码
  set -o pipefail
  npm test 2>&1 | tail -30
  ```

- **适用条件**：所有 POSIX shell；zsh 同样默认关闭 pipefail。
- **验证证据**：同一次会话内，`| tail -30` 版本通知 exit 0 与 `; echo EXIT=$?` 版本 `EXIT_CODE=1` 对比；完整输出落盘后 grep `EXIT_CODE=` 复核为 1。
- **交叉验证**：单 agent，两次假阳性 + 一次实锤重跑，证据为两次后台任务输出文件。
- **易错点**：
  - 后台/长任务**必须**保留完整输出（重定向到文件），过滤器只用于事后 grep——不要 `run_in_background` + `| tail` 组合。
  - 判定"测试全过"前先看 `Tests N failed | N passed` 行，不只看 exit code；两者都过才算数。