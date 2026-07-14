# WhatsNew Handoff

This is the short operational handoff for the current integration branch. Use the code and Prisma schema as runtime authority; use archived `docs/superpowers/` files only for historical design context.

## Current Branch

- Branch: `codex/whatsnew-mvp`
- Remote: `https://github.com/zaynzhu/whatsnew.git`
- Primary local path: `/Users/zaynzhu/code/claude code/project/whatsnew`

## Runtime Entry Points

- Frontend: `http://127.0.0.1:19992`
- Backend: `http://127.0.0.1:19993`
- Health: `GET /api/health`
- Source health: `GET /api/source-health`
- Poster health: `GET /api/poster-health`
- Media detail route: `/media/:id`

The normal local runtime currently uses the main environment. The domestic sandbox remains isolated in `whatsnew_china_sandbox`, forces scheduling and startup sync off, and must never copy business rows into the main database.

## Current Acceptance Snapshot

Verified against the running main backend on 2026-07-14:

- Source health has 24 adapter scopes: 11 passed and runnable, 13 intentionally blocked, with zero degraded, failed or stale scopes.
- The enabled passing scopes are TVmaze, TMDb, Trakt popularity, Trakt calendar, TheTVDB updates, Netflix, Hulu, Disney+, Tencent Video, Douban popularity and Douban upcoming.
- The dashboard event feed summarizes same-work episode events sharing type, source, platform, region and date into one item with season and episode counts. Media detail keeps the original per-episode event history.
- Tencent Video is no longer sandbox-only. Its accepted main sync contains 208 active source identities and 208 undated upcoming releases; 196 works were created and 12 matched existing identities. All 208 posters passed real verification, with minimum dimensions of `350x490`, and 27 reservation signals were retained.
- The active catalog has 1,452 works, 1,341 posters and 111 missing posters, for 92.4% coverage. All stored posters are healthy; 1,338 are adequate and three are undersized.
- Missing-poster lookup state is zero not attempted, 111 cooling and zero retry-eligible. A fresh Trakt sync added `The Real Wolf of Wall Street`; bounded strict enrichment added its verified `500x750` TMDb poster without bypassing cooldown. The next missing-poster cooldown expiry is 2026-07-16 12:52 Asia/Shanghai.
- The three undersized low-attention posters are cooling until the next replacement window. Source-generic placeholders remain classified as missing instead of healthy artwork.
- The normal frontend and backend are running. The domestic sandbox services are stopped.

## Source Coverage

| Source | Current contract |
|---|---|
| TVmaze | Series and episode schedules. |
| TMDb | Movies, TV, trends and strict metadata/poster enrichment. |
| Trakt | Popularity plus the 14-day movie/series release calendar. |
| TheTVDB | Free-only metadata and exact-ID poster fallback. |
| Netflix | Four validated Tudum Top 10 charts with official XLSX fallback. |
| Prime Video | Official About Amazon US monthly lineup; disabled by default. |
| Hulu | Official press schedule. |
| Disney+ | Official New to Disney+ article. |
| Apple TV+ | Official Press RSS news signals; disabled by default. |
| Youku | Signed MTop upcoming reservation node; disabled in the current main runtime. |
| iQIYI | `newOnlinePCW` upcoming reservation page; disabled in the current main runtime. |
| Tencent Video | Accepted `getMVLPage` movie/series upcoming filters; enabled in the current main runtime. |
| Bilibili | Bangumi, guochuang and documentary rankings; disabled in the current main runtime. |
| Douban | Separate TOP250 popularity and complete movie/TV coming-soon scopes. |
| IMDb | Manual local-datasets enrichment only. |
| Max | Blocked while WBD Pressroom requires login or returns 403. |
| MangoTV | Blocked because the former homepage modules are not a trustworthy upcoming contract. |

## Operational Constraints

- Settings has no authentication and must remain on a trusted private network.
- TheTVDB must stay free-only.
- Trakt public sync needs `TRAKT_CLIENT_ID`; its calendar is not streaming availability.
- Tencent `publish_date` is work metadata, not a Tencent availability date, so accepted Tencent release rows remain undated.
- Platform catalog additions are not work premieres. Preserve release-pattern labels in calendar and dashboard ranking.
- Poster enrichment must retain strict identity boundaries and validate every candidate image before persistence. Transport failures do not start a three-day title cooldown.
- Current listing queries require at least one enabled source reference; direct media details remain available for inactive history.
- Scheduler settings hot-reload after saving. The domestic sandbox always keeps `SCHEDULER_ENABLED=false`.
- `backend/.env`, proxy addresses, credentials, tokens and cookies must not be committed or printed.

## Next Priority

Continue poster-system phase two after the 2026-07-16 cooldown window opens. Recheck the 111 cooling missing titles and three undersized titles without bypassing cooldown, preserving the existing content-attention order and strict TMDb, IMDb and TheTVDB identity rules.

## Validation Baseline

Run before handing off significant changes:

```bash
npm run typecheck
npm test
npm run build
```

Operational spot checks:

```bash
curl -s http://127.0.0.1:19993/api/health
curl -s http://127.0.0.1:19993/api/source-health
curl -s http://127.0.0.1:19993/api/poster-health
```
