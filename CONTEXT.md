# WhatsNew Glossary

WhatsNew tracks film and TV release, availability and popularity signals from multiple public sources while preserving each source's original meaning.

## Language

**Source Health Matrix**:
A stage-gate view of every configured adapter scope showing whether it is enabled, runnable, recently synced, producing real items, fresh enough for its cadence, and failing for an explainable reason when it fails. It also lists planned, commercial, restricted and unimplemented sources as blocked coverage rows. Source-level health is a rollup of these rows, not the primary acceptance unit.
_Avoid_: source list, platform checklist, sync dashboard

**Adapter Scope**:
A separately runnable capability for a source, such as `trakt:popularity`, `trakt:calendar` or `imdb:datasets_cache`.
_Avoid_: source module, sub-source

**Stale Scope**:
An adapter scope whose latest successful run is too old for its cadence: more than 6 hours for hourly scopes, more than 36 hours for daily scopes, or never successful. Manual scopes such as IMDb are judged by local cache readiness and last sync, not by the hourly or daily stale thresholds.
_Avoid_: old source, outdated platform

**Source Health API**:
A backend JSON surface that exposes the Source Health Matrix by adapter scope before any frontend presentation is built.
_Avoid_: health page, visual dashboard

**Source Health Summary**:
A rollup returned by the Source Health API alongside detailed matrix rows, counting total, passed, degraded, failed, blocked, runnable and stale rows for dashboards and alerts.
_Avoid_: frontend counter, derived UI state

**Reason Code**:
A shared machine-readable explanation for an adapter scope's Acceptance Status, paired with a human-readable reason. It lets backend, frontend, tests, UI filters, alerts and colors depend on stable codes instead of parsing display text.
_Avoid_: reason text, error message

**Acceptance Status**:
The first-level outcome for an adapter scope in the Source Health Matrix: `passed`, `degraded`, `failed` or `blocked`. `passed` means fresh trustworthy data; `degraded` means usable recent data exists but the latest run has a warning or failure; `failed` means the scope is runnable but has no fresh trustworthy data; `blocked` means the scope should not be judged because it is disabled, missing credentials, planned, commercial, restricted or unimplemented.
_Avoid_: health status, sync status

**Run Status**:
The latest observed execution state for an adapter scope, such as `running`, `success`, `warning`, `failed` or `none`. Run Status is separate from Acceptance Status because a scope can be currently failing while still having fresh usable data, or recently successful while already stale.
_Avoid_: acceptance status, health status

**Acceptance Sample**:
A small evidence record returned by the Source Health API to support human real-data acceptance for an adapter scope. It is read from persisted database records, limited to a few representative records, and is not a business listing API.
_Avoid_: source item list, full results

**Empty Result Policy**:
The rule that an enabled and runnable adapter scope returning zero items fails Real Data Acceptance by default. A scope may treat an empty result as acceptable only when it explicitly declares that behavior, such as a future notification-like source where no new records can be a valid outcome.
_Avoid_: no data is fine, silent empty success

**Health Policy**:
Adapter-scope metadata that defines how a scope is judged in the Source Health Matrix, including stale thresholds, empty result behavior, expected signal kinds and sample strategy. It belongs with adapter registration because health is judged per Adapter Scope, not only per source.
_Avoid_: source health config, catalog health flag

**Connectivity Check**:
A point-in-time network reachability check for a source. It can explain failures but is not a first-version hard gate for Real Data Acceptance.
_Avoid_: source health, acceptance result

**Real Data Acceptance**:
The process of running adapter scopes against live data and deciding whether each scope's records are trustworthy enough to appear in the product. A scope passes when it uses a real source, finishes as `success` or explainable `warning`, produces data when data is expected, exposes source attribution, and keeps records aligned to the scope's signal kind.
_Avoid_: demo validation, mock data check

**Source Signal**:
A source-specific popularity, catalog, release, rating, availability or news observation that keeps its original source, platform, region and time window.
_Avoid_: unified ranking, global score

**Ranking Scope**:
A stable identity for one independent chart inside a source. Trakt uses separate movie and series scopes; Netflix uses four language/type scopes. It prevents several legitimate number-one entries from being presented as one shared chart.
_Avoid_: category label, global rank

**Auxiliary Heat**:
A list-sorting value derived from a title's strongest current dynamic source rank. It is not a cross-source real chart. Douban coming-soon date-group positions, separate movie/series `sortby=hot` preview ranks and TOP250 reputation ranks remain visible source signals but contribute no Heat and create no popularity movement events.
_Avoid_: comprehensive heat, objective popularity, global rank

**Content Attention Weight**:
A user-controlled preference from 0 to 100 for a broad content category, used to decide what deserves visual prominence without changing any source's popularity meaning.
_Avoid_: heat score, source rank, global popularity

**Featured Score**:
An internal presentation priority that combines Content Attention Weight, current source-backed heat, release timing and artwork readiness to select dashboard features. It is not exposed as an objective ranking.
_Avoid_: comprehensive heat, global ranking, popularity score

**Poster Enrichment**:
A metadata pass that first reuses one safe recent local title, then fills missing artwork and baseline fields using a TMDb ID, unique normalized exact-title match or high-confidence recent Netflix candidate. Safe duplicates merge transactionally; unresolved ambiguity retries after a cooldown.
_Avoid_: image scraping, fuzzy poster matching, one-time backfill

**Poster Proxy**:
The backend route `/api/media/:id/poster`, which fetches a stored remote poster with configured network settings, validates and caches original bytes, and optionally serves bounded `160 / 320 / 640 / 960` WebP variants. Variants only shrink and safely fall back to the original when conversion fails.
_Avoid_: image hosting service, guaranteed upscale, frontend hotlink

**Content Attention Category**:
A stable product grouping used by Content Attention Weight, such as scripted film and series, animation, documentary, reality and variety, talk and game shows, news, or sports.
_Avoid_: source content type, media type, genre
