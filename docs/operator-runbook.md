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

## China Source Sandbox

Never evaluate domestic adapters against the main `whatsnew` database. Rebuild the isolated sandbox from the current main database baseline:

```bash
npm run sandbox:prepare
```

This recreates only `whatsnew_china_sandbox`, writes ignored `backend/.env.china-sandbox` with mode `0600`, disables every source, sets `SYNC_ON_START=false`, disables the scheduler and uses ports `19994` / `19995`.

Run one source at a time. The command hard-fails unless both `APP_ENVIRONMENT=china_sandbox` and the exact sandbox database name are active:

```bash
npm run sandbox:sync -- youku
npm run sandbox:sync -- iqiyi
npm run sandbox:sync -- bilibili
npm run sandbox:sync -- douban
```

Each run reports global row deltas, newly created versus matched works, missing posters, missing source dates, media-type distribution and suspicious programme-like titles. Re-run `sandbox:prepare` between sources for isolated comparisons.

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

Platform page adapters may also use source base URL overrides such as `SOURCE_HULU_BASE_URL`, `SOURCE_DISNEY_PLUS_BASE_URL`, `SOURCE_MAX_BASE_URL` and `SOURCE_NETFLIX_BASE_URL`.

## Manual Sync

```bash
npm run sync:tvmaze --workspace backend
npm run sync:tmdb --workspace backend
npm run sync:trakt --workspace backend
npm run sync:thetvdb --workspace backend
npm run sync:netflix --workspace backend
npm run sync:hulu --workspace backend
npm run sync:disney-plus --workspace backend
npm run sync:max --workspace backend
npm run sync:youku --workspace backend
npm run sync:iqiyi --workspace backend
npm run sync:bilibili --workspace backend
npm run sync:apple-tv-plus --workspace backend
npm run sync:douban --workspace backend
npm run enrich:posters --workspace backend -- --limit=120
```

The `/preview` page reads only Douban movie and TV upcoming releases. Its manual sync action calls `POST /api/preview/sync`, paginates the dedicated `movie/coming_soon` and `tv/coming_soon` endpoints, skips TOP250 and refuses to queue a second Douban run while one is already active. Opening or refreshing the page never triggers external requests.

IMDb is local-cache based:

```bash
npm run download:imdb --workspace backend
npm run sync:imdb --workspace backend
```

TheTVDB is free-only and disabled by default. Enable it with `SOURCE_THETVDB_ENABLED=true` and a free project `THETVDB_API_KEY`.

## Scheduled Sync

| Group | Default cron | Sources |
|---|---|---|
| Hourly | `0 * * * *` | TVmaze, TMDb, Trakt popularity, Youku, iQIYI |
| Daily | `15 9 * * *` Asia/Shanghai | Trakt calendar, TheTVDB, Netflix, Hulu, Disney+, Apple TV+, Bilibili, Douban |

Only sources that are enabled, implemented and credential-complete are scheduled.

The settings page can change the hourly interval and daily time. Saving stops the old future jobs and immediately registers the new schedule without restarting the backend or re-running startup sync. It also shows the next hourly and daily execution times. The China sandbox writes `SCHEDULER_ENABLED=false`, so its controls are disabled and enabling a source there still does not create automatic refreshes.

Max is currently classified as restricted because WBD Pressroom requires login or returns 403. Its parser remains in the repository, but it is not runnable until public access is verified again.

MangoTV is also blocked. Its former channel-homepage modules did not provide a stable upcoming/reservation contract; do not run `sync:mango-tv` as a production source.

All normal source reads use the shared HTTP client with a two-second minimum interval per origin. Safe `GET`, `HEAD` and `OPTIONS` requests make at most two attempts when the first attempt fails because of a network error, timeout, HTTP 408, HTTP 429 or HTTP 5xx. Ordinary HTTP 4xx responses and non-idempotent requests are not retried automatically.

When TMDb is runnable, startup, hourly and daily adapter batches finish by processing up to 40 eligible missing-poster titles. Failed or ambiguous lookups wait 7 days before retry. The manual command accepts `--limit=1..500` and prioritizes higher-heat titles.

Hourly batches verify up to 20 high-priority poster URLs; startup sync and daily batches verify up to 100. Verification uses the same proxy, per-origin rate limiter and disk cache as browser requests. With the default hourly interval, the backlog progresses continuously instead of waiting only for the daily run.

## Poster Cache

