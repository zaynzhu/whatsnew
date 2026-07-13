# WhatsNew Architecture

WhatsNew is a private LAN/NAS dashboard for tracking film and TV releases, broadcasts, availability hints and popularity signals. It keeps each source's meaning intact instead of flattening everything into one synthetic ranking.

## Runtime Shape

- Frontend: React + Vite on `19992`
- Backend: Express + Prisma on `19993`
- Database: MySQL, configured by `DATABASE_URL`
- Settings store: `backend/.env`, hot-loaded through the settings API
- China source sandbox: isolated `whatsnew_china_sandbox`, `backend/.env.china-sandbox`, ports `19994` / `19995`, scheduler disabled
- Scheduler: `node-cron`, hourly and daily adapter groups
- Poster cache: upstream image responses under `backend/.cache/posters/`; responsive WebP variants under `backend/.cache/poster-variants/`

## Data Model

| Model | Purpose |
|---|---|
| `MediaItem` | Canonical title record. Stores `mediaType`, `releaseForm`, external IDs, aliases, `heatScore`, `posterUrl`, enrichment retry time, availability health, measured poster dimensions and `posterQuality`. |
| `MediaSourceRef` | Stable identity link from a source item to a `MediaItem`. Unique by `source + sourceId`. |
| `Release` | Platform or broadcast rows. Stores platform, region, date, season, episode and source attribution. |
| `PopularitySignal` | Source-specific ranking or metric snapshots. Current rows power `/api/trending`; historical rows power detail charts. |
| `SourceSyncRun` | One adapter execution, including `source`, `scope`, status, counts, duration and redacted errors. |
| `ChangeEvent` | Change feed events. Types: `media_detected`, `release_announced`, `airing_today`, `available_now`, `rank_entered`, `rank_changed`, `heat_rising`, `delayed`, `source_failed`. `mediaItemId` is nullable for `source_failed`. |

## Sync Flow

1. An adapter fetches and normalizes one source into `AdapterItem` rows.
2. `runSourceSync()` creates a `SourceSyncRun` with `running`.
3. Items are matched by stable source refs and external IDs before title matching.
4. Canonical work status is constrained by an exact `firstReleaseDate`: a future premiere is `upcoming`, while a reached premiere cannot remain `upcoming`. Platform availability remains a source-attributed `Release` rather than overwriting the work lifecycle. Exact-dated release rows also advance from `upcoming` to `airing_today` and `available`; explicit same-day availability, delayed and ended states are preserved.
5. Releases and popularity signals are upserted with original source attribution.
6. Complete snapshots can retire missing releases or mark missing popularity signals historical.
7. The sync run is finished as `success`, `warning` or `failed`.
8. After initial, hourly and daily adapter batches, data-quality maintenance repairs legacy work and release date/status contradictions before duplicate reconciliation; TMDb poster enrichment then processes up to 40 eligible missing-poster titles when TMDb is runnable.

`SchedulerController` registers one hourly-group task and one daily-group task in `Asia/Shanghai`. `SCHEDULER_HOURLY_INTERVAL_HOURS` accepts `1, 2, 3, 4, 6, 12`; `SCHEDULER_DAILY_TIME` accepts `HH:mm`. A settings update stops the old future tasks and registers the new cron expressions without restarting the process or re-running startup sync. The settings response computes both next-run timestamps. The China sandbox disables scheduled and startup sync regardless of these values.

At backend startup, `recoverInterruptedSourceRuns()` marks unfinished `running` rows as `failed` with `同步进程中断，已自动收尾；请重新触发同步`. This prevents stale status after dev-server restarts or process exits.

External reads use the shared `SourceHttpClient`. The production client preserves the two-second per-origin rate limit and makes up to two attempts for idempotent requests after network errors, timeouts, HTTP 408, HTTP 429 or HTTP 5xx. Non-idempotent methods and ordinary HTTP 4xx responses are never retried automatically.

## Poster Pipeline

