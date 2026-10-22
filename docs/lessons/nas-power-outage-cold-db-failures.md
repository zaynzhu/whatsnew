# NAS 断电后同步批量失败：冷缓存暴露默认配置 + 修复未部署

## 结论速览

- **最终方案**：NAS 断电/重启 MySQL 后 WhatsNew 每小时同步开始批量超时失败时，按序排查：①`SHOW GLOBAL STATUS LIKE 'Uptime'` 锁定重启时刻 ②`innodb_buffer_pool_size` 是否还是 128M 默认值（连带查 `innodb_redo_log_capacity` 100M、`innodb_flush_method=O_DIRECT`）③查分支上有没有"写好未部署"的超时修复 ④卡死 running 记录用带时间护栏的 SQL 清。修复 = 部署 0.1.5（三处事务超时 30/60s）+ `SET GLOBAL` 在线调参 + compose `command:` 持久化。
- **适用条件**：WhatsNew NAS 部署 + 外部共享 MySQL（pixelreel-mysql 容器，mysql:8.4，O_DIRECT 刷盘）；Prisma 5.x。2026-10-22 定案。

## ✅ 断电后每小时同步必挂的完整根因链（2026-10-22 定案）

- **现象原文**（稳定片段可 grep）：

  ```
  P2028: Transaction already closed: The timeout for this transaction was 5000 ms, however 10800 ms passed
  Invalid `prisma.popularitySignal.findMany()` invocation → popularitySnapshotService deactivateMissingCurrentSignals
  P1017: Server has closed the connection → Invalid `prisma.sourceSyncRun.create/update()` invocation
  P2025: Record to update not found（与 P1017 同秒簇里出现，伴随连接被掐的形态）
  ```

- **根因链**：断电重启 → mysqld 冷启动，暴露从未调过的默认配置（128M buffer pool + O_DIRECT 绕过 OS 缓存，整机 16G 物理内存对 DB 完全不可见）→ 批量写入期查询超 Prisma `$transaction` 5 秒默认超时 → 同步每小时必挂（优酷自 10-12 14:04、TMDb 自 10-18 15:05 后零成功）→ 失败收尾 update 自身撞上被掐连接 → `SourceSyncRun` 永久卡 running（561→616 条持续累积）。
- **修复提交了 ≠ 生效了**：10-08 的两个超时修复（`e33a95e` 60s、`8ffb861` 30s）在分支上躺了一个月，NAS 一直跑 9-23 构建的 0.1.4。排障时先核对现网镜像的构建源 commit（handoff 部署状态或 `docker inspect`），别默认修复在线上。
- **修复动作（按序）**：
  1. 部署 0.1.5（`584a0d3`，含 `duplicateIdentityService` 归并事务 60s 新修复）：云端构建 → **先导镜像** → 改 compose → 重建容器（顺序坑见 [nas-deploy-image-order.md](nas-deploy-image-order.md)）。
  2. MySQL 在线调参（零停机）+ compose `command:` 持久化防断电回默认：

     ```sql
     SET GLOBAL innodb_buffer_pool_size = 1073741824;  -- 1G
     SET GLOBAL innodb_redo_log_capacity = 536870912;   -- 512M
     ```

     `innodb_flush_log_at_trx_commit` 共享库保持默认 1——多项目共用时数据可重灌性未知，不做持久性换写入速度的取舍。
  3. 卡死记录清场（**30 分钟护栏**防误伤正在跑的同步；启动恢复 `recoverInterruptedSourceRuns` 自身也是 5s 批量事务受害者，行数多时清不动）：

     ```sql
     UPDATE SourceSyncRun SET status='failed', finishedAt=NOW(),
       durationMs=LEAST(2000000000, TIMESTAMPDIFF(SECOND, startedAt, NOW()) * 1000),
       errorMessage='同步进程中断，已自动收尾；请重新触发同步'
     WHERE status='running' AND finishedAt IS NULL
       AND startedAt < NOW() - INTERVAL 30 MINUTE;
     ```
- **验证证据**（0.1.5 + 1G/512M 后）：tmdb/youku/iqiyi 15:00 批次全部成功（10-11 断电以来首次）并连续三轮全绿；命中率 96.4%→99.1%（双源互验）；trending 批次窗口内 24.5s→0.79s；iqiyi 346 条同数据量 12 分钟→6 分钟。
- **易错点**：
  - 断电不丢数据、不丢配置，但清空缓存——"以前一直没事"靠的是长年热缓存撑着默认配置，重启就是照妖镜。
  - P1017 别先怀疑 MySQL 崩溃（`Uptime` 一查便知）；本案根因是 NAS 容器间链路掐长连接，权威条目在 melon-hub 仓库 `docs/lessons/docker-cloud-compose-deliver.md`「✅ NAS 容器间链路掐断 MySQL 长连接（2026-10-22）」，Prisma 按查询重连自愈，无需代码改动。
  - 慢事务修复后同步"反而更慢"是正常现象（以前 5 秒死掉，现在跑完全程）——以最终 `status`/`itemCount` 判成败，别以耗时判。
  - buffer pool sizing 完整证据链（含 mem_limit 开放项）见 melon-hub 仓库 `docs/lessons/docker-cloud-compose-deliver.md`「✅ 共享 NAS 的 MySQL buffer pool sizing：128M→1G + redo 512M（2026-10-22）」（commit `9d3790e`）。
- **交叉验证**：whatsnew-81 与 melon-hub-95 双会话双源抓取互验（磁盘读数两侧同值 23,288）；断电时刻由 `Uptime` 反推（10-11 13:48）与卡死记录 `MIN(startedAt)`（10-11 15:04）交叉对齐。