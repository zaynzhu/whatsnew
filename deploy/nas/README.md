# 极空间 NAS 部署

本目录用于把 WhatsNew 的前后端镜像打成一个 tar，再导入极空间 NAS。镜像包不包含数据库、运行设置或凭据。

## 1. 确认 NAS 架构

在 NAS SSH 中执行：

```bash
uname -m
```

- `x86_64` 使用 `linux/amd64`
- `aarch64` 或 `arm64` 使用 `linux/arm64`

镜像架构必须与 NAS 一致。

## 2. 生成 tar

### 推荐：GitHub Actions

Mac mini 不安装 Docker 时，在 GitHub 仓库的 Actions 页面打开“构建极空间镜像包”，点击“Run workflow”，填写版本号并运行。任务完成后下载 `whatsnew-<版本>-linux-amd64` artifact，解压得到 tar 和 `.sha256` 文件。

该工作流只允许手动触发，固定生成 Z4S 可用的 `linux/amd64` 镜像，不读取运行设置或凭据。

### 备选：Linux 构建机

只在 Linux Docker 构建机或 CI 中执行，不在运行 WhatsNew LaunchAgent 的 Mac mini 上执行：

```bash
./deploy/nas/build-image-tar.sh 0.1.0 linux/amd64
```

构建机需要 Docker Buildx 和 `sha256sum`。脚本生成一个同时包含以下镜像的 tar，并生成对应的 `.sha256` 校验文件：

- `whatsnew-backend:0.1.0`
- `whatsnew-frontend:0.1.0`

在 NAS 建立部署目录，并放入以下文件：

- 根目录 `compose.yaml`
- 构建出的 tar 和 `.sha256` 文件
- `deploy/nas/compose.env.example`
- `deploy/nas/settings.env.example`

## 3. 准备 NAS 目录

```bash
mkdir -p runtime/config runtime/data/cache
cp compose.env.example .env
cp settings.env.example runtime/config/settings.env
chmod 600 runtime/config/settings.env
```

迁移现有实例时，优先通过安全方式把 Mac mini 的 `backend/.env` 放到 NAS 的 `runtime/config/settings.env`，不要重新手填或输出其中内容。把 `IMDB_DATASET_CACHE_DIR` 调整为容器路径 `/app/backend/.cache/imdb`。

编辑 `.env` 配置镜像名、NAS 架构、端口、数据路径和 PUID/PGID。运行容器的 UID/GID 必须对 `runtime/config` 与 `runtime/data` 有读写权限：

```bash
chown -R 1000:1000 runtime
```

如果 `.env` 使用了其他 PUID/PGID，这里使用相同数值。

编辑 `runtime/config/settings.env`，至少确认：

- `DATABASE_URL` 可从 NAS 容器访问
- `SCHEDULER_ENABLED=false` 用于首次烟测
- `SYNC_ON_START=false` 避免启动即同步
- 启用来源所需凭据已经配置

## 4. 导入并启动

在极空间镜像界面导入 tar，或通过 SSH 执行：

```bash
sha256sum -c whatsnew-0.1.0-linux-amd64.tar.sha256
docker load --input whatsnew-0.1.0-linux-amd64.tar
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --pull never
docker compose --env-file .env ps
```

验收同源前端和后端代理：

```bash
curl -s http://127.0.0.1:19992/api/health
curl -s http://127.0.0.1:19992/api/source-health
```

浏览器访问 `http://NAS地址:19992`。设置页保存的来源、代理、凭据、关注权重和调度时间会原子写回 `runtime/config/settings.env`，容器重建后仍然保留。

设置和同步接口没有身份认证，只能把前端端口开放在可信内网，不要通过路由器端口转发或公网反向代理直接暴露。

## 5. 切换唯一调度器

首次烟测通过前保持 NAS 的 `SCHEDULER_ENABLED=false`。准备正式切换时：

1. 停止 Mac mini 的 WhatsNew LaunchAgent。
2. 把 NAS `runtime/config/settings.env` 的 `SCHEDULER_ENABLED` 改为 `true`。
3. 重新创建 NAS 后端容器。
4. 确认设置页只显示一个 hourly 和 daily 下次运行时间。

不要让 Mac mini 与 NAS 同时启用 scheduler，否则会重复同步同一主库。

## 6. 升级与回滚

升级时导入新 tar，修改 `.env` 中两个镜像 tag，再执行：

```bash
docker compose --env-file .env up -d --pull never
```

回滚时把两个镜像 tag 改回上一版本并重新执行同一命令。`runtime/config`、`runtime/data` 和外部 MySQL 都不会随镜像替换而删除。
