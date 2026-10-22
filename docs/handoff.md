# WhatsNew Handoff

This is the short operational handoff for the current integration branch. Use the code and Prisma schema as runtime authority; use archived `docs/superpowers/` files only for historical design context.

## Current Branch

- Branch: `codex/whatsnew-mvp`
- Remote: `https://github.com/zaynzhu/whatsnew.git`
- Primary local path: `/Users/zaynzhu/code/claude code/project/whatsnew`

## Runtime Entry Points

- Extreme Space frontend: `http://NAS_HOST:50015`
- Extreme Space backend: `http://NAS_HOST:50016`
- Local development defaults only: frontend `19992`, backend `19993`
- Health: `GET /api/health`
- Source health: `GET /api/source-health`
- Poster health: `GET /api/poster-health`
- Media detail route: `/media/:id`
- Batch identity lookup (read-only): `POST /api/media/lookup`, contract documented in `docs/integration-guide.md`
- macOS package: `macos/Package.swift`
- macOS local app: `dist/WhatsNew.app` after `scripts/build-macos-app.sh`

The Extreme Space project is the current main runtime and contains only `backend` and `frontend` containers; MySQL remains external. The Mac LaunchAgent `com.zaynzhu.whatsnew.backend` is disabled and local port `19993` should remain closed during normal use. The domestic sandbox remains isolated in `whatsnew_china_sandbox`, forces scheduling and startup sync off, and must never copy business rows into the main database. The native Mac client connects to the NAS API and never starts its own backend, database or scheduler.

## Current Acceptance Snapshot

Verified against the running NAS main backend on 2026-10-22 after the 0.1.5 deployment and the external MySQL tuning. These counts are an operational snapshot; query the live endpoints again before maintenance:

- `GET /api/health` returned `ok=true` through both 50015 (frontend proxy) and 50016 (backend direct).
- The 15:00/16:00/17:00 hourly batches on 2026-10-22 succeeded across tvmaze, tmdb, youku, iqiyi and tencent — the first fully green runs since the 2026-10-11 NAS power outage. Trakt `popularity` still returns 403 (chronic since July).
- The external MySQL (pixelreel-mysql container, shared with other projects) was tuned on 2026-10-22: `innodb_buffer_pool_size` 128M→1G and `innodb_redo_log_capacity` 100M→512M, applied online and persisted in the MySQL compose `command:`; `innodb_flush_log_at_trx_commit` stays 1. Post-tuning buffer pool hit rate measured 99.1% (dual-source) and `/api/trending` answered 0.79s mid-batch-window (24.5s before).
- 616 interrupted `SourceSyncRun` rows from the outage window were swept to `failed` with guarded SQL; the sources page no longer shows phantom running states.
- WhatShot's optional WhatsNew external-heat integration recovered without any WhatShot change: its 20s client timeout now holds 25x headroom even mid-batch. See `docs/lessons/whatshot-external-heat-timeout.md`.
- Outbound flakiness remains for proxy-routed daily sources: Netflix, Hulu, Disney+, TheTVDB and Prime returned `fetch failed` on some daily batches around 2026-10-20–22 while succeeding on manual retries — the proxy side on the NAS still needs attention.

## Deployment Status

- `0.1.5` is live on the Extreme Space runtime since 2026-10-22: built on GitHub Actions (run 39730803980, source commit `584a0d3`) and packaged at `dist/nas-0.1.5/` with SHA256SUMS. It ships the three interactive-transaction timeout fixes (`e33a95e` 60s deactivate, `8ffb861` 30s per-signal, `584a0d3` 60s identity merge). Verified live: tmdb/youku/iqiyi hourly syncs all succeeded in the first post-deploy batch and stayed green through the day. Rollback path: point compose back to `:0.1.4` (the old images stay until manually deleted).
- No Prisma schema change shipped in 0.1.5, so no database migration was needed. The backend container was recreated for the deploy around 14:57 Beijing on 2026-10-22; the external MySQL container was recreated around 15:34 when its compose gained the tuning args.

