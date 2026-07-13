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
4. Releases and popularity signals are upserted with original source attribution.
5. Complete snapshots can retire missing releases or mark missing popularity signals historical.
6. The sync run is finished as `success`, `warning` or `failed`.
7. After startup, hourly and daily adapter batches, TMDb poster enrichment processes up to 40 eligible missing-poster titles when TMDb is runnable.

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
10. The frontend falls back to the original URL only when the proxy request fails.
11. Disk entries are validated on read and written through temporary files. Concurrent cold requests for one URL or one variant share one operation.
12. Original cache entries refresh after 30 days. A failed refresh serves the previous bytes as `stale`; uncached failures use a one-minute in-memory cooldown.
13. `posterStatus` progresses through `unverified`, `healthy`, `degraded` and `broken`. A transient failure only degrades the record; a second upstream failure outside the cooldown marks it broken.
14. Daily and startup maintenance verifies up to 20 high-heat eligible posters. Measurements are stored as `posterWidth` / `posterHeight`; widths below 300 or heights below 400 become `posterQuality=undersized`, independently of `posterStatus` availability.
15. Broken and undersized posters enter the strict TMDb enrichment queue. Identity requirements are unchanged; an unmatched low-resolution image remains usable and retries only after the seven-day cooldown.

The heat page has one scoped exception: `iqiyi_reserve` poster URLs from `newOnlinePCW` are upgraded from the source's `141×188` thumbnail size to `579×772` and loaded direct-first. This does not change stored URLs or the poster behavior of other pages.

## Source Registry

`backend/src/settings/sourceCatalog.ts` is the source-of-truth catalog. `backend/src/adapters/adapterRegistry.ts` maps implemented adapters to schedule groups.

| Group | Active syncable sources |
|---|---|
| Global metadata | TVmaze, TMDb, Trakt, TheTVDB |
| International platforms | Netflix, Hulu, Disney+, Apple TV+ |
| China platforms | Youku, iQIYI, Bilibili, Douban |
| Local enrichment | IMDb datasets cache, manual only |

Planned, restricted or commercial entries remain visible in the source catalog but cannot be enabled or synced unless `implementationStatus`, `supportsSync` and adapter registration all exist.

Max keeps its WBD Pressroom parser but is classified as `blocked` / `restricted_page` while the official page requires login or returns 403. This prevents a known external access restriction from appearing as a recurring sync failure.

Youku uses the signed MTop `kuflix_node_page` reservation node for paginated movie and series upcoming lists. iQIYI uses the complete `newOnlinePCW` upcoming page. MangoTV is blocked because the former channel-homepage modules did not provide a trustworthy upcoming/reservation contract.

## Identity And Release Semantics

Platform catalog additions use `releasePattern=catalog_addition` and do not overwrite a work's `firstReleaseDate`. Calendar counts are unique works per day, while the selected-day response can retain multiple underlying release rows for provenance.

`completeMediaSources` marks a source sync as a complete catalog snapshot. References absent from the next complete snapshot become inactive. After scheduled syncs, duplicate TMDb identities are reconciled when external IDs do not conflict; startup and daily maintenance additionally remove platform-only records only when every source reference is inactive and the work has neither releases nor popularity signals.

## Status Semantics

Source status is aggregated by latest `source + scope` rows, then grouped by source. This matters for Trakt because `popularity` and `calendar` run separately. Both `/api/sources` and `/api/settings` must use `aggregateLatestSourceRuns()` so the UI stays consistent.

`GET /api/source-health` separates run status from acceptance status, applies stale thresholds by schedule group, and returns blocked coverage rows for unavailable sources. It is read-only and does not trigger adapter sync.

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
| `GET /api/poster-health` | Return poster coverage, persistent health counts, cache integrity and high-priority samples. |
| `GET /api/media/:id/popularity-history` | Bounded 1-90 day popularity history. |
| `GET /api/trending` | Current popularity signals with movement and source filters. |
| `GET /api/calendar` | Release calendar by date window, plus poster-first daily summaries for the month view. |
| `GET /api/preview` | Read-only Douban upcoming timeline grouped by date, including undated titles and source status. |
| `POST /api/preview/sync` | Run only the paginated Douban movie and TV coming-soon pages; rejects duplicate in-flight source work. |
| `GET /api/settings` | Runtime settings fields, source state and latest runs. |
| `PUT /api/settings` | Persist allowed settings into `backend/.env`, effective immediately. |
| `POST /api/settings/proxy/test` | Test direct, HTTP proxy and HTTPS proxy paths. |
| `GET /api/sources` | Source catalog with semantic metadata, local state and latest runs. |
| `GET /api/source-health` | Read-only source health matrix by adapter scope; does not trigger sync. |
| `POST /api/sources/:source/test` | Test one source's configured connectivity. |
| `POST /api/sources/:source/sync` | Run enabled adapters for one source. |

The settings routes currently have no authentication and must stay on a trusted LAN/NAS network.
