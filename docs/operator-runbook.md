# WhatsNew Operator Runbook

This runbook is for running WhatsNew locally or on a trusted NAS/LAN host.

## Ports

| Service | Default |
|---|---|
| Frontend | `http://127.0.0.1:19992` |
| Backend | `http://127.0.0.1:19993` |
| Health | `http://127.0.0.1:19993/api/health` |

## Setup

```bash
npm install
cp backend/.env.example backend/.env
npm run prisma:generate --workspace backend
npm run prisma:push --workspace backend
```

Edit `backend/.env` before syncing. `DATABASE_URL` should point to the MySQL `whatsnew` database. Do not commit `backend/.env`.

## Run

```bash
npm run dev:backend
npm run dev:frontend
```

For production-style build checks:

```bash
npm run typecheck
npm test
npm run build
```

## Native macOS Client

The SwiftUI client is an API consumer only. Keep the NAS backend and its single scheduler running; do not start a second backend, database or scheduler on the Mac for the client.

Run the Core test suite and assemble the personal local app with:

```bash
scripts/test-macos.sh
scripts/build-macos-app.sh
open "dist/WhatsNew.app"
```

On first launch, enter a base URL that serves `GET /api/health` with `service=whatsnew-backend`. A NAS Compose deployment normally uses its reverse-proxy address on port `19992`; local development may use `http://127.0.0.1:19993`. Plain HTTP is accepted only for LAN hosts, local names and loopback addresses; use HTTPS for a public hostname.

The app stores only the last verified base URL. Credentials and proxy values are never read back in plain text or persisted on the Mac. An empty sensitive input does not clear the server value unless the user explicitly chooses clear.

`scripts/build-macos-app.sh` creates an ad-hoc signed `dist/WhatsNew.app` for personal use. It does not create a DMG, Developer ID signature, notarization request or GitHub Release. The macOS GitHub workflow checks debug build, tests and release build without uploading an app artifact.

## Docker Deployment

The production Docker target is a trusted Extreme Space NAS, not the primary Mac mini. The stack keeps MySQL external and runs one backend scheduler plus one Nginx frontend. It never packages, creates, migrates or copies the application database.

Infrastructure settings stay in Compose variables: image tags, CPU platform, bind addresses, ports, PUID/PGID, timezone, log rotation, config path and data path. Application settings stay in the bind-mounted `runtime/config/settings.env`; the Settings page writes source, proxy, credential, attention-weight and scheduler-time changes back to that file. The whole config directory is mounted because settings updates use atomic file replacement.

The Z4S uses Intel 64-bit processors, so its Docker platform is `linux/amd64`. Prefer the manually triggered `构建极空间镜像包` GitHub Actions workflow when the Mac mini must remain Docker-free. It produces a downloadable tar and SHA-256 file without packaging runtime settings or credentials.

Alternatively, build the architecture-specific image tar on a Linux Docker builder:

```bash
./deploy/nas/build-image-tar.sh 0.1.0 linux/amd64
```

Use `linux/arm64` when the NAS reports `aarch64` or `arm64`. The resulting tar contains both frontend and backend images with matching tags. It contains no settings or credentials.

Follow [`deploy/nas/README.md`](../deploy/nas/README.md) for image import, persistent directory setup, first-run smoke testing, scheduler cutover, upgrades and rollback. Keep the NAS scheduler disabled until its health checks pass, then stop the Mac LaunchAgent before enabling the NAS scheduler. Two schedulers must never write the main database concurrently.

## China Source Sandbox

Never evaluate domestic adapters against the main `whatsnew` database. Rebuild the isolated sandbox from the current main database baseline:

```bash
npm run sandbox:prepare
```

This recreates only `whatsnew_china_sandbox`, writes ignored `backend/.env.china-sandbox` with mode `0600`, disables every source, sets `SYNC_ON_START=false`, disables the scheduler and uses ports `19994` / `19995`. Domestic sources also default to disabled when a new main environment omits their keys; production activation must therefore be explicit after sandbox acceptance.

Run one source at a time. The command hard-fails unless both `APP_ENVIRONMENT=china_sandbox` and the exact sandbox database name are active:

```bash
npm run sandbox:sync -- youku
npm run sandbox:sync -- iqiyi
npm run sandbox:sync -- tencent
npm run sandbox:sync -- bilibili
npm run sandbox:sync -- douban
```

Each run reports global row deltas, newly created versus matched works, missing posters, missing source dates, media-type distribution and suspicious programme-like titles. Re-run `sandbox:prepare` between sources for isolated comparisons.

