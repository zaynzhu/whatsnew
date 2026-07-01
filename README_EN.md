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
> WhatsNew aggregates signals from TVmaze, TMDb, Trakt, TheTVDB, Netflix, Hulu, Disney+, Max, Youku and iQIYI, keeping per-source popularity history scoped by `title + source + platform + region + window`. Designed for self-hosting on a home LAN or private NAS.

---

## ✨ Features

- **Browse by category** —— Movies, series, anime, variety, short drama, documentaries
- **Today / This week** —— Aggregated new releases and broadcasts across all sources
- **Popularity tracking** —— Rising, new entries, falling, with a 90-day rank timeline
- **Source status** —— Real-time view of each source's sync state and connectivity
- **Independent per-source scope** —— No mixing platforms into one "true combined chart"; each signal is stored separately
- **Global & per-source proxy** —— Global `HTTP_PROXY` / `HTTPS_PROXY`, per-source `inherit` / `direct` / `custom`
- **Hot-reload settings** —— Settings apply immediately after save, no restart needed, sensitive values masked
- **Scheduled + manual sync** —— Cron jobs pull automatically; each source also supports manual sync

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

## 🚀 Quick Start

```bash
npm install
cp backend/.env.example backend/.env
# Edit backend/.env with your NAS MySQL credentials
npm run prisma:generate --workspace backend
npm run prisma:push --workspace backend
npm run sync:tvmaze --workspace backend
npm run sync:tmdb --workspace backend
npm run sync:trakt --workspace backend
npm run sync:netflix --workspace backend
npm run sync:youku --workspace backend
npm run sync:iqiyi --workspace backend
npm run sync:mango-tv --workspace backend
npm run sync:bilibili --workspace backend
npm run sync:apple-tv-plus --workspace backend
npm run sync:douban --workspace backend
npm run dev:backend
npm run dev:frontend
```

The frontend defaults to port `19992`, the backend to `19993`. After launch, visit `http://127.0.0.1:19992`.

Hulu, Disney+, Max, Apple TV+, Douban and TheTVDB are disabled by default and can be enabled from the settings page before manual sync. IMDb requires a local datasets cache directory first.

## ⚙️ System Settings

Once both services are running, manage global proxies, source enable state, per-source proxy policies, credentials, connectivity tests and manual sync at `http://127.0.0.1:19992/settings`.

- Settings persist to `backend/.env` (not tracked by Git); saving applies runtime config immediately with no restart
- Sensitive values are never re-filled into inputs or returned in plain text via the API; the page only shows masks
- Global proxies support `HTTP_PROXY` and `HTTPS_PROXY` separately
- Each source supports `inherit` (follow global), `direct` (no proxy) and `custom` (custom proxy)
- Sources currently integrated and syncable: TVmaze, TMDb, Trakt, TheTVDB, Netflix, Hulu, Disney+, Max, Apple TV+, Youku, iQIYI, MangoTV, Bilibili, Douban; IMDb is manual local-datasets enrichment
- Planned, restricted-access and commercial-interface sources are listed for discovery only and cannot be enabled or synced
- Source and settings pages refresh source status every 5 seconds; backend startup marks interrupted `running` sync runs as `failed`

> [!WARNING]
> The settings endpoint has no authentication — it is meant only for trusted home LANs or private NAS networks. Do not expose port `19992`, `19993` or the settings endpoint to the public internet.

## 🔥 Popularity History

- Popularity signals are stored scoped by `title + source + platform + region + window`; different platforms are never mixed into one "true combined chart"
- Within a source, entries are linked to titles via a stable `sourceId`; signals absent from the next full chart become historical
- `rankDelta = previousRank - currentRank`; positive means rising, negative means falling
- Non-current snapshots are retained for 90 days by default; the current snapshot is never removed by the retention policy
- `GET /api/trending` returns only current signals by default, filterable by `movement`, `source`, `platform`, `region`, `mediaType`
- `GET /api/media/:id/popularity-history` supports bounded history queries of 1–90 days, up to 1000 records
- `heatScore` uses only the strongest rank among a title's current sources for list sorting; the page still shows the original source, rank, value and collection time

## 📡 Data Sources

### Netflix Top 10

The Netflix source reads the official global weekly XLSX and syncs only the latest week's four charts: English films, non-English films, English TV and non-English TV — 40 current signals in total.

- Checked once daily at `09:15` (`Asia/Shanghai`); startup sync still follows `SYNC_ON_START`
- Repeated syncs within the same week stay idempotent by source identity and week
- Downloads use the unified proxy settings, a 10-second timeout and a per-source 2-second rate limit
- Manual sync: `npm run sync:netflix --workspace backend`

### Hulu / Disney+ / Max Official New Releases

Hulu, Disney+ and Max sources sync official platform pages for release calendars and catalog additions. They do not create popularity rankings.

- Hulu uses `https://press.hulu.com/schedule/`
- Disney+ uses `https://www.disneyplus.com/explore/articles/new-to-disney-plus`
- Max uses the WBD Pressroom What's New page; override it with `SOURCE_MAX_BASE_URL`
- All three sources are daily schedule sources and disabled by default
- Manual sync:
  - `npm run sync:hulu --workspace backend`
  - `npm run sync:disney-plus --workspace backend`
  - `npm run sync:max --workspace backend`

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

### MangoTV

The MangoTV source reads `__NUXT__` embedded data from the TV channel page (`https://www.mgtv.com/tv/`) and syncs the "Hot Dramas" and "New Dramas" modules.

- "Hot Dramas" is a complete ranking written as popularity signals; entries missing from the next sync become historical
- "New Dramas" is a platform catalog written as dateless releases; the page provides no specific launch dates
- Reservation and follow-along calendars are not included in this version, as the page exposes no structured date data
- Manual sync: `npm run sync:mango-tv --workspace backend`

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

The Douban source reads the movie TOP250 chart API (`movie.douban.com/j/chart/top_list`) and syncs the top 20 high-score entries as reputation rating signals.

- Emits only media and a rating popularity signal (`sourceCategory: chinese_reputation`); no releases — TOP250 carries no launch dates
- TOP250 is a static chart with stable ranks; low-frequency daily sync takes only the top 20 to control anti-scraping risk
- Disabled by default; enable from the settings page before manual sync. Do not scrape at high frequency or bypass login/captcha
- Manual sync: `npm run sync:douban --workspace backend`

## ✅ Validation

```bash
npm run typecheck
npm run test
npm run build
```

## 📄 License

This project does not yet declare an open-source license. If you intend to distribute it publicly or accept external contributions, consider adding a LICENSE file (e.g. MIT) to clarify usage terms.
