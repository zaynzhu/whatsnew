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

Verified against the running NAS main backend on 2026-08-19. These counts are an operational snapshot; query the live endpoints again before maintenance:

- `GET /api/health` returned `ok=true`, `service=whatsnew-backend` and `environment=main`.
- The Extreme Space frontend returned HTTP 200 for `/healthz`, dashboard, calendar, preview, source health and poster health through port `50015`.
- Scheduler state was enabled with one hourly job every hour and one daily job at `09:15` in `Asia/Shanghai`; the Mac LaunchAgent was disabled and local port `19993` had no listener.
- Source health reported 24 scopes: 13 passed, three failed, eight blocked, zero degraded and one stale. Trakt `popularity` and `calendar` had never succeeded; Prime Video's last success was stale.
- Poster health covered 3,709 active works: 3,500 with posters and 209 missing, for 94.4% coverage. Availability was 3,496 healthy and four broken; quality was 3,486 adequate, ten undersized and four unknown. Retry eligibility must be read live before maintenance.
- The rating schema upgrade was applied after a full database backup. Business row counts were unchanged by the schema operation.
- The first manual rating batch scanned 20 eligible works, updated 19, left one unchanged and had zero failures. It stored 55 current observations across Douban, IMDb, TMDb and Rotten Tomatoes; a NAS media-detail response was verified to return four rating rows for one work.

## Pending Deployment

- `0.1.4` images were built on GitHub Actions (run 35871388951, source commit `7ee20c3`) and verified at `dist/nas-0.1.4/` on 2026-09-23; they add the read-only batch lookup endpoint and await manual NAS import. NAS currently runs `0.1.3`; roll back by pointing compose back to `:0.1.3` after import (the old images stay until manually deleted).

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

Investigate the two never-successful Trakt scopes and the stale Prime Video scope without printing credentials. Continue rating enrichment in small daily or manual batches, and read `/api/source-health` plus `/api/poster-health` before any source or poster maintenance because the eligibility counts change with every sync. Do not use `--force` or relax strict identity rules as routine maintenance.

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