Frontend poster requests use responsive `GET /api/media/:id/poster?width=320|640|960` URLs. The backend stores the upstream image body and metadata under `backend/.cache/posters/`, then stores bounded WebP derivatives under `backend/.cache/poster-variants/`. Both directories are ignored by Git and can be removed safely when the services are stopped. The next request rebuilds the missing cache entry.

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
npm run enrich:posters --workspace backend -- --limit=20 --force
npm run prune:poster-variants --workspace backend
npm run prune:poster-variants --workspace backend -- --apply
curl -s http://127.0.0.1:19993/api/poster-health
```

`audit:posters` is read-only. `verify:posters` performs real image requests, records pixel dimensions and updates availability plus quality states. Its result separates `adequate`, `undersized` and `unknown` measurements from network outcomes. Width below 300 or height below 400 is `undersized`; this remains separate from `degraded` or `broken`. Strict enrichment also considers undersized records. Degraded images wait one day and broken images seven days before automatic verification retries. `--force` only bypasses the seven-day enrichment retry window; it does not relax identity matching.

`GET /api/poster-health` reports original cache integrity under `cache` and responsive WebP integrity under `cache.variants`. Non-zero `orphanedFiles` indicates an interrupted pair write; non-zero `corruptEntries` indicates invalid metadata or an empty body.

The first prune command is a dry run. Add `--apply` to remove stale corrupt/orphaned files and enforce the default 512 MB limit. When capacity is exceeded, the oldest complete variants are removed until usage reaches 90% of the limit. Use `--max-mb=1024` to override the command limit temporarily; accepted values are 64 through 10240 MB. Startup sync and the daily scheduled batch apply the default limit automatically, while files written within the last hour are protected.

## Source Health

The source page polls both `/api/sources` and the read-only `/api/source-health` endpoint every five seconds. Its summary counts enabled sources, not every catalog entry or adapter scope. A source with multiple scopes, such as Trakt, uses its least healthy scope as the source-level status.

- `健康`: the latest accepted data is fresh and has verifiable samples.
- `降级可用`: the latest run has a problem, but a recent successful snapshot is still fresh enough to serve.
- `失败`: no fresh successful snapshot remains.
- `不可用`: the source is disabled, restricted, commercial, unimplemented or missing required configuration.

Check the row reason before retrying a sync. A single `fetch failed` run does not require intervention when the source still shows `降级可用`; use the last successful snapshot until it becomes stale or a later retry succeeds.

## Troubleshooting

| Symptom | Check |
|---|---|
| Source stays `running` after restart | Backend startup should mark interrupted runs as `failed`. Refresh `/sources` after 5 seconds. |
| `/api/settings` and `/api/sources` disagree | Both must use `aggregateLatestSourceRuns()`; rerun tests if this regresses. |
| Source shows `降级可用` | The latest run failed or warned, but a fresh successful snapshot still exists. Inspect the row reason before manually retrying. |
| Trakt fails with network errors | Verify `TRAKT_CLIENT_ID` and proxy settings. Trakt only needs the public client ID. |
| Hulu / Disney+ parse zero items | Check source page structure and base URL overrides. These are official pages, not APIs. |
| Max cannot be enabled | Expected while WBD Pressroom remains login/403 restricted. Verify public access before changing the catalog status. |
| IMDb says missing cache dir | Set `IMDB_DATASET_CACHE_DIR`, run `download:imdb`, then `sync:imdb`. |
| TheTVDB asks for paid access | Do not implement paid fallback. Only free project API Key is allowed. |
| A title stays without artwork | Confirm TMDb is enabled and credential-complete, then run `enrich:posters`. Strict unmatched or conflicting titles wait 7 days and intentionally keep the placeholder. |
| Poster endpoint returns `502` | Check global proxy connectivity and the remote image host. Remove that URL's cache only after confirming the stored response is invalid. |
| Poster health shows `degraded` | An expired cache copy is still usable or the first upstream attempt failed. Let the cooldown expire before retrying. |
| Poster health shows `broken` | The URL failed across separate retry windows. Run strict enrichment or wait for a source to provide a different URL. |
| Poster health shows `undersized` | The image is available but measured below 300×400. Run strict enrichment; unmatched titles intentionally keep the original image until a trustworthy replacement exists. |

Useful status commands:

```bash
curl -s http://127.0.0.1:19993/api/health
curl -s http://127.0.0.1:19993/api/sources
curl -s http://127.0.0.1:19993/api/source-health
curl -s http://127.0.0.1:19993/api/settings
```

Preview data-quality maintenance before applying it manually:

```bash
npm run reconcile:duplicate-identities --workspace backend
npm run cleanup:platform-orphans --workspace backend
npm run reconcile:duplicate-identities --workspace backend -- --apply
npm run cleanup:platform-orphans --workspace backend -- --apply
```
