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
- Missing artwork is continuously enriched through strict TMDb matching after startup, hourly and daily sync batches; unsuccessful attempts retry after 3 days.
- Frontend artwork is proxy-first with responsive `320w / 640w / 960w` sources. Original images cache under `backend/.cache/posters/`; WebP variants cache under `backend/.cache/poster-variants/` and never upscale the source.
- Poster health is persisted per title and exposed through `/api/poster-health` and the settings page. Original and responsive caches have separate counts, capacity and integrity metrics. Cache refresh can serve stale bytes during transient upstream failures.
- Original images are capped at 2 GB and responsive variants at 512 MB. Startup sync and daily maintenance clean stale partial files and evict each cache's oldest complete entries to 90% when over capacity; both manual cleanup commands default to dry-run.
- Poster quality is tracked separately from availability. Requests and verification persist dimensions; images below 300×400 are listed as undersized and enter strict TMDb replacement without relaxing identity matching.
- Exact IMDb identities can use OMDb as a poster-only fallback inside the strict enrichment queue. The candidate is downloaded before persistence and must be currently available, at least 300×400 and portrait-oriented; dead Amazon URLs and horizontal artwork leave the existing poster untouched.
- TMDb enrichment now uses the same pre-persistence image check. A candidate URL must be downloaded and pass the 300×400 portrait threshold before replacing a low-resolution image or filling a missing one; transport failures remain immediately retryable and no longer create a temporary blank image state.
- Poster enrichment now ranks the complete eligible queue with the configured content-attention weights plus Heat instead of database update time. In the 2026-07-14 live 123-title queue, all eight classified news rows moved to positions 116–123 while high-heat scripted and animation titles remained first.
- Poster-health samples and the Settings UI now reuse that exact queue score. Each missing or undersized sample shows its content category and one-decimal priority, and the live low-resolution list correctly places the documentary `House of the Dragon: The House That Dragons Built` at 31.5 ahead of sports/news rows at 3.5.
- Original poster storage now follows the same bounded paired-file policy as WebP variants. A 2026-07-14 dry run against the current real cache found 2,025 valid original entries using about 435 MB, with no corrupt, orphaned or temporary files and no deletion required under the 2 GB limit; Settings reports body plus metadata bytes against the actual boundary.
- Poster lookup observability separately tracks missing-poster enrichment and undersized-poster replacement across never-attempted, three-day cooldown and retry-eligible states. Health counts, verification and enrichment only include titles with an active source reference; inactive history remains stored without consuming maintenance capacity. Settings samples show the last strict lookup time so a safe skip is not mistaken for a stalled worker.
- The calendar is an image-first month wall: seven poster columns on desktop, a horizontal poster rail on mobile, and a large selected-day gallery.
- `/preview` is a standalone Douban upcoming timeline for dated and undated movie/series releases.
- `/preview` no longer has the former 500-row read cap. After the 2026-07-13 hot-rank integration, a real main-database request returned all 214 current Douban upcoming works, including 40 official hot-list matches: 20 movies and 20 series. Each date now wraps every title into a visible poster grid, and hot-list matches move to the front of that date by rank with a strong badge and border.
- The heat page groups duplicate works, filters reservation signals with stored Chinese platform values, and uses poster-led compact cards. iQIYI now stores known `120×160` / `141×188` portrait thumbnails as `579×772`; the page-level direct-first upgrade remains only for legacy rows.
- The unfiltered heat page now selects 50 works by `MediaItem.heatScore` and returns all current signals for each selected work instead of truncating 50 unrelated source ranks. Poster overlays show Heat; source-specific positions remain beside their source and ranking-scope labels. A read-only main-database request on 2026-07-13 returned 50 Heat-descending works with 71 current signals.
- Douban upcoming date-group positions, separate movie/series `sortby=hot` preview ranks and TOP250 reputation ranks do not contribute to Heat or generate popularity movement events. Main-database reconciliation on 2026-07-13 reset 140 Douban-only works to Heat 0 and removed 39 derived rank-entry events while retaining every source rank, rating and wish-count signal. The follow-up dry run found zero score or event contradictions, and the default top 50 contained no Douban-only work.
- Domestic-source evaluation uses the isolated `whatsnew_china_sandbox`; its scheduler, startup sync and every source switch are disabled by construction.
- Ordinary domestic-source CLI commands now refuse to run while the corresponding main-database source switch is off. Sandbox validation remains available through `sandbox:sync`, preventing a direct `sync:iqiyi` or `sync:youku` command from silently reactivating retired main-database records. The 2026-07-14 cleanup retired 509 active Youku/iQIYI source refs, removed 509 source releases, deactivated 508 reservation signals and left zero active rows for those two disabled sources without deleting media records.
- Tencent Video passed an isolated sandbox sync on 2026-07-13: 206 active source identities, 206 undated upcoming releases, 206 posters and 28 reservation signals; 167 works were new and 39 matched existing identities, while the main database counts stayed unchanged.
- The iQIYI poster upgrade passed an isolated sandbox resync on 2026-07-13: all 155 recognized low-resolution URLs became stored `579×772` URLs, zero recognized low-resolution URLs remained, and a 20-image verification sample measured exactly `579×772` with 20 healthy/adequate results.
- The corrected iQIYI adapter was then synced to the main database on 2026-07-13: 156 upgraded posters all passed real pixel verification at `579×772`, reducing active-catalog undersized artwork from 160 to 3. Four inactive iQIYI history-only rows remain stored but are excluded from image health and maintenance.
- Douban poster ingestion now stores the same official asset through `l_ratio_poster` instead of `s_ratio_poster`, with existing-row upgrades restricted to one stable Douban source identity and an exactly equivalent normalized URL. Generic `/pics/subject/movie*.jpg` and `/pics/subject/tv*.jpg` assets are now classified as missing instead of healthy artwork. A real main-database repair on 2026-07-13 cleared the remaining placeholders; strict TMDb enrichment scanned 30 newly eligible titles, enriched 2, left 19 unmatched and 9 failed requests for the normal retry window. The current 214-title preview contains 29 missing posters and no generic placeholder URL.
- Douban runs as two daily scopes instead of one ambiguous `all` scope: `popularity` fetches TOP250 only and `upcoming` fetches complete movie/TV coming-soon pages plus independent hot top 20 lists. A real main-database sync on 2026-07-13 reported both scopes successful with 20 and 214 items respectively; current `douban_upcoming_hot` signals cover ranks 1–20 for both movie and series.
- Platform schedule and reservation adapters no longer infer original language or production country from the page market. Conservative title reconciliation merges a source-only record into one unambiguous external identity anchor, or merges records without IDs only when independent sources agree on the exact title, type and date. Main-database validation on 2026-07-13 merged 20 duplicate records across Douban, Hulu, Disney+, Youku and iQIYI; the follow-up dry run found zero remaining safe merges, zero inferred locale rows for enabled platform sources, and all 12 runnable scopes passed health checks.
- Canonical work status is now guarded by exact first-release dates during every sync and scheduled maintenance. Main-database reconciliation on 2026-07-13 corrected 215 contradictions (`213 upcoming -> released`, `2 released -> upcoming`). Real Trakt, iQIYI and Youku resyncs all succeeded afterward, and the final dry run reported zero remaining contradictions.
- Exact-dated release rows now advance on every sync and scheduled maintenance while preserving explicit same-day availability, delayed and ended states. Main-database reconciliation on 2026-07-13 corrected 87 stale rows (`58 airing_today -> available`, `14 upcoming -> available`, `15 upcoming -> airing_today`); the follow-up dry run reported zero remaining contradictions.
- TVmaze now deduplicates overlapping country-schedule and web-schedule results by stable episode ID before grouping releases. A real main-database sync on 2026-07-13 completed with 229 items, retained fresh/passed source health and reduced exact duplicate release groups from 2 to 0.
- Current dashboard, discovery, calendar, trending and Douban preview queries now require an active source reference while direct media detail remains available for history. Main-database validation on 2026-07-13 retained all 6 inactive history-only works, returned none from title searches or dashboard candidates, and returned HTTP 200 for direct detail.
- Exact past premiere dates now also resolve a work lifecycle from `unknown` to `released`. Main-database reconciliation on 2026-07-13 corrected `Iyanu` and `Faster with Newbern and Cotten`; the follow-up dry run found zero contradictions, while all 24 remaining active `unknown` works were intentionally preserved because none has a release date.
- Stable external-ID matching and TMDb reconciliation now use movie/series work kinds instead of exact content types. Main-database reconciliation on 2026-07-13 merged 7 conflict-free generic/specialized duplicates (`Big Brother`, `完美世界`, `尼古喵喵`, `无职转生～到了异世界就拿出真本事～`, `仙逆`, `汪汪队立大功`, `Lock Upp`), retained animation/variety classifications and all source relations, and left zero duplicate TMDb work identities on the follow-up dry run.
- Scheduled reconciliation now covers every stable TMDb, TVmaze, IMDb, Trakt and TheTVDB identity rather than TMDb alone. Main-database reconciliation on 2026-07-13 merged the remaining conflict-free `On Patrol: First Shift` TVmaze/TheTVDB pair, retained its documentary classification, both source references and both release feeds, and left zero safe stable-identity groups on the follow-up dry run.
- Poster maintenance after the disabled-source cleanup on 2026-07-14 reports 1,255 active works, 1,132 healthy posters, zero unverified/degraded/broken images, 123 missing and 4 undersized posters. A targeted retry considered only 13 high-heat missing works with stable external IDs and skipped low-attention news/programme rows; exact IMDb fallback added verified `300×450` artwork for `S.W.A.T. Exiles` and `380×562` artwork for `Last Seen`, raising coverage from 90.0% to 90.2%. Earlier live checks also exposed both guarded failure modes: one exact IMDb result returned an unavailable Amazon URL, and another returned a 300×169 horizontal image. Both records retained their verified TVmaze artwork.
- Hulu year-qualified `En Espanol` aliases were validated against the live schedule and strict TMDb search on 2026-07-14. Four exact movie/year matches merged safely into canonical works with verified `500×750` posters, no conflicts or failures; active coverage rose from 90.2% to 90.5%, leaving 119 missing and four undersized posters.
- TheTVDB free detail records now provide a poster-only fallback only for an existing matching `tvdbId`; the shared image service still requires a live portrait image of at least 300×400. A targeted 2026-07-14 main-database run checked 11 stable TheTVDB identities, added `680×1000` artwork for `Crystal Lake`, `Power: Origins` and `Nocturne`, upgraded `House of the Dragon: The House That Dragons Built` to `680×1000`, and left records with no official image untouched. Active coverage reached 91.1%, with 112 missing and three undersized posters.
- TMDb poster enrichment now follows the same movie/series work-kind boundary as stable identity reconciliation. Strict confirmation can merge generic and specialized records while retaining the specialized classification, every external ID, poster state and related source data. A read-only main-database audit on 2026-07-13 identified three cooldown candidates (`Body Cam` from Hulu and `Project Runway` from Hulu/Disney+); none was forced or assumed to match before the normal retry window and TMDb confirmation.
- Duplicate reconciliation now selects artwork independently from canonical classification: availability, quality and measured pixel area determine the retained poster, and all poster health fields move together. The locally cached TVmaze asset for `On Patrol: First Shift` was revalidated on 2026-07-13 and restored from the retained `680×1000` image to the same-work `1175×1763` source image without changing its documentary classification.

