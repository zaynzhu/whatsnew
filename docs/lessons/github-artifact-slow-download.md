# GitHub Actions 大文件 artifact 下载（抖动网络）

## 结论速览

- **最终方案**：`gh run download` 卡死时改用 artifact API 直链 + `curl -C -` 无限续传循环（代理 `-x` 优先、直连兜底，`--speed-time 20 --speed-limit 10240` 让慢流自动断开换连接）；zip 完整性由 unzip CRC + 解压后 tar `.sha256` 双重校验兜底。
- **适用条件**：GitHub Actions artifact（zip 封装）大文件（百 MB 级）；出口网络对 GitHub 抖动（macOS 直连/本地代理均可）；2026-09-23 验证。

## ✅ 171MB artifact 在抖动网络下的下载完整解法（2026-09-23）

- **为何值得记**：一次镜像包下载折腾约 2 小时、换了 4 种方式（gh download 卡死 → gh api 探测 → curl 直链 → 代理/直连双通道续传）才稳定跑完；每次 NAS 镜像升级都要下载同样的包，照抄最终命令直接省掉全部探索。
- **现象原文**（本轮真实输出）：

  ```
  Get "https://api.github.com/repos/zaynzhu/whatsnew/actions/runs/35871388951/artifacts": net/http: TLS handshake timeout
  curl: (28) Operation timed out after 235181 milliseconds with 8175616 out of 144851034 bytes received
  curl: (28) Send failure: Broken pipe
  ```

  `gh run download` 更隐蔽：进程存活但**零输出零进度**（下载到 `$(sys_tmpdir)/gh-artifact.*.zip` 临时文件，目标目录一直为空），无法判断卡住还是慢。
- **错误原因**：GitHub artifact 下载链路 = api.github.com 302 → Azure blob signed URL（约 171MB）。直连到 api.github.com / blob 的 TLS 握手频繁超时；连接一旦建立吞吐可短暂达 >800KB/s，随后又跌回 ~30KB/s——瓶颈是**连接建立的抖动**，不是总带宽。代理通道同样抖，且长流中途会 Broken pipe。
- **最终方案**（可直接复制的完整命令；`<OWNER>/<REPO>`、`<RUN_ID>` 换实际值，artifact ID 先用 gh api 查）：

  ```bash
  # 1. 查 artifact ID 与真实大小（估算下载时长）
  gh api repos/<owner>/<repo>/actions/runs/<RUN_ID>/artifacts \
    --jq '.artifacts[] | {id: .id, name: .name, size_mb: (.size_in_bytes / 1048576 | floor)}'

  # 2. 无限断点续传：代理优先 + 直连兜底，慢流 20 秒自动断开换新连接
  #   （每次循环重新 gh auth token，URL 每次重新 302 到新签 blob，不会过期）
  while true; do
    TOKEN=$(gh auth token)
    curl -sSL --max-time 180 --speed-time 20 --speed-limit 10240 -C - \
      -x http://127.0.0.1:7897 \
      -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
      -o /tmp/<artifact>.zip \
      "https://api.github.com/repos/<owner>/<repo>/actions/artifacts/<ARTIFACT_ID>/zip" && break
    curl -sSL --max-time 180 --speed-time 20 --speed-limit 100 -C - \
      -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
      -o /tmp/<artifact>.zip \
      "https://api.github.com/repos/<owner>/<repo>/actions/artifacts/<ARTIFACT_ID>/zip" && break
    sleep 5
  done
  echo "DOWNLOAD_DONE bytes=$(stat -f %z /tmp/<artifact>.zip)"

  # 3. 解压 + 双重校验（unzip 先验 CRC，再对包内 tar 校验 sha256）
  unzip -q /tmp/<artifact>.zip -d /tmp/<artifact>-extract
  cd /tmp/<artifact>-extract && sha256sum -c *.tar.sha256
  ```

- **为什么这样做**：
  - `-C -` 断点续传对 Azure blob 的 Range 请求有效，每次失败重试都从断点累计推进，抖动网络下"慢但确定能到"。
  - `--speed-time N --speed-limit S`：连接建立后如果 20 秒内吞吐低于 10KB/s，curl 主动断开——把时间留给下一次可能爆发的新连接（本轮实测某次连接 20 秒拉了 17MB，说明快时段真实存在，关键是别在慢流上死等）。
  - 代理 `-x http://127.0.0.1:7897` 在前、直连在后：代理节点通的时候快几个数量级（本轮代理开启后 20 秒拉 17MB vs 直连 0.5MB/分钟），代理挂了自动回落直连不空转。
- **适用条件**：macOS（`stat -f %z`、zsh）；gh 已认证；代理端口按实际环境。Linux 下 `stat -f %z` 换 `stat -c %s`。
- **验证证据**（2026-09-23–24 实录）：`gh run download` 挂 5 分钟目录零字节 → curl 直链起步 → 直连 30 分钟 15.7→15.7MB 几乎停滞 → 开代理后 20 秒 15.7→33.4MB → 代理也抖动回落 → 双通道续传循环从 0.6MB 累积到 179454042 bytes 完成，`sha256sum -c` 输出 `whatsnew-0.1.4-linux-amd64.tar: OK`。
- **关键步骤**：
  1. gh api 拿 artifact ID 与大小
  2. 无限续传循环（勿设次数上限——每轮重试都会推进一点）
  3. 完成信号 + 大小核对（与 gh api 报的 size 一致才算完）
  4. unzip CRC + tar sha256 双重校验后才可用
- **易错点**：
  - `gh run download` 对大 artifact 卡住时**没有任何进度输出**，别在它身上死等；先 `lsof -p <gh_pid>` 看它是否在写 `gh-artifact.*.zip` 判断有无进展。
  - 被中断的 gh 下载会留半截 `gh-artifact.*.zip` 在 `$(sys_tmpdir)`（`/var/folders/.../T/`），清理时记得搜这个模式。
  - **`pkill -f "部分文件名"` 会误杀自己会话里命令行含同样字符串的 Monitor/等待循环**（本轮两次误杀自己的监控任务）；杀进程用精确 PID 或模式串与监控命令错开。
  - 下载监控别用"每 30 秒报进度"的 Monitor（会刷屏被自动停），只挂"达到目标字节数/出现完成标记"的单事件信号。
  - GitHub artifact 无官方整体校验和；zip 完整性靠 unzip CRC，最终内容靠包内 `*.tar.sha256`（云端对 tar 生成）校验。
- **交叉验证**：单 agent 单次完整链路（4 种方式对比），证据为会话内实时输出与最终 SHA256 校验通过；无书面审查轨迹。