The ordinary domestic-source commands (`sync:youku`, `sync:iqiyi`, `sync:tencent`, `sync:bilibili`, `sync:mango-tv` and `sync:douban`) now require that source to be enabled in the main settings. A disabled source fails before any request or database write. Use `npm run sandbox:sync -- <source>` for isolated validation; do not temporarily enable a main source just to bypass this guard.

For source-only Douban, iQIYI, Youku and Tencent records, a repeated stable source identity can update a moved upcoming date. Records with TMDb, TVmaze, IMDb, Trakt or TheTVDB identity keep their canonical first-release date; the platform date stays on the `Release` row. After changing this policy, re-sync the affected source and compare the media detail date with its latest same-source release.

Inspect the sandbox UI in two terminals:

```bash
npm run sandbox:backend
npm run sandbox:frontend
```

Open `http://127.0.0.1:19995/`. The backend health response and frontend header must show `china_sandbox` / `国内源沙盒`. Never copy sandbox rows into the main database; promote adapter fixes, reset the sandbox, re-test, then sync the corrected adapter in main.

## Key Environment Variables

| Key | Purpose |
|---|---|
| `DATABASE_URL` | MySQL connection string. |
| `PORT` | Backend port, default `19993`. |
| `CORS_ORIGIN` | Allowed frontend origin, default `http://localhost:19992`. |
| `HTTP_PROXY`, `HTTPS_PROXY` | Global outbound proxies. |
| `TMDB_API_KEY` | Required for TMDb sync. |
| `TRAKT_CLIENT_ID` | Required for Trakt public sync. |
| `THETVDB_API_KEY` | Required for TheTVDB when enabled. |
| `IMDB_DATASET_CACHE_DIR` | Local cache directory for IMDb datasets. |
| `SCHEDULER_ENABLED` | `true` registers hourly and daily cron jobs; `false` disables them. |
| `SCHEDULER_HOURLY_INTERVAL_HOURS` | Hourly-group interval: `1`, `2`, `3`, `4`, `6` or `12`; default `1`. |
| `SCHEDULER_DAILY_TIME` | Daily-group Beijing time in `HH:mm`; default `09:15`. |
| `SYNC_ON_START` | `true` runs enabled adapters once on backend startup; `false` disables it. Boolean strings are parsed explicitly. |

Every active source also has:

- `SOURCE_<ID>_ENABLED`
- `SOURCE_<ID>_PROXY_MODE`
- `SOURCE_<ID>_HTTP_PROXY`
- `SOURCE_<ID>_HTTPS_PROXY`

Platform page adapters may also use source base URL overrides such as `SOURCE_PRIME_VIDEO_BASE_URL`, `SOURCE_HULU_BASE_URL`, `SOURCE_DISNEY_PLUS_BASE_URL`, `SOURCE_MAX_BASE_URL`, `SOURCE_NETFLIX_BASE_URL` and `SOURCE_TENCENT_BASE_URL`. Netflix uses the fixed Tudum Top 10 page routes as its primary current-week feed; `SOURCE_NETFLIX_BASE_URL` overrides only the official XLSX fallback.

## Manual Sync

```bash
npm run sync:tvmaze --workspace backend
npm run sync:tmdb --workspace backend
npm run sync:trakt --workspace backend
npm run sync:thetvdb --workspace backend
npm run sync:netflix --workspace backend
npm run sync:prime-video --workspace backend
npm run sync:hulu --workspace backend
npm run sync:disney-plus --workspace backend
npm run sync:max --workspace backend
npm run sync:youku --workspace backend
npm run sync:iqiyi --workspace backend
npm run sync:tencent --workspace backend
npm run sync:bilibili --workspace backend
npm run sync:apple-tv-plus --workspace backend
npm run sync:douban --workspace backend
npm run enrich:posters --workspace backend -- --limit=120
```

`sync:douban` runs two independent daily scopes in sequence: `popularity` fetches only TOP250 rating signals, then `upcoming` fetches only the paginated movie and TV coming-soon feeds. Their `SourceSyncRun` records and health samples remain separate.

The `/preview` page reads only Douban movie and TV upcoming releases. Its read endpoint returns the complete current future/undated set without an arbitrary row cap and annotates matches from the independent movie/series `sortby=hot` top 20 feeds. Its manual sync action calls `POST /api/preview/sync`, paginates the dedicated `movie/coming_soon` and `tv/coming_soon` endpoints, fetches each hot top 20, skips TOP250 and refuses to queue a second Douban run while one is already active. Opening or refreshing the page never triggers external requests.

