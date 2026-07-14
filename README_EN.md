<div align="center">

# 🎬 WhatsNew

A new-release intelligence dashboard for tracking film & TV releases, broadcasts, availability and popularity changes worldwide and in China

[![GitHub Stars](https://img.shields.io/github/stars/zaynzhu/whatsnew?style=flat-square)](https://github.com/zaynzhu/whatsnew/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/zaynzhu/whatsnew?style=flat-square)](https://github.com/zaynzhu/whatsnew/commits)
[![Open Issues](https://img.shields.io/github/issues/zaynzhu/whatsnew?style=flat-square)](https://github.com/zaynzhu/whatsnew/issues)
[![Forks](https://img.shields.io/github/forks/zaynzhu/whatsnew?style=flat-square)](https://github.com/zaynzhu/whatsnew/forks)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/zaynzhu/whatsnew/compare)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square)](https://www.typescriptlang.org)

[中文](README.md) | [English](README_EN.md)

</div>

> [!TIP]
> WhatsNew aggregates signals from TVmaze, TMDb, Trakt, TheTVDB, Netflix, Youku, iQIYI, Tencent Video and more, keeping per-source popularity history scoped by `title + source + platform + region + window + ranking scope`. Designed for self-hosting on a home LAN or private NAS.

---

## ✨ Features

- **Browse by category** —— Movies, series, anime, variety, short drama, documentaries
- **Today / This week** —— Aggregated new releases and broadcasts across all sources
- **Poster calendar** —— Browse a monthly poster wall and open image-first film and series lineups by date
- **Popularity tracking** —— Rising, new entries, falling, with a 90-day rank timeline
- **Source status** —— Real-time view of each source's sync state and connectivity
- **Independent per-source scope** —— No mixing platforms into one "true combined chart"; each signal is stored separately
- **Global & per-source proxy** —— Global `HTTP_PROXY` / `HTTPS_PROXY`, per-source `inherit` / `direct` / `custom`
- **Hot-reload settings** —— Settings apply immediately after save, no restart needed, sensitive values masked
- **Scheduled + manual sync** —— Cron jobs pull automatically; each source also supports manual sync
- **Continuous poster enrichment** —— Missing artwork is strictly matched through TMDb by heat priority, with exact IMDb and TheTVDB identity fallbacks, then served through the backend image proxy and disk cache

## 🧱 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + TypeScript + TanStack Query + Zustand + React Router |
| Backend | Express 5 + TypeScript + Prisma + MySQL + node-cron + undici |
| Validation | Zod (runtime) |
| Testing | Vitest + Supertest + Testing Library |
| Build | npm workspaces monorepo |

## 📁 Project Structure

```
whatsnew/
├── backend/      # Express + Prisma + MySQL, source adapters and sync scheduling
├── frontend/     # React + Vite frontend, port 19992
├── shared/      # Shared types across frontend & backend
└── docs/        # Architecture, integration, operations, handoff and design archives
```

## 📚 Docs

| Document | Contents |
|----------|----------|
| [Architecture](docs/architecture.md) | Data model, sync flow, source status aggregation and API routes |
| [Integration Guide](docs/integration-guide.md) | Private JSON API, curl examples and error semantics |
| [Operator Runbook](docs/operator-runbook.md) | Environment variables, commands, schedules and troubleshooting |
| [Handoff](docs/handoff.md) | Current branch, integrated sources, constraints and handoff checklist |
| [Glossary](CONTEXT.md) | Shared terminology for source health, Heat, artwork and attention weighting |
| [Design Archive](docs/superpowers/README.md) | Authority boundary for historical specifications and implementation plans |

## 🚀 Quick Start

```bash
npm install
cp backend/.env.example backend/.env
# Edit backend/.env with your NAS MySQL credentials
npm run prisma:generate --workspace backend
npm run prisma:push --workspace backend
```

Start the two services in separate terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Never evaluate domestic adapters directly against the main database. Use `npm run sandbox:prepare`, then `npm run sandbox:sync -- youku` or another accepted domestic source. Run the isolated services with `npm run sandbox:backend` and `npm run sandbox:frontend`, then open `http://127.0.0.1:19995/`.

The frontend defaults to port `19992`, the backend to `19993`. After launch, visit `http://127.0.0.1:19992`.

On first launch, verify source switches, credentials and proxy settings in the settings page. Use the read-only source preview before starting a manual sync. Source sync commands are operations, not database initialization steps.

Prime Video, Hulu, Disney+, Apple TV+, Tencent Video, Douban and TheTVDB are disabled by default and can be enabled from the settings page before manual sync. Max is currently restricted because WBD Pressroom requires login or returns 403. IMDb requires a local datasets cache directory first.

## ⚙️ System Settings

Once both services are running, manage global proxies, source enable state, per-source proxy policies, credentials, connectivity tests and manual sync at `http://127.0.0.1:19992/settings`.

- Settings persist to `backend/.env` (not tracked by Git); saving applies runtime config immediately with no restart
- Sensitive values are never re-filled into inputs or returned in plain text via the API; the page only shows masks
- Global proxies support `HTTP_PROXY` and `HTTPS_PROXY` separately
- Each source supports `inherit` (follow global), `direct` (no proxy) and `custom` (custom proxy)
- Sources currently integrated and syncable: TVmaze, TMDb, Trakt, TheTVDB, Netflix, Prime Video, Hulu, Disney+, Apple TV+, Youku, iQIYI, Tencent Video, Bilibili and Douban; Max and MangoTV are currently blocked, while IMDb is manual local-datasets enrichment
- An integrated source with complete credentials can be previewed while disabled; preview never writes media records or source runs
- Planned, restricted-access and commercial-interface sources are listed for discovery only and cannot be enabled or synced
- Source and settings pages refresh source status every 5 seconds; backend startup marks interrupted `running` sync runs as `failed`
- The settings page controls the hourly interval and daily Beijing time. Saving immediately reschedules future jobs; defaults are every hour at minute `0` and daily at `09:15`

## 🖼️ Poster Acquisition And Delivery

- Source adapters keep their own `posterUrl` when available; Netflix gaps first reuse one unique recent local film or active series, then use a TMDb ID, unique exact title or high-confidence recent candidate
- After startup, hourly and daily scheduled sync batches, up to 40 eligible titles are processed when TMDb is enabled and credential-complete
- If TMDb has no usable artwork, an existing IMDb ID may use an exact OMDb lookup and an existing `tvdbId` may use the free TheTVDB detail endpoint. Neither fallback searches by title, and both require a real download, at least 300×400 pixels and portrait orientation
- Safe duplicates move source refs, popularity and related rows transactionally; external-ID conflicts, artwork-free results and candidates without a clear confidence lead are never force-linked and retry after 3 days
- Manual batch command: `npm run enrich:posters --workspace backend -- --limit=120`, capped at 500 per run
- Frontend posters use `srcset` with `GET /api/media/:id/poster?width=320|640|960`; the browser selects a suitable size and falls back to the original URL if the proxy fails
- Poster slots distinguish unpublished upcoming artwork, ordinary missing artwork and a poster that failed through both proxy and direct delivery
- Original images cache under `backend/.cache/posters/`; responsive WebP variants cache separately under `backend/.cache/poster-variants/`, only shrink and never upscale a low-resolution source
- The original cache defaults to 2 GB and the responsive cache to 512 MB. Startup and daily maintenance evict each cache's oldest complete entries to 90% when over capacity while protecting files written within the last hour
- The iQIYI adapter normalizes known `120×160` and `141×188` official portrait thumbnails to `579×772` before persistence. Existing rows accept that upgrade only for the same stable source identity and asset ID; direct-first loading on the heat page is only a legacy fallback
- The Douban adapter upgrades `s_ratio_poster` to the same asset's `l_ratio_poster`; existing rows require the same stable Douban identity and equivalent asset path. Generic `movie*.jpg` and `tv*.jpg` subject placeholders are treated as missing artwork, while the same subject detail contributes official original titles, aliases and countries to strict identity lookup
- Poster requests and verification persist measured pixel dimensions. Images below 300 pixels wide or 400 pixels high are marked `undersized` separately from network availability failures
- Undersized artwork enters the same strict enrichment queue; replacement still requires strict TMDb identity, the same IMDb ID or the same `tvdbId`, otherwise the original remains available and retries after 3 days
- Poster health separates availability from pixel quality. The settings page and `GET /api/poster-health` expose missing and undersized retry queues plus original/variant cache integrity and capacity
- Requests without `width` preserve upstream bytes and `Content-Type`; supported width requests normally return WebP and safely fall back to the original on conversion failure

> [!WARNING]
> The settings endpoint has no authentication — it is meant only for trusted home LANs or private NAS networks. Do not expose port `19992`, `19993` or the settings endpoint to the public internet.

## 🔥 Popularity History

- Popularity signals are stored scoped by `title + source + platform + region + window + ranking scope`; different platforms and independent subcharts are never mixed into one "true combined chart"
- Trakt keeps movie and series charts separate; Netflix keeps its four language/type charts separate
- Douban upcoming date-group positions, separate movie/series preview hot ranks and TOP250 reputation ranks remain queryable source signals but do not contribute to Heat or popularity movement events
- The unfiltered heat page selects 50 works by Heat and returns every current signal for each work. Signal-level filters switch to source-rank selection
- Within a source, entries are linked to titles via a stable `sourceId`; signals absent from the next full chart become historical
- `rankDelta = previousRank - currentRank`; positive means rising, negative means falling
- Non-current snapshots are retained for 90 days by default; the current snapshot is never removed by the retention policy
- `GET /api/trending` returns only current signals by default, filterable by `movement`, `source`, `platform`, `region`, `mediaType`
- `GET /api/media/:id/popularity-history` supports bounded history queries of 1–90 days, up to 1000 records
- `heatScore` uses only the strongest current dynamic rank for list sorting; every original source, rank, metric and collection time remains visible

## 📡 Data Sources

### Netflix Top 10

The Netflix source reads the official global weekly XLSX and syncs only the latest week's four charts: English films, non-English films, English TV and non-English TV — 40 current signals in total.

- Checked once daily at `09:15` (`Asia/Shanghai`); startup sync still follows `SYNC_ON_START`
- Repeated syncs within the same week stay idempotent by source identity and week
- Downloads use the unified proxy settings, a 10-second timeout and a per-source 2-second rate limit
- Manual sync: `npm run sync:netflix --workspace backend`

### Prime Video / Hulu / Disney+ Official Releases And Max Restriction

Prime Video, Hulu and Disney+ sync official platform pages for release calendars and catalog additions. They do not create popularity rankings. The calendar distinguishes catalog additions, platform premieres and episode updates, so an older title added to a service is not treated as the work's first release.

- Prime Video discovers the latest US monthly lineup from About Amazon and excludes live sports, music and entries without a reliable film/series classification
- Hulu uses `https://press.hulu.com/schedule/`
  - `En Espanol` variants with an original year keep the platform title and add the base title as a strict year-scoped enrichment alias
- Disney+ uses `https://www.disneyplus.com/explore/articles/new-to-disney-plus`
- A platform page does not prove original language or production country; those fields remain unknown unless a work-level source provides them
- The Max parser remains available, but WBD Pressroom currently requires login or returns 403, so the source is restricted and excluded from scheduling
- Prime Video, Hulu and Disney+ are daily schedule sources and disabled by default
- Manual sync:
  - `npm run sync:prime-video --workspace backend`
  - `npm run sync:hulu --workspace backend`
  - `npm run sync:disney-plus --workspace backend`
  - Do not run `npm run sync:max --workspace backend` until public WBD access returns

### Data Quality Maintenance

- Full platform snapshots deactivate source references missing from the newest snapshot
- Current dashboard, discovery, calendar, heat and preview views require at least one active source reference; direct detail remains available for retained history
- Exact work and release dates are reconciled against lifecycle status without guessing undated records
- Stable TMDb, TVmaze, IMDb, Trakt and TheTVDB identities merge only within the same movie/series work kind and only when the connected group has no external-ID conflict
- Artwork selection during a safe merge prefers availability, quality and then measured pixel area while moving all image-health metadata together
- Maintenance commands are dry-run by default: `reconcile:media-statuses`, `reconcile:release-statuses`, `reconcile:heat-scores`, `reconcile:popularity-scopes`, `reconcile:duplicate-identities` and `cleanup:platform-orphans`; append `-- --apply` only after review

### Trakt

Trakt public-data sync requires only `TRAKT_CLIENT_ID`; no user authorization credentials are needed.

- Hourly sync of trending and anticipated lists; `watchers` and `list_count` are kept as two source-specific independent signals
- Daily sync of the next 14 days of film and series release calendars
- The Trakt calendar only denotes film release or series broadcast scheduling — it does not prove content is available on any streaming platform
- Manual sync: `npm run sync:trakt --workspace backend`

### TheTVDB

TheTVDB supports only the free project API Key and never falls back to any paid access method.

- Only free-only project API Keys are supported; `THETVDB_PIN` is optional — leave it empty when not needed
- The source is disabled by default; it joins the daily sync only after the user explicitly sets `SOURCE_THETVDB_ENABLED=true`
- Daily updates read the most recent 48-hour overlap window, with up to 40 detail records backfilled
- Old metadata updates are never force-created as new release titles
- `popularity` does not read `score` and never counts it toward popularity ranking
- Anywhere TheTVDB-provided data is shown on a page, the TheTVDB source attribution is displayed
- Manual sync: `npm run sync:thetvdb --workspace backend`

### Youku, iQIYI And Tencent Video Reservations

- Youku reads paginated movie and series upcoming reservations from the signed `mtop.youku.columbus.gateway.new.execute` node, preserving reservation counts, upcoming status and source links; it no longer reads a channel homepage
- iQIYI reads the complete `https://www.iqiyi.com/newOnlinePCW` upcoming list and preserves reservation counts; offline entries without a date remain upcoming
- Tencent Video uses the structured `getMVLPage` movie and series “coming soon” filters and preserves reservation lower bounds; `publish_date` is work metadata, not a Tencent availability date
- All three belong to the hourly group and must pass in the China sandbox before main-database sync. Disabling a source does not delete persisted snapshots
- Manual sync: `npm run sync:youku --workspace backend`, `npm run sync:iqiyi --workspace backend`, `npm run sync:tencent --workspace backend`

### MangoTV

MangoTV is blocked because the former channel-homepage modules do not provide a trustworthy upcoming/reservation contract. The research adapter and catalog entry remain, but the source is not scheduled and must not be restored as production data from the old homepage flow.

### Bilibili

The Bilibili source reads the pgc season ranking API (`api.bilibili.com/pgc/season/rank/web/list`) and syncs three complete rankings: bangumi, guochuang (Chinese originals) and documentaries (3-day composite score).

- The ranking endpoint requires no WBI signature — plain HTTP JSON; fields include rank, title, poster, view count, follow count, rating and update progress
- "Updated to ep N" maps to `ongoing`/`available`; "Complete / N eps" maps to `ended`; rankings carry no launch date, so releases have no `releaseDate`
- The three rankings are complete snapshots; signals missing from the next sync become historical
- The pgc ranking endpoint may gain signature requirements or go offline at any time; parse failures surface visibly and never fake success
- Manual sync: `npm run sync:bilibili --workspace backend`

### Apple TV+

The Apple TV+ source reads the official Press RSS feed (`https://www.apple.com/tv-pr/news-feed.xml`, Atom XML) and syncs the latest 10 press releases.

- `tv.apple.com` collection returns 404 over local HTTP, so the platform catalog is not scraped; the official RSS feed is used as a `news_signal` source instead
- `<updated>` is the press release date and is used as `releaseDate` (not the exact streaming debut); non-film/TV news (no series/movie/documentary/special keyword) is filtered out
- The source is disabled by default and must be enabled from the settings page before manual sync
- Manual sync: `npm run sync:apple-tv-plus --workspace backend`

### Douban

The Douban source reads the movie TOP250 chart API (`movie.douban.com/j/chart/top_list`) as a reputation rating signal, and separately reads low-frequency paginated mobile movie and TV coming-soon feeds.

- Daily scheduling and `sync:douban` run separate `popularity` and `upcoming` scopes with independent run and health records
- TOP250 emits only media and a rating popularity signal (`sourceCategory: chinese_reputation`)
- Coming-soon feeds emit release calendar rows and preserve page order plus wish counts as the `douban_upcoming` signal
- Movie and series `sortby=hot` feeds each preserve their official top 20 as `douban_upcoming_hot`; the preview timeline stays date-sorted, then promotes and highlights matching titles within each day by hot rank
- `/preview` returns the complete current dated and undated Douban lineup without an arbitrary row cap; each day wraps every poster into a visible grid instead of hiding titles in horizontal overflow
- Douban TOP250 and coming-soon positions do not contribute to Heat or popularity movement events
- Sync endpoints: `m.douban.com/rexxar/api/v2/movie/coming_soon`, `m.douban.com/rexxar/api/v2/tv/coming_soon`
- Disabled by default; enable from the settings page before manual sync. `DOUBAN_COOKIE` is optional. Do not scrape at high frequency or bypass login/captcha
- Manual sync: `npm run sync:douban --workspace backend`

## ✅ Validation

```bash
npm run typecheck
npm run test
npm run build
```

## 📄 License

This project does not yet declare an open-source license. If you intend to distribute it publicly or accept external contributions, consider adding a LICENSE file (e.g. MIT) to clarify usage terms.
