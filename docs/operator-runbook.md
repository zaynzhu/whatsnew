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
| `SYNC_ON_START` | When true, runs enabled adapters once on backend startup. |

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
```

IMDb is local-cache based:

```bash
npm run download:imdb --workspace backend
npm run sync:imdb --workspace backend
```

TheTVDB is free-only and disabled by default. Enable it with `SOURCE_THETVDB_ENABLED=true` and a free project `THETVDB_API_KEY`.

## Scheduled Sync

| Group | Cron | Sources |
|---|---|---|
| Hourly | `0 * * * *` | TVmaze, TMDb, Trakt popularity, Youku, iQIYI |
| Daily | `15 9 * * *` Asia/Shanghai | Trakt calendar, TheTVDB, Netflix, Hulu, Disney+, Max |

Only sources that are enabled, implemented and credential-complete are scheduled.

## Troubleshooting

| Symptom | Check |
|---|---|
| Source stays `running` after restart | Backend startup should mark interrupted runs as `failed`. Refresh `/sources` after 5 seconds. |
| `/api/settings` and `/api/sources` disagree | Both must use `aggregateLatestSourceRuns()`; rerun tests if this regresses. |
| Trakt fails with network errors | Verify `TRAKT_CLIENT_ID` and proxy settings. Trakt only needs the public client ID. |
| Hulu / Disney+ / Max parse zero items | Check source page structure and base URL overrides. These are official pages, not APIs. |
| IMDb says missing cache dir | Set `IMDB_DATASET_CACHE_DIR`, run `download:imdb`, then `sync:imdb`. |
| TheTVDB asks for paid access | Do not implement paid fallback. Only free project API Key is allowed. |

Useful status commands:

```bash
curl -s http://127.0.0.1:19993/api/health
curl -s http://127.0.0.1:19993/api/sources
curl -s http://127.0.0.1:19993/api/settings
```