1. Adapters persist their source-provided `posterUrl` when available.
2. `enrichMissingPosters()` selects missing-poster titles by heat, then update time.
3. Netflix titles first reuse one safe local candidate: a recent same-type film or a same-type active series with compatible language and no conflicting external IDs.
4. Existing TMDb IDs use direct metadata lookup. Titles without IDs accept one unique normalized exact-title match; Netflix may also accept a recent type/language-compatible candidate when it is unique or has at least a fourfold TMDb popularity lead.
5. If the chosen TMDb identity already belongs to a safe same-title record, source refs, releases, popularity signals and events move transactionally to that canonical record. Unsafe identity conflicts and unresolved ambiguity are skipped.
6. Successful matches fill the poster URL and missing baseline metadata without overwriting existing values.
7. Every attempt writes `posterLookupAttemptedAt`; unsuccessful records become eligible again after 7 days so they do not block new titles.
8. `MediaPoster` sends a `320w / 640w / 960w` `srcset` through the backend proxy. The browser selects a bounded width for the actual display slot. `PosterImageService` validates HTTP(S) URLs and image responses, measures supported image dimensions with `image-size`, applies the configured proxy and per-origin rate limit, then caches upstream bytes and metadata by URL hash.
9. `PosterVariantService` creates `160 / 320 / 640 / 960` WebP variants with Sharp. It never enlarges the original, keys derivatives by URL, requested width and source-byte digest, coalesces concurrent work and writes cache files atomically. A transform failure returns the original bytes.
10. `prunePosterVariantCache()` bounds the regenerable variant cache at 512 MB. Startup sync and daily maintenance remove corrupt and stale partial files, then evict oldest complete entries to 90% when over capacity. Files newer than one hour are protected from partial-write cleanup.
11. The frontend falls back to the original URL only when the proxy request fails.
12. Disk entries are validated on read and written through temporary files. Concurrent cold requests for one URL or one variant share one operation.
13. Original cache entries refresh after 30 days. A failed refresh serves the previous bytes as `stale`; uncached failures use a one-minute in-memory cooldown.
14. `posterStatus` progresses through `unverified`, `healthy`, `degraded` and `broken`. A transient failure only degrades the record; a second upstream failure outside the cooldown marks it broken.
15. Hourly maintenance verifies up to 20 high-heat eligible posters; startup sync and daily maintenance verify up to 100. Measurements are stored as `posterWidth` / `posterHeight`; widths below 300 or heights below 400 become `posterQuality=undersized`, independently of `posterStatus` availability. Degraded items wait one day and broken items seven days before retry.
16. Missing, broken and undersized posters enter the strict TMDb enrichment queue. Identity requirements are unchanged; unmatched records retry only after the seven-day cooldown. `/api/poster-health` derives `not_attempted`, `cooldown` and `retry_eligible` lookup states from `posterLookupAttemptedAt` without treating an attempted lookup as a successful match.

iQIYI `newOnlinePCW` poster URLs on `iqiyipic.com` are normalized at adapter ingestion when they use the known `120×160` or `141×188` portrait suffix. The stored URL requests `579×772`, so every page can use the normal proxy and responsive variant pipeline. Existing low-resolution rows accept this replacement only through the same stable iQIYI source identity and matching asset ID; the heat page keeps its direct-first URL upgrade only as a legacy-data fallback.

Douban poster URLs on `doubanio.com` are normalized from `s_ratio_poster` to the same asset's `l_ratio_poster` path at ingestion. Existing low-resolution rows accept that replacement only through the same stable Douban source identity and an exactly equivalent normalized URL, so poster quality improves without broadening title or identity matching.

## Source Registry

`backend/src/settings/sourceCatalog.ts` is the source-of-truth catalog. `backend/src/adapters/adapterRegistry.ts` maps implemented adapters to schedule groups.

| Group | Active syncable sources |
|---|---|
| Global metadata | TVmaze, TMDb, Trakt, TheTVDB |
| International platforms | Netflix, Prime Video, Hulu, Disney+, Apple TV+ |
| China platforms | Youku, iQIYI, Tencent Video, Bilibili, Douban |
| Local enrichment | IMDb datasets cache, manual only |

Planned, restricted or commercial entries remain visible in the source catalog but cannot be enabled or synced unless `implementationStatus`, `supportsSync` and adapter registration all exist.

Max keeps its WBD Pressroom parser but is classified as `blocked` / `restricted_page` while the official page requires login or returns 403. This prevents a known external access restriction from appearing as a recurring sync failure.

Youku uses the signed MTop `kuflix_node_page` reservation node for paginated movie and series upcoming lists. iQIYI uses the complete `newOnlinePCW` upcoming page. Tencent Video posts to the `getMVLPage` structured page service and validates the exact “即将上线” option before accepting paginated movie and series cards; its `publish_date` is work metadata, not a Tencent availability date. MangoTV is blocked because the former channel-homepage modules did not provide a trustworthy upcoming/reservation contract.