## Source Coverage

| Source | Current contract |
|---|---|
| TVmaze | Series and episode schedules. |
| TMDb | Movies, TV, trends, strict metadata/poster enrichment and stable-ID user ratings. |
| Trakt | Popularity plus the 14-day movie/series release calendar. |
| TheTVDB | Free-only metadata and exact-ID poster fallback. |
| Netflix | Four validated Tudum Top 10 charts with official XLSX fallback. |
| Prime Video | Official About Amazon US monthly lineup. |
| Hulu | Official press schedule. |
| Disney+ | Official New to Disney+ article. |
| Apple TV+ | Official Press RSS news signals with article-confirmed premiere dates only. |
| Youku | Signed MTop upcoming reservation node. |
| iQIYI | `newOnlinePCW` upcoming reservation page. |
| Tencent Video | Accepted `getMVLPage` movie/series upcoming filters. |
| Bilibili | Independent bangumi, guochuang and documentary rankings. |
| Douban | Separate TOP250 popularity, complete movie/TV coming-soon scopes and stable-subject user ratings. |
| IMDb | Manual local-datasets enrichment plus exact-ID IMDb and Rotten Tomatoes rating observations through OMDb. |
| Max | Blocked while WBD Pressroom returns 403; recovery testing targets the durable official HBO Max brand release listing. |
| MangoTV | Blocked because the former homepage modules are not a trustworthy upcoming contract. |

## Operational Constraints

- Settings has no authentication and must remain on a trusted private network.
- TheTVDB must stay free-only.
- Trakt public sync needs `TRAKT_CLIENT_ID`; its calendar is not streaming availability.
- Tencent `publish_date` is work metadata, not a Tencent availability date, so accepted Tencent release rows remain undated.
- Platform catalog additions are not work premieres. Preserve release-pattern labels in calendar and dashboard ranking.
- Poster enrichment must retain strict identity boundaries and validate every candidate image before persistence. Transport failures do not start a three-day title cooldown.
- Current listing queries require at least one enabled source reference; direct media details remain available for inactive history.
- `POST /api/media/lookup` is strictly read-only: no source sync, no writes, no title guessing; episode-level IMDb ids are reported as unmatched instead of bridged.
- Ratings stay in `MediaRating`, require stable identity and eligible lifecycle status, and never affect Heat, chart rank or popularity events.
- Scheduler settings hot-reload after saving. The domestic sandbox always keeps `SCHEDULER_ENABLED=false`.
- Direct edits to Docker `settings.env` require backend container recreation; a plain restart does not reload `env_file` values.
- `backend/.env`, proxy addresses, credentials, tokens and cookies must not be committed or printed.

## Next Priority

Investigate the never-successful Trakt scopes (popularity 403 since July, calendar fetch failures) and Prime's monthly-article detection without printing credentials. Watch the NAS proxy path for the intermittent `fetch failed` waves on proxy-routed daily sources (Netflix, Hulu, Disney+, TheTVDB, Prime) observed around 2026-10-19–22. Let the 1G buffer pool run for a full day before judging steady-state `Slow_queries` growth, and read `/api/source-health` plus `/api/poster-health` before any source or poster maintenance because the eligibility counts change with every sync. Do not use `--force` or relax strict identity rules as routine maintenance.

## Validation Baseline

Run before handing off significant changes:

```bash
npm run typecheck
npm test
npm run build
scripts/test-macos.sh
scripts/build-macos-app.sh
```

Note: `npm test` currently has four pre-existing failures unrelated to recent work (2026-09-22, verified by stash comparison). Treat them as noise, not new regressions; see `docs/lessons/backend-preexisting-test-failures.md` for the verified list and per-test triage commands.

Operational spot checks:

```bash
curl -s http://NAS_HOST:50015/api/health
curl -s http://NAS_HOST:50015/api/source-health
curl -s http://NAS_HOST:50015/api/poster-health
```
