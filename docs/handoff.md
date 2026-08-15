# WhatsNew Handoff

This is the short operational handoff for the current integration branch. Use the code and Prisma schema as runtime authority; use archived `docs/superpowers/` files only for historical design context.

## Current Branch

- Branch: `codex/whatsnew-mvp`
- Remote: `https://github.com/zaynzhu/whatsnew.git`
- Primary local path: `/Users/zaynzhu/code/claude code/project/whatsnew`

## Runtime Entry Points

- Frontend: `http://127.0.0.1:19992`
- Backend: `http://127.0.0.1:19993`
- Health: `GET /api/health`
- Source health: `GET /api/source-health`
- Poster health: `GET /api/poster-health`
- Media detail route: `/media/:id`
- macOS package: `macos/Package.swift`
- macOS local app: `dist/WhatsNew.app` after `scripts/build-macos-app.sh`

The normal local backend uses the main environment. The domestic sandbox remains isolated in `whatsnew_china_sandbox`, forces scheduling and startup sync off, and must never copy business rows into the main database. The native Mac client connects to this existing API and never starts its own backend, database or scheduler.

## Current Acceptance Snapshot

Verified against the running main backend on 2026-08-15 at 15:33 CST. These counts are an operational snapshot; query the live endpoints again before maintenance:

- `GET /api/health` returned `ok=true`, `service=whatsnew-backend` and `environment=main`.
- Source health reported 24 scopes: 14 passed, two failed, eight blocked, zero degraded and zero stale. Sixteen scopes were runnable.
- The failed scopes were Trakt `popularity` and `calendar`; both latest runs returned HTTP 403 and this database had no accepted success for either scope. Do not describe the persisted older Trakt samples as current health.
- Passed scopes were TVmaze, TMDb, TheTVDB, Netflix, Prime Video, Hulu, Disney+, Apple TV+, Youku, iQIYI, Tencent Video, Bilibili, Douban popularity and Douban upcoming.
- Poster health covered 3,552 active works: 3,412 with posters and 140 missing, for 96.1% coverage. Availability was 3,407 healthy, one degraded, four broken and zero unverified; quality was 3,398 adequate, nine undersized and five unknown.
- All 140 missing-poster lookups and all nine undersized replacements were cooling, with zero unattempted or retry-eligible items. The next recorded expiry times were 2026-08-16 09:27 CST for missing lookup and 2026-08-16 21:14 CST for replacement.
- The original poster cache had 3,432 complete entries using 875,269,869 bytes; the responsive cache had 333 entries using 9,718,211 bytes. Both reported zero orphaned or corrupt entries.
- Backend port `19993` was listening. Frontend port `19992` and sandbox ports `19994` / `19995` were not listening.
- The macOS v1 source baseline, 29 Swift tests, local ad-hoc app build and the `macOS client checks` workflow were verified before this handoff. GitHub performs checks only; it does not publish the app.

## Source Coverage

| Source | Current contract |
|---|---|
| TVmaze | Series and episode schedules. |
| TMDb | Movies, TV, trends and strict metadata/poster enrichment. |
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
| Douban | Separate TOP250 popularity and complete movie/TV coming-soon scopes. |
| IMDb | Manual local-datasets enrichment; source health treats a ready cache as blocked until a manual sync supplies an accepted run. |
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
- Scheduler settings hot-reload after saving. The domestic sandbox always keeps `SCHEDULER_ENABLED=false`.
- `backend/.env`, proxy addresses, credentials, tokens and cookies must not be committed or printed.

## Next Priority

Investigate the two Trakt HTTP 403 scopes by checking the configured public client ID and request contract without printing credentials. For posters, wait until the recorded cooldowns expire before touching the 140 missing and nine undersized items; do not use `--force` or relax strict TMDb, IMDb and TheTVDB identity rules. Re-read `/api/source-health` and `/api/poster-health` before acting because these counts change with every sync.

## Validation Baseline

Run before handing off significant changes:

```bash
npm run typecheck
npm test
npm run build
scripts/test-macos.sh
scripts/build-macos-app.sh
```

Operational spot checks:

```bash
curl -s http://127.0.0.1:19993/api/health
curl -s http://127.0.0.1:19993/api/source-health
curl -s http://127.0.0.1:19993/api/poster-health
```
