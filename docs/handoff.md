# WhatsNew Handoff

This file is the short operational handoff for the current branch.

## Current Branch

- Branch: `codex/whatsnew-mvp`
- Remote: `https://github.com/zaynzhu/whatsnew.git`
- Primary local path: `/Users/zaynzhu/code/claude code/project/whatsnew`

## What Exists

- Full-stack monorepo with Express backend, Prisma/MySQL, React frontend and shared types.
- Core entities are `MediaItem`, `MediaSourceRef`, `Release`, `PopularitySignal`, `SourceSyncRun` and `ChangeEvent`.
- Detail route is `/media/:id`; do not use the early `show` or `/shows/:id` naming.
- Settings page manages proxies, source enablement, source credentials, connectivity tests and manual sync.
- Data source status pages poll every 5 seconds.
- Backend startup recovers interrupted `running` source runs.
- Missing artwork is continuously enriched through strict TMDb matching after startup, hourly and daily sync batches; unsuccessful attempts retry after 7 days.
- Frontend artwork is proxy-first through `/api/media/:id/poster`, with an on-demand disk cache under `backend/.cache/posters/`.
- Poster health is persisted per title and exposed through `/api/poster-health` and the settings page. Cache refresh can serve stale bytes during transient upstream failures.
- The calendar is an image-first month wall: seven poster columns on desktop, a horizontal poster rail on mobile, and a large selected-day gallery.
- `/preview` is a standalone Douban upcoming timeline for dated and undated movie/series releases.
- The heat page groups duplicate works, filters reservation signals with stored Chinese platform values, and uses poster-led compact cards. Only iQIYI reservation cards upgrade `141×188` source thumbnails to `579×772` direct-first images.
- Domestic-source evaluation uses the isolated `whatsnew_china_sandbox`; its scheduler, startup sync and every source switch are disabled by construction.

## Source Coverage

| Source | Scope |
|---|---|
| TVmaze | Series and episode schedules. |
| TMDb | Movies, TV, trends and metadata. |
| Trakt | Popularity and 14-day movie/series calendar. |
| TheTVDB | Free-only metadata updates, disabled by default. |
| Netflix | Official global weekly Top 10 XLSX. |
| Hulu | Official press schedule. |
| Disney+ | Official New to Disney+ article. |
| Max | Parser retained, but source is blocked while WBD Pressroom requires login or returns 403. |
| Apple TV+ | Official Press RSS feed (news_signal, filtered to film/TV). |
| Youku | Signed MTop movie/series upcoming reservation pages (`youku_reserve`). |
| iQIYI | Complete `newOnlinePCW` upcoming reservation page (`iqiyi_reserve`). |
| MangoTV | Blocked; the former channel-homepage modules are not accepted as upcoming/reservation data. |
| Bilibili | China pgc bangumi/guochuang/documentary rankings (3-day composite). |
| Douban | Movie TOP250 signal plus paginated mobile movie/TV coming-soon timelines. |
| IMDb | Manual local datasets enrichment only. |

## Known Constraints

- Settings API has no authentication and must remain private.
- TheTVDB must stay free-only.
- Trakt public sync only requires `TRAKT_CLIENT_ID`; calendar is not availability.
- Hulu and Disney+ are HTML page parsers. Structure changes should fail visibly, not silently return fake data.
- Max is intentionally non-runnable while the official WBD page is access-restricted; do not re-enable it until a public request succeeds.
- Platform catalog additions are not work premieres. The calendar exposes release-pattern labels and counts unique works per day.
- Scheduled quality maintenance reconciles conflict-free duplicate TMDb identities; startup and daily runs also remove strict inactive platform orphans.
- IMDb datasets do not create new titles; they enrich existing candidates from the local cache.
- Poster enrichment safely merges a unique recent local Netflix match or a compatible TMDb identity. External-ID conflicts and candidates without a clear confidence lead still retain placeholders until better metadata appears.
- Poster proxy responses keep the upstream image bytes and content type; no common output format is guaranteed.
- Startup and daily maintenance verify 20 high-priority posters. Manual operators can audit, verify or force a strict enrichment retry with the documented npm commands.
- `backend/.env` contains secrets and must not be committed.
- Scheduler cron is fixed in `backend/src/scheduler.ts`: hourly at minute `0`, daily at `09:15` Asia/Shanghai. The settings page does not configure it yet.

## Next Priorities

1. Promote the accepted Youku and iQIYI adapters by syncing them fresh in the main database; never copy sandbox rows.
2. Add a small scheduler settings surface for hourly cadence, daily time and next-run visibility while keeping the sandbox forcibly disabled.
3. Continue cross-source identity cleanup and the second poster-quality phase, especially undersized-image detection and presentation-sized delivery.

## Validation Baseline

Use these before handing off significant changes:

```bash
npm run typecheck
npm test
npm run build
```
