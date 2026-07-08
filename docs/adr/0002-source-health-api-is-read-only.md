# Source Health API Is Read-Only

`GET /api/source-health` is an observation surface and must not trigger external sync work. Running adapters belongs to `POST /api/sync` and `POST /api/sources/:source/sync`; keeping health read-only prevents page refreshes, monitors or browser visits from accidentally causing network requests, rate-limit pressure or writes.
