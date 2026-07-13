# WhatsNew Integration Guide

WhatsNew exposes a private JSON API for dashboards, scripts and local tools. It is currently intended for trusted LAN/NAS use only.

## Base URL

```text
http://127.0.0.1:19993
```

## Health

```bash
curl -s http://127.0.0.1:19993/api/health
```

Expected:

```json
{ "ok": true, "service": "whatsnew-backend" }
```

## Media Browse

```bash
curl -s "http://127.0.0.1:19993/api/media?mediaType=movie&sort=heat&limit=20"
```

Common query fields:

| Query | Meaning |
|---|---|
| `mediaType` | `movie`, `series` or other stored media type. |
| `releaseForm` | More specific form such as web series, anime, variety or documentary. |
| `status` | Stored status such as `upcoming`, `available` or `unknown`. |
| `sort` | `heat`, `firstReleaseDate`, `updatedAt`. |
| `limit` | Max 100. |

## Media Detail

```bash
curl -s http://127.0.0.1:19993/api/media/<mediaItemId>
```

Returns the media item plus releases, source refs, current popularity signals and change events.

## Media Poster

```bash
curl -sS -D - -o poster.bin http://127.0.0.1:19993/api/media/<mediaItemId>/poster
curl -sS -D - -o poster.webp 'http://127.0.0.1:19993/api/media/<mediaItemId>/poster?width=320'
```

Without a query parameter, the backend fetches the stored remote poster through the configured outbound proxy, validates that the response is an image, caches it by URL hash and returns the original bytes and `Content-Type`. `width` accepts `160`, `320`, `640` or `960`; it returns a WebP derivative and never enlarges a smaller source image.

| Response | Meaning |
|---|---|
| `200` | Image body. `X-Poster-Cache` is `hit` or `miss`. |
| `404 media_not_found` | The media item does not exist. |
| `404 poster_not_found` | The media item has no stored poster URL. |
| `400 invalid_poster_width` | `width` is not one of `160`, `320`, `640` or `960`. |
| `502 poster_unavailable` | The remote image could not be fetched or did not pass validation. |

Responses are browser-cacheable for one day with a seven-day `stale-while-revalidate` window. `X-Poster-Cache` is `hit`, `miss` or `stale`; stale means an expired original disk copy was served because refresh failed. Width requests also return `X-Poster-Variant-Cache: hit|miss|fallback` and `X-Poster-Width`; `fallback` means transformation failed and the original format was returned.

`GET /api/poster-health` returns title coverage, `unverified / healthy / degraded / broken` availability counts, `unknown / adequate / undersized` quality counts, lookup retry state, disk-cache integrity and high-priority samples. `lookup` counts missing titles as `notAttempted`, `cooldown` or `retryEligible` using the seven-day strict-enrichment window. Missing samples include `lookupState` and ISO `lastLookupAt`. `cache` describes original entries while `cache.variants` describes responsive WebP derivatives; both include entry count, bytes, orphaned files and corrupt entries. `cache.variants.maxBytes` exposes the automatic capacity boundary. The endpoint is read-only and performs no external requests.

## Popularity History

```bash
curl -s "http://127.0.0.1:19993/api/media/<mediaItemId>/popularity-history?days=30&limit=300"
```

| Query | Meaning |
|---|---|
| `source` | Optional source filter, for example `trakt_trending`. |
| `days` | 1-90, default 30. |
| `limit` | 1-1000, default 300. |

## Trending

```bash
curl -s "http://127.0.0.1:19993/api/trending?movement=rising&source=trakt_trending"
```

| Query | Meaning |
|---|---|
| `movement` | `new`, `rising`, `falling`, `stable`. |
| `source` | Source-specific signal, for example `trakt_trending`, `netflix_top10`, `youku_reserve`, `iqiyi_reserve` or `tencent_reserve`. |
| `platform` | Stored signal platform label such as `Netflix`, `Trakt`, `优酷`, `爱奇艺` or `腾讯视频`; use the Chinese values for domestic reservation sources. |
| `region` | Region code or `GLOBAL`. |
| `mediaType` | Media type filter. |
| `releaseForm` | Release form filter. |
| `window` | Source-specific window such as `week`. |