IMDb is local-cache based:

```bash
npm run download:imdb --workspace backend
npm run sync:imdb --workspace backend
```

TheTVDB is free-only and disabled by default. Enable it with `SOURCE_THETVDB_ENABLED=true` and a free project `THETVDB_API_KEY`.

## Scheduled Sync

| Group | Default cron | Sources |
|---|---|---|
| Hourly | `0 * * * *` | TVmaze, TMDb, Trakt popularity, Youku, iQIYI, Tencent Video |
| Daily | `15 9 * * *` Asia/Shanghai | Trakt calendar, TheTVDB, Netflix, Prime Video, Hulu, Disney+, Apple TV+, Bilibili, Douban |

Only sources that are enabled, implemented and credential-complete are scheduled.

The settings page can change the hourly interval and daily time. Saving stops the old future jobs and immediately registers the new schedule without restarting the backend or re-running startup sync. It also shows the next hourly and daily execution times. The China sandbox writes `SCHEDULER_ENABLED=false`, so its controls are disabled and enabling a source there still does not create automatic refreshes.

Each source sync has a 15-minute total deadline. The deadline propagates to active HTTP requests and is checked between persistence stages; an expired run is recorded as `failed`. Scheduled batches isolate each source, so one timeout or unexpected exception does not prevent later sources or maintenance steps from running.