## Source Coverage

| Source | Scope |
|---|---|
| TVmaze | Series and episode schedules. |
| TMDb | Movies, TV, trends and metadata. |
| Trakt | Popularity and 14-day movie/series calendar. |
| TheTVDB | Free-only metadata updates, disabled by default. |
| Netflix | Current Tudum Top 10 pages with complete four-chart validation; official global XLSX fallback. |
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
| Douban | Separate daily `popularity` TOP250 signal and `upcoming` paginated mobile movie/TV coming-soon scope with independent hot top 20 highlights. |
| IMDb | Manual local datasets enrichment only. |

## Known Constraints

- Settings API has no authentication and must remain private.
- TheTVDB must stay free-only.
- Trakt public sync only requires `TRAKT_CLIENT_ID`; calendar is not availability.
- Hulu and Disney+ are HTML page parsers. Structure changes should fail visibly, not silently return fake data.
- Hulu year-qualified `En Espanol` catalog rows retain their platform title and gain a base-title alias for strict TMDb year matching; undated rows remain unchanged.
- Prime Video discovers the latest US monthly lineup from About Amazon, excludes sports and music, and defaults to disabled; use per-source direct mode when the inherited proxy cannot reach Amazon domains.
- Tencent Video validates the exact TV `iyear=1` and movie `iyear=999` “即将上线” filter contract before accepting data. Its `publish_date` is not stored as a Tencent release date.
- Max is intentionally non-runnable while the official WBD page is access-restricted; do not re-enable it until a public request succeeds.
- Platform catalog additions are not work premieres. The calendar exposes release-pattern labels and counts unique works per day.
- Scheduled quality maintenance first repairs exact-date work and release status contradictions, then reconciles conflict-free duplicate TMDb identities, conservative unique-title records with exactly one external identity anchor, and source-only records with independently corroborated exact dates; startup and daily runs also remove strict inactive platform orphans.
- IMDb datasets do not create new titles; they enrich existing candidates from the local cache.
- Poster enrichment safely merges a unique recent local Netflix match or a compatible TMDb identity. External-ID conflicts and candidates without a clear confidence lead still retain placeholders until better metadata appears.
- Poster proxy responses without `width` keep the upstream image bytes and content type. Supported width requests normally return bounded WebP and fall back to the original bytes only when conversion fails.
- Hourly maintenance verifies 20 high-priority posters; startup sync and daily maintenance verify 100. Manual operators can audit, bypass verification cooldowns or force a strict enrichment retry with the documented npm commands.
- `backend/.env` contains secrets and must not be committed.
- Scheduler settings support hourly intervals of `1, 2, 3, 4, 6, 12` hours and a daily `HH:mm` Beijing time. Saving hot-reschedules future jobs and the settings page shows both next runs; sandbox controls remain forcibly disabled.

## Next Priorities

1. Continue poster-system phase two: recheck the 112 cooling missing titles and three undersized titles as their three-day windows open. Keep the content-attention queue order and existing strict TMDb, IMDb and TheTVDB identity matching; source-generic placeholders must stay classified as missing until a trustworthy replacement exists.

## Validation Baseline

Use these before handing off significant changes:

```bash
npm run typecheck
npm test
npm run build
```
