
## [2026-07-23] benchmark | exapump bulk-load benchmark + multi-file gotcha (NYC Taxi 38M rows)
Loaded NYC Yellow Taxi 2023 (12 monthly Parquet, 614 MB) into NYC_TAXI.YELLOW_TRIPS via exapump 0.11.2 against local nano (8563, sys, ?tls=1&validateservercertificate=0).
Result: 38,310,226 rows in 72 s total = ~532K rows/s; ~6 s per ~3.2M-row month.
GOTCHA: `exapump upload f1 f2 ... f12 --table T` only imports the FIRST file (exit 0, one row count). Load one file per upload call to append the full set.
GOTCHA: Parquet-header columns are created quoted-lowercase => must reference as "tpep_pickup_datetime"; unquoted folds to upper and errors 42000.
Long-running query for QA: location-pair self-join on Dec data = 137.7 s, 9.9B intermediate rows. See docs/qa/manual-validation-big-data.md.


## [2026-07-24] ingest | Connection Properties page shipped — new page connection-properties; ConnSettings shape + Rust wiring documented
Wired in Rust: hooks, keep-alive, pool size, password policy. Stored-only items tracked in repo tasks.md.
Also this session: MCP gateway service bus (per-connection sql/nl2sql caps + dashboards service), execution log Exec/Fetch/sort/cell-detail.

