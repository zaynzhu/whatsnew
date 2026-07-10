# WhatsNew Architecture

WhatsNew is a private LAN/NAS dashboard for tracking film and TV releases, broadcasts, availability hints and popularity signals. It keeps each source's meaning intact instead of flattening everything into one synthetic ranking.

## Runtime Shape

- Frontend: React + Vite on `19992`
- Backend: Express + Prisma on `19993`
- Database: MySQL, configured by `DATABASE_URL`
- Settings store: `backend/.env`, hot-loaded through the settings API
- Scheduler: `node-cron`, hourly and daily adapter groups
- Poster cache: upstream image responses stored under `backend/.cache/posters/`

## Data Model

| Model | Purpose |
|---|---|
| `MediaItem` | Canonical title record. Stores `mediaType`, `releaseForm`, external IDs, aliases, `heatScore`, `posterUrl` and the retry marker `posterLookupAttemptedAt`. |
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

At backend startup, `recoverInterruptedSourceRuns()` marks unfinished `running` rows as `failed` with `同步进程中断，已自动收尾；请重新触发同步`. This prevents stale status after dev-server restarts or process exits.

## Poster Pipeline

1. Adapters persist their source-provided `posterUrl` when available.
2. `enrichMissingPosters()` selects missing-poster titles by heat, then update time.
3. Netflix titles first reuse one safe local candidate: a recent same-type film or a same-type active series with compatible language and no conflicting external IDs.
4. Existing TMDb IDs use direct metadata lookup. Titles without IDs accept one unique normalized exact-title match; Netflix may also accept a recent type/language-compatible candidate when it is unique or has at least a fourfold TMDb popularity lead.
5. If the chosen TMDb identity already belongs to a safe same-title record, source refs, releases, popularity signals and events move transactionally to that canonical record. Unsafe identity conflicts and unresolved ambiguity are skipped.
6. Successful matches fill the poster URL and missing baseline metadata without overwriting existing values.
7. Every attempt writes `posterLookupAttemptedAt`; unsuccessful records become eligible again after 7 days so they do not block new titles.
8. `MediaPoster` requests the backend proxy first. `PosterImageService` validates HTTP(S) URLs and image responses, applies the configured proxy and per-origin rate limit, then caches the upstream bytes and metadata by URL hash.
9. The backend preserves the upstream `Content-Type`; format conversion is not part of the pipeline. The frontend falls back to the original URL only when the proxy request fails.

## Source Registry

`backend/src/settings/sourceCatalog.ts` is the source-of-truth catalog. `backend/src/adapters/adapterRegistry.ts` maps implemented adapters to schedule groups.

| Group | Active syncable sources |
|---|---|
| Global metadata | TVmaze, TMDb, Trakt, TheTVDB |
| International platforms | Netflix, Hulu, Disney+, Max, Apple TV+ |
| China platforms | Youku, iQIYI, MangoTV, Bilibili, Douban |
| Local enrichment | IMDb datasets cache, manual only |

Planned, restricted or commercial entries remain visible in the source catalog but cannot be enabled or synced unless `implementationStatus`, `supportsSync` and adapter registration all exist.

## Status Semantics

Source status is aggregated by latest `source + scope` rows, then grouped by source. This matters for Trakt because `popularity` and `calendar` run separately. Both `/api/sources` and `/api/settings` must use `aggregateLatestSourceRuns()` so the UI stays consistent.

`GET /api/source-health` separates run status from acceptance status, applies stale thresholds by schedule group, and returns blocked coverage rows for unavailable sources. It is read-only and does not trigger adapter sync.

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
| `GET /api/media/:id/poster` | Fetch and cache a stored remote poster through the backend image proxy. |
| `GET /api/media/:id/popularity-history` | Bounded 1-90 day popularity history. |
| `GET /api/trending` | Current popularity signals with movement and source filters. |
| `GET /api/calendar` | Release calendar by date window, plus poster-first daily summaries for the month view. |
| `GET /api/settings` | Runtime settings fields, source state and latest runs. |
| `PUT /api/settings` | Persist allowed settings into `backend/.env`, effective immediately. |
| `POST /api/settings/proxy/test` | Test direct, HTTP proxy and HTTPS proxy paths. |
| `GET /api/sources` | Source catalog with semantic metadata, local state and latest runs. |
| `GET /api/source-health` | Read-only source health matrix by adapter scope; does not trigger sync. |
| `POST /api/sources/:source/test` | Test one source's configured connectivity. |
| `POST /api/sources/:source/sync` | Run enabled adapters for one source. |

The settings routes currently have no authentication and must stay on a trusted LAN/NAS network.