## Identity And Release Semantics

Platform catalog additions use `releasePattern=catalog_addition` and do not overwrite a work's `firstReleaseDate`. Calendar counts are unique works per day, while the selected-day response can retain multiple underlying release rows for provenance.

`completeMediaSources` marks a source sync as a complete catalog snapshot. References absent from the next complete snapshot become inactive. After scheduled syncs, duplicate TMDb identities are reconciled when external IDs do not conflict. A second conservative pass merges source-only records only when normalized title and media type match, release years and trustworthy languages are compatible, and exactly one external-identity anchor exists; ambiguous titles remain separate. A third pass handles records with no external IDs only when at least two independent source families agree on normalized title, media type and the exact first-release date. Startup and daily maintenance additionally remove platform-only records only when every source reference is inactive and the work has neither releases nor popularity signals.

Platform schedule or reservation pages do not prove a work's original language or production country. Hulu, Disney+, Prime Video, Apple TV+, Max, Youku and iQIYI leave unknown locale metadata null instead of deriving it from page language or market. Stable source-owned legacy rows clear those inferred values on resync unless another source has already supplied an external identity.

## Status Semantics

Source status is aggregated by latest `source + scope` rows, then grouped by source. This matters for Trakt (`popularity` and `calendar`) and Douban (`popularity` and `upcoming`) because their scopes run separately. Both `/api/sources` and `/api/settings` must use `aggregateLatestSourceRuns()` so the UI stays consistent.

`GET /api/source-health` separates run status from acceptance status, applies stale thresholds by schedule group, and returns blocked coverage rows for unavailable sources. It is read-only and does not trigger adapter sync.

Health samples must prove the semantic scope they represent. Douban `popularity` accepts only persisted `douban_top` signals, while `upcoming` reads Douban release rows; upcoming anticipation signals cannot make the TOP250 rating scope appear healthy.

The source page groups health rows by source and exposes the least healthy scope. Its summary counts enabled sources as healthy only when every reported scope passes. A latest failed run can remain `degraded` while a recent successful snapshot is still within its freshness window; it becomes `failed` when no fresh success remains.

Status priority is:

1. `running`
2. `failed`
3. `warning`
4. `success`

Item counts and durations are summed across latest scopes. Error messages are prefixed with `[scope]`.

## Public API Routes

| Route | Purpose |
|---|---|
| `GET /api/health` | Backend health check. |
| `GET /api/dashboard` | Dashboard slices: today, week, trending, events, source runs. |
| `GET /api/media` | Browse media with type, form, status and sort filters. |
| `GET /api/media/:id` | Media detail with releases, refs, current signals and events. |
| `GET /api/media/:id/poster` | Fetch and cache a stored remote poster; optional `width=160|320|640|960` returns a bounded WebP variant. |
| `GET /api/poster-health` | Return poster coverage, persistent health counts, separate original/variant cache integrity and high-priority samples. |
| `GET /api/media/:id/popularity-history` | Bounded 1-90 day popularity history. |
| `GET /api/trending` | Current popularity signals with movement and source filters. |
| `GET /api/calendar` | Release calendar by date window, plus poster-first daily summaries for the month view. |
| `GET /api/preview` | Read-only complete Douban upcoming timeline grouped by date, including every current future/undated title and source status. |
| `POST /api/preview/sync` | Run only the paginated Douban movie and TV coming-soon pages; rejects duplicate in-flight source work. |
| `GET /api/settings` | Runtime settings fields, source state and latest runs. |
| `PUT /api/settings` | Persist allowed settings into `backend/.env`, effective immediately. |
| `POST /api/settings/proxy/test` | Test direct, HTTP proxy and HTTPS proxy paths. |
| `GET /api/sources` | Source catalog with semantic metadata, local state and latest runs. |
| `GET /api/source-health` | Read-only source health matrix by adapter scope; does not trigger sync. |
| `POST /api/sources/:source/test` | Test one source's configured connectivity. |
| `POST /api/sources/:source/preview` | Fetch and summarize an active source without writing media data or sync runs; the source may remain disabled. |
| `POST /api/sources/:source/sync` | Run enabled adapters for one source. |

The settings routes currently have no authentication and must stay on a trusted LAN/NAS network.
