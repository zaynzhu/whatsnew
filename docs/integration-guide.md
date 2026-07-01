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

Manual sync:

```bash
curl -X POST http://127.0.0.1:19993/api/sources/trakt/sync
```

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