On the primary macOS workstation, the backend runs from the compiled output through `~/Library/LaunchAgents/com.zaynzhu.whatsnew.backend.plist`. The LaunchAgent uses `RunAtLoad` and `KeepAlive`, so it starts after login and restarts after an unexpected exit. Rebuild before restarting it after backend changes:

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.zaynzhu.whatsnew.backend
curl -s http://127.0.0.1:19993/api/health
```

Inspect its state with:

```bash
launchctl print gui/$(id -u)/com.zaynzhu.whatsnew.backend
```

Max is currently classified as restricted because WBD Pressroom requires login or returns 403. Its parser remains in the repository, but it is not runnable until public access is verified again. The settings-page connection test targets the official HBO Max brand release listing; a successful test is only a recovery signal and must be followed by parser validation before the source is re-enabled.

Prime Video discovers the newest official monthly article from the About Amazon entertainment page, then imports only dated US movie and series entries. Live sports, live music and entries with ambiguous media types are intentionally skipped. The source defaults to disabled and may need a per-source direct network mode when the inherited proxy cannot reach Amazon domains.

MangoTV is also blocked. Its former channel-homepage modules did not provide a stable upcoming/reservation contract; do not run `sync:mango-tv` as a production source.

Tencent Video is disabled by default. It reads the internal `getMVLPage` page service with the exact TV `channel_id=100113, iyear=1` and movie `channel_id=100173, iyear=999` “即将上线” filters. The adapter stops instead of importing when those labels, filter values or pagination context change. `publish_date` is retained only as possible work-premiere metadata; Tencent release rows remain undated until the platform exposes a trustworthy availability date.

All normal source reads use the shared HTTP client with a two-second minimum interval per origin. Safe `GET`, `HEAD` and `OPTIONS` requests make at most two attempts when the first attempt fails because of a network error, timeout, HTTP 408, HTTP 429 or HTTP 5xx. Ordinary HTTP 4xx responses and non-idempotent requests are not retried automatically.

When TMDb is runnable, startup, hourly and daily adapter batches finish by processing up to 40 eligible missing, broken or undersized titles. Completed but unmatched or ambiguous lookups wait 3 days before retry. The manual command accepts `--limit=1..500`. Candidate order uses 70% of the configured content-attention weight and 30% Heat, with update time only breaking ties; changing the Settings weights therefore also changes future poster-maintenance priority.

Hourly batches verify up to 20 high-priority poster URLs; startup sync and daily batches verify up to 100. Verification uses the same proxy, per-origin rate limiter and disk cache as browser requests. With the default hourly interval, the backlog progresses continuously instead of waiting only for the daily run.

## Poster Cache

Frontend poster requests use responsive `GET /api/media/:id/poster?width=320|640|960` URLs. The backend stores the upstream image body and metadata under `backend/.cache/posters/`, then stores bounded WebP derivatives under `backend/.cache/poster-variants/`. Both directories are ignored by Git and can be removed safely when the services are stopped. The next request rebuilds the missing cache entry.

Known poster CDN hosts follow the owning source's proxy mode from Settings. For example, `doubanio.com` follows Douban, `image.tmdb.org` follows TMDb and `m.media-amazon.com` follows IMDb. A source sync and its poster fetch must use the same intended network path; when sync succeeds but verification degrades otherwise valid artwork, inspect the source proxy mode before changing poster URLs or identity matching. The poster transfer timeout is 45 seconds because some valid direct CDN responses stream large originals slowly; failures still enter the short in-memory cooldown.

```bash
find backend/.cache/posters -type f | wc -l
du -sh backend/.cache/posters
find backend/.cache/poster-variants -type f | wc -l
du -sh backend/.cache/poster-variants
curl -sS -D - -o /dev/null 'http://127.0.0.1:19993/api/media/<mediaItemId>/poster?width=320'
```

Inspect `X-Poster-Cache`, `X-Poster-Variant-Cache`, `X-Poster-Width`, `Content-Type` and the HTTP status. A normal width response is WebP; `X-Poster-Variant-Cache: fallback` indicates that the original bytes were returned after a conversion failure.

```bash
npm run audit:posters --workspace backend
npm run verify:posters --workspace backend -- --limit=100
npm run enrich:posters --workspace backend -- --limit=120
npm run prune:posters --workspace backend
npm run prune:posters --workspace backend -- --apply
npm run prune:poster-variants --workspace backend
npm run prune:poster-variants --workspace backend -- --apply
curl -s http://127.0.0.1:19993/api/poster-health
```

`audit:posters` is read-only. `verify:posters` performs real image requests, records pixel dimensions and updates availability plus quality states. Its result separates `adequate`, `undersized` and `unknown` measurements from network outcomes. Width below 300 or height below 400 is `undersized`; this remains separate from `degraded` or `broken`. Strict enrichment also considers undersized records. A strict TMDb match may merge a generic and specialized content type only within the same movie/series work kind; the specialized classification and all external IDs are retained. Every enrichment image is downloaded successfully, measured at least 300×400 and checked for portrait orientation before its URL is stored; transport failure leaves the current poster and retry state untouched. If an item has an exact IMDb ID, OMDb can supply poster-only artwork. If it has an existing `tvdbId`, the matching TheTVDB free detail record can do the same. Neither fallback searches by title, and unavailable, mismatched or horizontal results leave the existing poster unchanged. Degraded images wait one day and broken images seven days before automatic verification retries. Routine and automated maintenance must honor these cooldowns. The `--force` options are break-glass diagnostics only and must not be used to improve coverage or bypass a retry window.

`GET /api/poster-health` reports missing-poster retry state under `lookup`, missing counts grouped by active source under `missingBySource`, undersized-poster replacement state under `replacement`, original cache integrity and its 2 GB boundary under `cache`, and responsive WebP integrity plus its 512 MB boundary under `cache.variants`. Capacity bytes include both image bodies and paired metadata files. High-priority samples are sorted by the same attention/Heat score as the real worker and include `attentionCategory` plus one-decimal `priorityScore`; the Settings page displays both, so weight changes are observable before the next batch. `nextCooldownExpiryAt` is the earliest time one currently cooling item becomes retry-eligible. Database counts and automatic poster maintenance include only titles with at least one active source reference; inactive history remains stored but does not consume a retry slot. A `cooldown` count means a strict TMDb attempt ran within the last three days; it does not mean a match was accepted. `retryEligible` becomes available after that window. Non-zero `orphanedFiles` indicates an interrupted pair write; non-zero `corruptEntries` indicates invalid metadata or an empty body.

Before a routine batch, read `/api/poster-health`. Run `enrich:posters` only when `lookup.notAttempted` or `lookup.retryEligible` is non-zero. Run `verify:posters` only when the replacement or availability queues contain records whose existing retry windows have elapsed. If every candidate is cooling, record the next expiry and leave the queue untouched.

TMDb and TheTVDB transport, authentication, rate-limit and server failures do not start a title's three-day cooldown. The enrichment command reports up to ten affected titles in `failures` with a redacted reason, and automatic maintenance writes the same safe summary to the backend log. A confirmed `404` for an existing direct identity is treated as a completed unmatched lookup and does enter cooldown.

Douban ingestion normalizes official `s_ratio_poster` and `m_ratio_poster` URLs to the same asset's `l_ratio_poster` path. Re-syncing upgrades an existing small image only when the stable Douban source identity and normalized asset URL are identical. A coming-soon generic `/pics/subject/movie*.jpg` or `/pics/subject/tv*.jpg` asset triggers one rate-limited read of the same subject ID's mobile detail; a real detail asset is accepted, otherwise the row is cleared to missing. The detail's official original title, aliases and countries are still retained for strict later matching. Do not manually rewrite unrelated Douban URLs or invent translated aliases.

All maintenance scripts instantiate Prisma through `config/db.ts`, which loads `config/env.ts` first. When testing a script against the domestic sandbox, verify both `APP_ENVIRONMENT=china_sandbox` and the `/whatsnew_china_sandbox` database path before allowing writes; `SETTINGS_ENV_PATH` must never rely on adapter import order.

Both prune commands default to a dry run. Add `--apply` to remove stale corrupt/orphaned files and enforce the default 2 GB original or 512 MB variant limit. When capacity is exceeded, the oldest complete entries are removed until usage reaches 90% of the applicable limit. Use `--max-mb=1024` to override either command temporarily; accepted values are 64 through 10240 MB. Startup sync and the daily scheduled batch apply both default limits automatically, while files written within the last hour are protected.

## Source Health

The source page polls both `/api/sources` and the read-only `/api/source-health` endpoint every five seconds. Its summary counts enabled sources, not every catalog entry or adapter scope. A source with multiple scopes, such as Trakt or Douban, uses its least healthy scope as the source-level status.

The source page also links to `/sources/runs`, which reads persistent `SourceSyncRun` records through `GET /api/source-runs`. This is the primary operator view for recent source results after Docker deployment: it shows status, scope, duration, item count, and redacted errors without requiring container log access. Failed runnable sources can be retried individually from the page. Persist the application database when containerizing WhatsNew or this history will be lost with the container.

- `健康`: the latest accepted data is fresh and has verifiable samples.
- `降级可用`: the latest run has a problem, but a recent successful snapshot is still fresh enough to serve.
- `失败`: no fresh successful snapshot remains.
- `不可用`: the source is disabled, restricted, commercial, unimplemented or missing required configuration.

Check the row reason before retrying a sync. A single `fetch failed` run does not require intervention when the source still shows `降级可用`; use the last successful snapshot until it becomes stale or a later retry succeeds.

设置页的来源预览会实时调用该来源的全部 adapter scope，但不会走 `runSourceSync()`，因此不会写入业务表或 `SourceSyncRun`。来源可以保持关闭；若缺少必需凭据、接入状态受限或同一来源已有预览在执行，后端会拒绝请求。

## Troubleshooting

| Symptom | Check |
|---|---|
| Source stays `running` after restart | Backend startup should mark interrupted runs as `failed`. Refresh `/sources` after 5 seconds. |
| One source blocks the rest of a scheduled batch | Runs should fail after the 15-minute total deadline and the scheduler should continue. Check the backend log and verify later sources received newer `SourceSyncRun` rows. |
| Backend is unavailable after an unexpected exit | Check the LaunchAgent state, rebuild if `dist` is stale, then use `launchctl kickstart -k gui/$(id -u)/com.zaynzhu.whatsnew.backend`. |
| `/api/settings` and `/api/sources` disagree | Both must use `aggregateLatestSourceRuns()`; rerun tests if this regresses. |
| Source shows `降级可用` | The latest run failed or warned, but a fresh successful snapshot still exists. Inspect the row reason before manually retrying. |
| Trakt fails with network errors | Verify `TRAKT_CLIENT_ID` and proxy settings. Trakt only needs the public client ID. |
| Hulu / Disney+ parse zero items | Check source page structure and base URL overrides. These are official pages, not APIs. |
| Max cannot be enabled | Expected while WBD Pressroom remains login/403 restricted. Verify public access before changing the catalog status. |
| IMDb says missing cache dir | Set `IMDB_DATASET_CACHE_DIR`, run `download:imdb`, then `sync:imdb`. |
| TheTVDB asks for paid access | Do not implement paid fallback. Only free project API Key is allowed. |
| A past premiere still shows `即将上线` | Run `reconcile:media-statuses` as a dry run, inspect transitions, then apply it. Platform availability dates remain separate release rows. |
| A past release row still shows `即将上线` or `今日播出` | Run `reconcile:release-statuses` as a dry run, inspect transitions, then apply it. Explicit delayed and ended rows are preserved. |
| A title stays without artwork | Confirm TMDb is enabled and credential-complete; when the title has `tvdbId`, also confirm the free TheTVDB source is credential-complete, then run `enrich:posters`. Strict unmatched or conflicting titles remain without artwork and wait 3 days; do not restore a source-generic placeholder. |
| Poster endpoint returns `502` | Check global proxy connectivity and the remote image host. Remove that URL's cache only after confirming the stored response is invalid. |
| Poster health shows `degraded` | An expired cache copy is still usable or the first upstream attempt failed. Let the cooldown expire before retrying. |
| Poster health shows `broken` | The URL failed across separate retry windows. Run strict enrichment or wait for a source to provide a different URL. |
| Poster health shows `undersized` | The image is available but measured below 300×400. Run strict enrichment; unmatched titles intentionally keep the original image until a trustworthy replacement exists. |
| Current Douban TOP250 artwork is undersized | Re-sync the Douban `popularity` scope, then run `verify:posters`. Official `s_ratio_poster` paths should become `l_ratio_poster` for the same asset. |
| A Douban card shows the generic movie/TV subject image | Re-sync Douban. The adapter should clear that URL to missing, reset the lookup state and queue strict enrichment. |
| macOS client rejects a server address | Confirm the URL has `http` or `https`, includes a host, has no query or fragment, and returns the expected `/api/health` service identity. Public hostnames require HTTPS. |
| macOS client opens but content requests fail | Test the saved base URL from the same Mac. Port `19992` must proxy `/api/*`; otherwise connect directly to the trusted LAN backend on `19993`. |

Useful status commands:

```bash
curl -s http://127.0.0.1:19993/api/health
curl -s http://127.0.0.1:19993/api/sources
curl -s http://127.0.0.1:19993/api/source-health
curl -s http://127.0.0.1:19993/api/settings
```

Preview data-quality maintenance before applying it manually:

```bash
npm run reconcile:media-statuses --workspace backend
npm run reconcile:release-statuses --workspace backend
npm run reconcile:heat-scores --workspace backend
npm run reconcile:popularity-scopes --workspace backend
npm run reconcile:duplicate-identities --workspace backend
npm run cleanup:platform-orphans --workspace backend
npm run reconcile:media-statuses --workspace backend -- --apply
npm run reconcile:release-statuses --workspace backend -- --apply
npm run reconcile:heat-scores --workspace backend -- --apply
npm run reconcile:popularity-scopes --workspace backend -- --apply
npm run reconcile:duplicate-identities --workspace backend -- --apply
npm run cleanup:platform-orphans --workspace backend -- --apply
```

`reconcile:media-statuses` repairs only exact-date contradictions: a future first release becomes `upcoming`, and an `upcoming` or `unknown` work whose first-release date has arrived becomes `released`. It leaves undated `unknown` works unchanged, does not infer `ongoing`, `returning` or `ended`, and does not alter platform-specific release rows. The same reconciliation runs automatically after initial, hourly and daily source batches.

`reconcile:release-statuses` advances exact-dated release rows to `upcoming`, `airing_today` or `available` according to the current local date. Explicit same-day `available`, `delayed` and `ended` states are retained. The same rule is applied before every release write and during scheduled data-quality maintenance.

`reconcile:heat-scores` recomputes the auxiliary Heat value from current dynamic ranking signals. Douban upcoming date-group positions, preview hot ranks and TOP250 reputation positions remain queryable source ranks but contribute zero Heat; applying the command also removes historical popularity movement events derived from those non-Heat sources.

`reconcile:popularity-scopes` backfills independent chart identity for historical Trakt and Netflix signals. Trakt is derived from the canonical movie/series work kind. Netflix is updated only when one stable Netflix source category maps unambiguously to the work; ambiguous records stay `overall`. Run the dry mode first, then append `-- --apply`.

`reconcile:duplicate-identities` reports `stableIdentity`, `uniqueTitle` and `sharedDateTitle` separately. `stableIdentity` connects records that share a TMDb, TVmaze, IMDb, Trakt or TheTVDB ID within one movie or series work kind. A generic series record can therefore merge into an animation, documentary, variety or short-form classification, while movie and series namespaces stay separate. If both records have artwork, the merge prefers a healthier availability state, then a better quality state, then the larger measured pixel area; URL, dimensions and health fields move together. If any external ID has two different non-null values inside the connected group, the entire group is reported as a conflict and is not merged. `uniqueTitle` applies only when one external identity is uniquely anchored; `sharedDateTitle` requires at least two independent sources to agree on exact title, type and first-release date. `ambiguous` entries are never merged automatically. Always inspect the dry-run samples before using `--apply` on a new dataset.
