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
```

The backend fetches the stored remote poster through the configured outbound proxy, validates that the response is an image, caches it by URL hash and returns the original bytes and `Content-Type`.

| Response | Meaning |
|---|---|
| `200` | Image body. `X-Poster-Cache` is `hit` or `miss`. |
| `404 media_not_found` | The media item does not exist. |
| `404 poster_not_found` | The media item has no stored poster URL. |
| `502 poster_unavailable` | The remote image could not be fetched or did not pass validation. |

Responses are browser-cacheable for one day with a seven-day `stale-while-revalidate` window. The route does not guarantee a transcoded image format.

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
| `source` | Source-specific signal, for example `trakt_trending` or `netflix_top10`. |
| `platform` | Platform label such as `Netflix`, `Hulu`, `Trakt`. |
| `region` | Region code or `GLOBAL`. |
| `mediaType` | Media type filter. |
| `releaseForm` | Release form filter. |
| `window` | Source-specific window such as `week`. |

## Calendar

```bash
curl -s "http://127.0.0.1:19993/api/calendar?from=2026-07-01&to=2026-07-07&region=US"
```

| Query | Meaning |
|---|---|
| `from`, `to` | Inclusive date window. Defaults to the current upcoming window. |
| `platform` | Platform label. |
| `region` | Region code. |
| `mediaType` | Media type filter. |
| `releaseForm` | Release form filter. |

## Sources

```bash
curl -s http://127.0.0.1:19993/api/sources
```

Returns the source catalog, implementation state, enablement, local state, manual commands and aggregated latest run.

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

Proxy test:

```bash
curl -s -X POST http://127.0.0.1:19993/api/settings/proxy/test \
  -H "content-type: application/json" \
  -d '{"HTTP_PROXY":"http://127.0.0.1:7897","HTTPS_PROXY":"http://127.0.0.1:7897"}'
```

Do not expose settings routes to the public internet.
