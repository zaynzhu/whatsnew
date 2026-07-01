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

## Syncable Sources

| Source | Scope |
|---|---|
| TVmaze | Series and episode schedules. |
| TMDb | Movies, TV, trends and metadata. |
| Trakt | Popularity and 14-day movie/series calendar. |
| TheTVDB | Free-only metadata updates, disabled by default. |
| Netflix | Official global weekly Top 10 XLSX. |
| Hulu | Official press schedule. |
| Disney+ | Official New to Disney+ article. |
| Max | Official WBD Pressroom monthly What's New page. |
| Apple TV+ | Official Press RSS feed (news_signal, filtered to film/TV). |
| Youku | China platform catalog/rank page. |
| iQIYI | China platform new-online page. |
| MangoTV | China TV channel hot drama ranking and new drama catalog. |
| Bilibili | China pgc bangumi/guochuang/documentary rankings (3-day composite). |
| IMDb | Manual local datasets enrichment only. |

## Known Constraints

- Settings API has no authentication and must remain private.
- TheTVDB must stay free-only.
- Trakt public sync only requires `TRAKT_CLIENT_ID`; calendar is not availability.
- Hulu, Disney+ and Max are HTML page parsers. Structure changes should fail visibly, not silently return fake data.
- IMDb datasets do not create new titles; they enrich existing candidates from the local cache.
- `backend/.env` contains secrets and must not be committed.

## Validation Baseline

Use these before handing off significant changes:

```bash
npm run typecheck
npm test
npm run build
```
