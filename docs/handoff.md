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

Verified against the running main backend on 2026-07-18 at 23:13 CST:

- Source health has 24 adapter scopes: 17 passed, seven intentionally blocked and zero degraded, failed or stale scopes. Sixteen passed scopes are runnable; IMDb remains a passed manual-cache scope.
- The passing scopes are TVmaze, TMDb, Trakt popularity, Trakt calendar, TheTVDB updates, Netflix, Prime Video, Hulu, Disney+, Apple TV+, Youku, iQIYI, Tencent Video, Bilibili, Douban popularity, Douban upcoming and IMDb datasets cache.
- Bilibili and both Douban scopes were safely retried on 2026-07-18 after stale health results. The latest successful runs contain Bilibili `297`, Douban popularity `20` and Douban upcoming `208` items, restoring source health to the full 17-pass target.
- The latest accepted item counts for the other daily focus sources are Netflix `40`, Prime Video `78`, Apple TV+ `6`, TheTVDB `40` and Trakt calendar `208`; the latest hourly runs contain TVmaze `238`, TMDb `79`, Trakt popularity `199`, Youku `237`, iQIYI `285` and Tencent Video `206` items.
- IMDb's latest accepted manual cache sync is still the 2026-07-14 run: `804` matched dataset rows, no created works or events, and persisted current rating signals for existing titles only.
- The dashboard event feed still summarizes same-work episode events sharing type, source, platform, region and date into one item with season and episode counts, and media detail keeps the original per-episode event history.
- The dashboard event feed no longer repeats `source_failed` rows sharing one source and UTC `eventAt` date. TMDb's 2026-07-16 timeout history remains stored, but the dashboard now keeps only the latest semantic failure entry for that date and source.
- The active catalog has `2,408` works, `2,281` posters and `127` missing posters, for `94.7%` coverage. Poster status is `2,276 healthy`, `1 degraded`, `4 broken` and `0 unverified`; poster quality is `2,273 adequate`, `3 undersized` and `5 unknown`.
- Missing-poster lookup state is `0 not attempted`, `127 cooling` and `0 retry eligible`. Replacement state for undersized posters is `3 cooling`, `0 retry eligible`. The four broken posters and one degraded poster are Bilibili-origin animation rows under normal backoff.
- The normal frontend and backend are running. The domestic sandbox services are stopped.

## Source Coverage

| Source | Current contract |
|---|---|
| TVmaze | Series and episode schedules. |
| TMDb | Movies, TV, trends and strict metadata/poster enrichment. |
| Trakt | Popularity plus the 14-day movie/series release calendar. |
| TheTVDB | Free-only metadata and exact-ID poster fallback. |
| Netflix | Four validated Tudum Top 10 charts with official XLSX fallback. |
| Prime Video | Official About Amazon US monthly lineup; enabled in the current main runtime with 78 accepted entries. |
| Hulu | Official press schedule. |
| Disney+ | Official New to Disney+ article. |
| Apple TV+ | Official Press RSS news signals with article-confirmed premiere dates only; enabled in the current main runtime. |
| Youku | Signed MTop upcoming reservation node; enabled in the current main runtime. |
| iQIYI | `newOnlinePCW` upcoming reservation page; enabled in the current main runtime. |
| Tencent Video | Accepted `getMVLPage` movie/series upcoming filters; enabled in the current main runtime. |
| Bilibili | Independent bangumi, guochuang and documentary rankings; enabled in the current main runtime with 297 accepted entries. |
| Douban | Separate TOP250 popularity and complete movie/TV coming-soon scopes. |
| IMDb | Manual local-datasets enrichment; the current cache sync matched 804 existing works and wrote 615 rating signals without creating media. |
| Max | Blocked while WBD Pressroom returns 403; recovery testing targets the durable official HBO Max brand release listing. |
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

Continue normal poster-maintenance follow-up on the `127` cooling missing titles, `3` undersized titles, `4` cooling broken Bilibili posters and `1` newly degraded Bilibili poster without bypassing cooldown or relaxing strict TMDb, IMDb and TheTVDB identity rules.

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