## Calendar

```bash
curl -s "http://127.0.0.1:19993/api/calendar?from=2026-07-01&to=2026-07-07&region=US"

# Month overview only: items stays empty and days contains up to three featured releases per date.
curl -s "http://127.0.0.1:19993/api/calendar?from=2026-07-01&to=2026-07-31&summary=true"
```

| Query | Meaning |
|---|---|
| `from`, `to` | Inclusive date window. Defaults to the current upcoming window. |
| `platform` | Platform label. |
| `region` | Region code. |
| `mediaType` | Media type filter. |
| `releaseForm` | Release form filter. |
| `summary` | Set to `true` for the lightweight month overview used by the poster calendar. |

The response contains `items` for the requested date window and `days` with each date's total release count and up to three poster-first featured releases. With `summary=true`, `items` is empty.

## Sources

```bash
curl -s http://127.0.0.1:19993/api/sources
```

Returns the source catalog, implementation state, enablement, local state, manual commands and aggregated latest run.

Preview one active source before enabling it:

```bash
curl -X POST http://127.0.0.1:19993/api/sources/prime_video/preview
curl -X POST http://127.0.0.1:19993/api/sources/tencent/preview
```

The response summarizes item counts, media types, release patterns, source scopes, date coverage, poster coverage and up to 12 samples. Preview requires complete credentials when the source needs them, but does not require the source switch to be enabled. It calls the registered adapters without creating media, release, popularity or sync-run records.

## Source Health

```bash
curl -s http://127.0.0.1:19993/api/source-health
```

Returns a read-only source health matrix by adapter scope. It does not trigger sync. Use `POST /api/sync` or `POST /api/sources/:source/sync` before reading this endpoint when you want a fresh run.

Top-level shape:

```json
{
  "generatedAt": "2026-07-08T04:00:00.000Z",
  "summary": {
    "total": 23,
    "passed": 8,
    "degraded": 1,
    "failed": 2,
    "blocked": 12,
    "runnable": 10,
    "stale": 2
  },
  "items": []
}
```

Each item is keyed by `sourceId + scope` and includes `runStatus`, `acceptanceStatus`, `freshnessStatus`, `reasonCode`, `reason`, `latestRun`, `lastSuccessAt`, `staleAfterHours` and up to 3 persisted `samples`.

Manual sync:

```bash
curl -X POST http://127.0.0.1:19993/api/sources/trakt/sync
```

Full sync — run every enabled adapter with complete credentials, serially:

```bash
curl -X POST http://127.0.0.1:19993/api/sync
```

Returns `{ "items": [SourceSyncRun, ...] }`. Adapters with missing credentials are skipped.

Possible sync errors:

| Error | Meaning |
|---|---|
| `source_not_implemented` | The catalog entry has no adapter. |
| `source_disabled` | The source switch is off. |
| `credential_missing` | Required credential fields are empty. |

## Settings

```bash
curl -s http://127.0.0.1:19993/api/settings
```

Update settings:

```bash
curl -s -X PUT http://127.0.0.1:19993/api/settings \
  -H "content-type: application/json" \
  -d '{"values":{"SOURCE_HULU_ENABLED":"true"},"clearKeys":[]}'
```

Settings are persisted to `backend/.env` and become effective immediately. Sensitive values are masked on read.

`GET /api/settings` includes `scheduler` with runtime enablement, hourly interval, daily time, timezone and next-run timestamps. Update `SCHEDULER_HOURLY_INTERVAL_HOURS` (`1, 2, 3, 4, 6, 12`) or `SCHEDULER_DAILY_TIME` (`HH:mm`) through the same `PUT` route; accepted changes reschedule future jobs immediately. `SCHEDULER_ENABLED=false` still disables registration at process startup, as used by the China sandbox.

Proxy test:

```bash
curl -s -X POST http://127.0.0.1:19993/api/settings/proxy/test \
  -H "content-type: application/json" \
  -d '{"HTTP_PROXY":"http://127.0.0.1:7897","HTTPS_PROXY":"http://127.0.0.1:7897"}'
```

Do not expose settings routes to the public internet.
