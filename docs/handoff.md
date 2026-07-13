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
- Settings page manages proxies, source enablement, source credentials, connectivity tests, read-only source previews and manual sync.
- Data source status pages poll every 5 seconds.
- Backend startup recovers interrupted `running` source runs.
- Missing artwork is continuously enriched through strict TMDb matching after startup, hourly and daily sync batches; unsuccessful attempts retry after 7 days.
- Frontend artwork is proxy-first with responsive `320w / 640w / 960w` sources. Original images cache under `backend/.cache/posters/`; bounded WebP variants cache under `backend/.cache/poster-variants/` and never upscale the source.
- Poster health is persisted per title and exposed through `/api/poster-health` and the settings page. Original and responsive caches have separate counts, capacity and integrity metrics. Cache refresh can serve stale bytes during transient upstream failures.
- Responsive variants are capped at 512 MB. Startup sync and daily maintenance clean stale partial files and evict oldest complete variants to 90% when over capacity; manual cleanup defaults to dry-run.
- Poster quality is tracked separately from availability. Requests and verification persist dimensions; images below 300×400 are listed as undersized and enter strict TMDb replacement without relaxing identity matching.
- Poster lookup observability separately tracks missing-poster enrichment and undersized-poster replacement across never-attempted, seven-day cooldown and retry-eligible states. Settings samples show the last strict lookup time so a safe skip is not mistaken for a stalled worker.
- The calendar is an image-first month wall: seven poster columns on desktop, a horizontal poster rail on mobile, and a large selected-day gallery.
- `/preview` is a standalone Douban upcoming timeline for dated and undated movie/series releases.
- The heat page groups duplicate works, filters reservation signals with stored Chinese platform values, and uses poster-led compact cards. iQIYI now stores known `120×160` / `141×188` portrait thumbnails as `579×772`; the page-level direct-first upgrade remains only for legacy rows.
- Domestic-source evaluation uses the isolated `whatsnew_china_sandbox`; its scheduler, startup sync and every source switch are disabled by construction.
- Tencent Video passed an isolated sandbox sync on 2026-07-13: 206 active source identities, 206 undated upcoming releases, 206 posters and 28 reservation signals; 167 works were new and 39 matched existing identities, while the main database counts stayed unchanged.
- The iQIYI poster upgrade passed an isolated sandbox resync on 2026-07-13: all 155 recognized low-resolution URLs became stored `579×772` URLs, zero recognized low-resolution URLs remained, and a 20-image verification sample measured exactly `579×772` with 20 healthy/adequate results.
- The corrected iQIYI adapter was then synced to the main database on 2026-07-13: 156 upgraded posters all passed real pixel verification at `579×772`, reducing system-wide undersized artwork from 160 to 7. The remainder is four inactive iQIYI history-only rows and three zero-heat TVmaze programmes, not active iQIYI catalog artwork.
- Douban now runs as two daily scopes instead of one ambiguous `all` scope: `popularity` fetches TOP250 only and `upcoming` fetches movie/TV coming-soon only. A real main-database check on 2026-07-13 reported both scopes fresh and passed with 20 and 206 items respectively; TOP250 health samples were verified to come only from `douban_top`.
- Platform schedule and reservation adapters no longer infer original language or production country from the page market. Conservative unique-title reconciliation now merges a source-only record only into one unambiguous external identity anchor. Main-database validation on 2026-07-13 merged 19 duplicate records across Douban, Hulu, Disney+, Youku and iQIYI; the follow-up dry run found zero remaining safe merges, zero inferred locale rows for enabled platform sources, and all 12 runnable scopes passed health checks.

## Source Coverage

| Source | Scope |
|---|---|
| TVmaze | Series and episode schedules. |
| TMDb | Movies, TV, trends and metadata. |
| Trakt | Popularity and 14-day movie/series calendar. |
| TheTVDB | Free-only metadata updates, disabled by default. |
| Netflix | Official global weekly Top 10 XLSX. |
| Prime Video | Official About Amazon US monthly movie and series lineup. |
| Hulu | Official press schedule. |
| Disney+ | Official New to Disney+ article. |
| Max | Parser retained, but source is blocked while WBD Pressroom requires login or returns 403. |
| Apple TV+ | Official Press RSS feed (news_signal, filtered to film/TV). |
| Youku | Signed MTop movie/series upcoming reservation pages (`youku_reserve`). |
| iQIYI | Complete `newOnlinePCW` upcoming reservation page (`iqiyi_reserve`). |
| Tencent Video | Paginated movie/series “即将上线” channel filters and reservation lower bounds (`tencent_reserve`), disabled by default. |
| MangoTV | Blocked; the former channel-homepage modules are not accepted as upcoming/reservation data. |
| Bilibili | China pgc bangumi/guochuang/documentary rankings (3-day composite). |
| Douban | Separate daily `popularity` TOP250 signal and `upcoming` paginated mobile movie/TV coming-soon scopes. |
| IMDb | Manual local datasets enrichment only. |

## Known Constraints

- Settings API has no authentication and must remain private.
- TheTVDB must stay free-only.
- Trakt public sync only requires `TRAKT_CLIENT_ID`; calendar is not availability.
- Hulu and Disney+ are HTML page parsers. Structure changes should fail visibly, not silently return fake data.
- Prime Video discovers the latest US monthly lineup from About Amazon, excludes sports and music, and defaults to disabled; use per-source direct mode when the inherited proxy cannot reach Amazon domains.
- Tencent Video validates the exact TV `iyear=1` and movie `iyear=999` “即将上线” filter contract before accepting data. Its `publish_date` is not stored as a Tencent release date.
- Max is intentionally non-runnable while the official WBD page is access-restricted; do not re-enable it until a public request succeeds.
- Platform catalog additions are not work premieres. The calendar exposes release-pattern labels and counts unique works per day.
- Scheduled quality maintenance reconciles conflict-free duplicate TMDb identities plus conservative unique-title records with exactly one external identity anchor; startup and daily runs also remove strict inactive platform orphans.
- IMDb datasets do not create new titles; they enrich existing candidates from the local cache.
- Poster enrichment safely merges a unique recent local Netflix match or a compatible TMDb identity. External-ID conflicts and candidates without a clear confidence lead still retain placeholders until better metadata appears.
- Poster proxy responses without `width` keep the upstream image bytes and content type. Supported width requests normally return bounded WebP and fall back to the original bytes only when conversion fails.
- Hourly maintenance verifies 20 high-priority posters; startup sync and daily maintenance verify 100. Manual operators can audit, bypass verification cooldowns or force a strict enrichment retry with the documented npm commands.
- `backend/.env` contains secrets and must not be committed.
- Scheduler settings support hourly intervals of `1, 2, 3, 4, 6, 12` hours and a daily `HH:mm` Beijing time. Saving hot-reschedules future jobs and the settings page shows both next runs; sandbox controls remain forcibly disabled.

## Next Priorities

1. Recheck retry-eligible missing and undersized titles after the seven-day window without relaxing identity matching; many future Trakt records have valid TMDb IDs but no upstream poster yet, while unmatched low-resolution platform artwork should remain in place until a trustworthy replacement appears.

## Validation Baseline

Use these before handing off significant changes:

```bash
npm run typecheck
npm test
npm run build
```
