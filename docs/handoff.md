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
- Frontend artwork is proxy-first with responsive `320w / 640w / 960w` sources. Original images cache under `backend/.cache/posters/`; bounded WebP variants cache under `backend/.cache/poster-variants/` and never upscale the source.
- Poster health is persisted per title and exposed through `/api/poster-health` and the settings page. Original and responsive caches have separate counts, capacity and integrity metrics. Cache refresh can serve stale bytes during transient upstream failures.
- Responsive variants are capped at 512 MB. Startup sync and daily maintenance clean stale partial files and evict oldest complete variants to 90% when over capacity; manual cleanup defaults to dry-run.
- Poster quality is tracked separately from availability. Requests and verification persist dimensions; images below 300×400 are listed as undersized and enter strict TMDb replacement without relaxing identity matching.
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
- Poster proxy responses without `width` keep the upstream image bytes and content type. Supported width requests normally return bounded WebP and fall back to the original bytes only when conversion fails.
- Startup and daily maintenance verify 20 high-priority posters. Manual operators can audit, verify or force a strict enrichment retry with the documented npm commands.
- `backend/.env` contains secrets and must not be committed.
- Scheduler settings support hourly intervals of `1, 2, 3, 4, 6, 12` hours and a daily `HH:mm` Beijing time. Saving hot-reschedules future jobs and the settings page shows both next runs; sandbox controls remain forcibly disabled.

## Next Priorities

1. Continue the poster verification backlog and strict replacement of high-priority missing or undersized images without relaxing identity matching.
2. Audit remaining cross-source records that still have `posterQuality=unknown`, prioritizing high-heat works and keeping source identity evidence visible.

## Validation Baseline

Use these before handing off significant changes:

```bash
npm run typecheck
npm test
npm run build
```
