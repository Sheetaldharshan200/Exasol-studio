# Manual Validation — Big-Data Load & Query (NYC Yellow Taxi, 38M rows)

Manual QA test plan for **Exasol Studio** exercised against a large, real dataset.
Every "Expected" value below was measured on this build against the loaded data —
they are ground truth, not estimates. Run each case in the app UI and tick the
result.

- **Build / connection:** local Exasol nano (Docker), `127.0.0.1:8563`, user `sys`.
- **Dataset:** NYC TLC Yellow Taxi trips, calendar year **2023**, 12 monthly Parquet files.
- **Loaded table:** `NYC_TAXI.YELLOW_TRIPS` — **38,310,226 rows**, 19 columns.
- **Loader:** `exapump 0.11.2` (bundled bulk IMPORT path), or the Studio **Load Data** dialog.
- **Tester:** ________________   **Date:** ____________   **Overall PASS / FAIL:** ______

> ⚠️ **Column names are quoted, case-sensitive, lowercase** (they came from the
> Parquet header). You **must** write `"tpep_pickup_datetime"`, not
> `tpep_pickup_datetime`. Unquoted names fold to upper-case and fail with
> `object ... not found (42000)`. This is itself a test case (F8).

---

## 0. How the dataset was created (reproduce the load)

```bash
# 1. Download 12 months of public NYC Yellow Taxi Parquet (~614 MB, no login)
BASE="https://d37ci6vzurychx.cloudfront.net/trip-data"
for m in 01 02 03 04 05 06 07 08 09 10 11 12; do
  curl -O "$BASE/yellow_tripdata_2023-$m.parquet"
done

# 2. Point exapump at the local DB (TLS on, cert validation off for local nano)
export EXAPUMP_DSN="exasol://sys:exasol@127.0.0.1:8563?tls=1&validateservercertificate=0"
BIN="$HOME/Library/Application Support/com.exasol.studio/personal-local/bin/exapump"

# 3. Create schema, then load each file (append into one table)
"$BIN" sql "CREATE SCHEMA IF NOT EXISTS NYC_TAXI"
for f in yellow_tripdata_2023-*.parquet; do
  "$BIN" upload "$f" --table NYC_TAXI.YELLOW_TRIPS
done
```

> 🐞 **Known loader gotcha (LD5):** passing *all 12 files as positional args to a
> single `upload`* only imports the **first** file (3,066,766 rows), exits 0, and
> reports one number. Load files **one per `upload` call** to append the full set.
> In the app, prefer the **Load Data** dialog / right-click **"Load into database"**.

### Measured pump benchmark (ground truth for LD3)

| Metric | Value |
|---|---|
| Files | 12 Parquet (monthly) |
| On-disk size | 614 MB (compressed Parquet) |
| Rows loaded | **38,310,226** |
| Total wall time | **72 s** (12 sequential single-file uploads) |
| Throughput | **≈ 532,000 rows/sec** (~8.5 MB/s of compressed Parquet) |
| Per month | ~2.8–3.5 M rows in **5–8 s** each |

Per-file breakdown: Jan 3,066,766 (6s) · Feb 2,913,955 (5s) · Mar 3,403,766 (7s) ·
Apr 3,288,250 (6s) · May 3,513,649 (6s) · Jun 3,307,234 (6s) · Jul 2,907,108 (5s) ·
Aug 2,824,209 (8s) · Sep 2,846,722 (5s) · Oct 3,522,285 (6s) · Nov 3,339,715 (6s) ·
Dec 3,376,567 (6s). The 72 s includes 12 separate process spawns + TLS handshakes;
a single-connection load of one file is ~6 s for ~3 M rows.

---

## A. Data-load validation

| ID | Steps | Expected | P/F |
|---|---|---|---|
| **LD1** | Load one month via Studio **Load Data** dialog (Parquet). | Table auto-created; inferred schema shown; row count reported matches file (~3 M). | ☐ |
| **LD2** | `SELECT COUNT(*) FROM NYC_TAXI.YELLOW_TRIPS` after full load. | **38310226**. | ☐ |
| **LD3** | Time a full 12-file load (see §0). | Completes in **~60–90 s**; ≈ 500K+ rows/s. No errors. | ☐ |
| **LD4** | Inspect inferred types (`DESCRIBE NYC_TAXI.YELLOW_TRIPS`). | `"tpep_pickup_datetime"` TIMESTAMP, `"total_amount"` DOUBLE, `"VendorID"` DECIMAL(36,0), `"store_and_fwd_flag"` VARCHAR. | ☐ |
| **LD5** | Pass all 12 files to ONE `upload` command. | Only first file loads (3,066,766). Confirms the gotcha — use per-file loads. | ☐ |
| **LD6** | Re-run a single-file `upload` into the existing table. | Rows **append** (count grows by that file's rows), no schema conflict. | ☐ |

---

## B. Read / aggregation correctness

Simple aggregations are **sub-second** on Exasol (columnar) even at 38 M rows —
these validate correctness AND that the result grid renders fast.

| ID | SQL (run in a query tab) | Expected | P/F |
|---|---|---|---|
| **B1** | `SELECT COUNT(*) c, MIN("tpep_pickup_datetime") mn, MAX("tpep_pickup_datetime") mx FROM NYC_TAXI.YELLOW_TRIPS` | c=**38310226**, mn=**2001-01-01**, mx=**2024-01-03** (dirty dates present). ~140 ms. | ☐ |
| **B2** | `SELECT EXTRACT(MONTH FROM "tpep_pickup_datetime") m, COUNT(*) trips, ROUND(SUM("total_amount"),0) rev FROM NYC_TAXI.YELLOW_TRIPS WHERE "tpep_pickup_datetime">=DATE '2023-01-01' AND "tpep_pickup_datetime"<DATE '2024-01-01' GROUP BY 1 ORDER BY 1` | 12 rows. Jan trips=3,066,726 rev≈82.9 M; May trips=3,513,664 rev≈101.8 M; Dec trips=3,376,527 rev≈96.4 M. ~170 ms. | ☐ |
| **B3** | `SELECT "payment_type", COUNT(*) n FROM NYC_TAXI.YELLOW_TRIPS GROUP BY 1 ORDER BY 2 DESC` | type 1 (card)=**29,856,932**; 2 (cash)=**6,405,059**; 0=1,309,356; 4=498,015; 3=240,862; 5=2. | ☐ |
| **B4** | `SELECT COUNT(DISTINCT "tpep_pickup_datetime") FROM NYC_TAXI.YELLOW_TRIPS` | **19,448,115**. Takes ~1.8 s (spinner should show, UI stays responsive). | ☐ |
| **B5** | `SELECT COUNT(*) FROM NYC_TAXI.YELLOW_TRIPS WHERE "tpep_pickup_datetime" < DATE '2023-01-01' OR "tpep_pickup_datetime" >= DATE '2024-01-01'` | **104** (dirty rows outside 2023 — data-quality assertion). | ☐ |

---

## C. Long-running query + cancel

| ID | Steps | Expected | P/F |
|---|---|---|---|
| **C1** | Run the self-join (huge fan-out):<br>`SELECT COUNT(*) FROM NYC_TAXI.YELLOW_TRIPS a JOIN NYC_TAXI.YELLOW_TRIPS b ON a."PULocationID"=b."PULocationID" AND a."DOLocationID"=b."DOLocationID" WHERE a."tpep_pickup_datetime">=DATE '2023-12-01' AND b."tpep_pickup_datetime">=DATE '2023-12-01'` | Runs **~2m18s** (measured 137.7 s), returns **9,945,572,639**. During the run: a running/elapsed indicator, the tab stays busy, **other tabs remain usable**, app does not freeze. | ☐ |
| **C2** | Start C1 again, then click **Cancel/Stop** after ~10 s. | Query aborts promptly; tab returns to idle; a "cancelled" state (not a crash); a new query in the same tab works immediately after. | ☐ |
| **C3** | While C1 runs, open a second tab and run B1. | B1 returns in ~140 ms independently — long query does not block the session/UI. | ☐ |

---

## D. Many SELECTs + aggregation in a single query tab (multi-statement)

Paste this whole block into **one** query tab and run:

```sql
SELECT COUNT(*) FROM NYC_TAXI.YELLOW_TRIPS;
SELECT "payment_type", COUNT(*) FROM NYC_TAXI.YELLOW_TRIPS GROUP BY 1 ORDER BY 2 DESC;
SELECT EXTRACT(MONTH FROM "tpep_pickup_datetime") m, ROUND(AVG("trip_distance"),2) avg_mi,
       ROUND(AVG("tip_amount"),2) avg_tip FROM NYC_TAXI.YELLOW_TRIPS GROUP BY 1 ORDER BY 1;
SELECT "PULocationID", COUNT(*) n, ROUND(SUM("total_amount"),0) rev
  FROM NYC_TAXI.YELLOW_TRIPS GROUP BY 1 ORDER BY n DESC LIMIT 25;
SELECT ROUND(AVG("passenger_count"),3) FROM NYC_TAXI.YELLOW_TRIPS;
```

| ID | Expected | P/F |
|---|---|---|
| **D1** | All 5 statements execute in order; each result is presented separately (result-set switcher / stacked grids / per-statement tabs). | ☐ |
| **D2** | Statement 1 = 38310226; statement 3 = 12 monthly rows; statement 4 = 25 rows ordered by n desc. | ☐ |
| **D3** | Total elapsed is reported; no statement's result silently overwrites another's. | ☐ |
| **D4** | Add a **failing** statement in the middle (e.g. `SELECT 1/0;` as statement 3) and re-run. Verify the app's documented policy: it either stops at the error or continues and clearly flags which statement failed (SQLSTATE **22012**) — never reports overall success. | ☐ |

---

## E. Large result-set rendering (grid stress)

| ID | Steps | Expected | P/F |
|---|---|---|---|
| **E1** | `SELECT * FROM NYC_TAXI.YELLOW_TRIPS` (no LIMIT). | App caps/streams the grid (does **not** try to render 38 M rows in the DOM); shows a fetched-row indicator and/or "showing first N"; UI stays responsive; memory stable. | ☐ |
| **E2** | `SELECT * FROM NYC_TAXI.YELLOW_TRIPS ORDER BY "total_amount" DESC LIMIT 100000` | Returns 100k rows; grid scrolls smoothly (virtualized); no freeze. | ☐ |
| **E3** | Export the E2 result (CSV) from the result grid. | Export completes; file row count matches; no truncation without warning. | ☐ |
| **E4** | Widen/inspect the `"store_and_fwd_flag"` (VARCHAR up to 2 000 000) and TIMESTAMP columns. | Values render correctly ('Y'/'N', full timestamps); no layout break. | ☐ |

---

## F. Failure & error handling (exact messages measured on this build)

Each should surface the error clearly (message + SQLSTATE), keep the tab usable,
and **not** mark the run successful.

| ID | SQL | Expected error | SQLSTATE | P/F |
|---|---|---|---|---|
| **F1** | `SELCT 1` | `syntax error, unexpected UNSIGNED_INTEGER_...` | 42000 | ☐ |
| **F2** | `SELECT * FROM NYC_TAXI.NOPE` | `object NYC_TAXI.NOPE not found` | 42000 | ☐ |
| **F3** | `SELECT 1 AS AT` (reserved word as alias) | `syntax error, unexpected AT_...` | 42000 | ☐ |
| **F4** | `SELECT 1 AS "AT"` (quoted) | **Succeeds** — 1 row. Confirms the reserved-word fix path. | — | ☐ |
| **F5** | `SELECT 1/0` | `data exception - division by zero` | 22012 | ☐ |
| **F6** | `SELECT CAST('hello' AS DECIMAL)` | `invalid character value for cast; Value: 'hello'` | 22018 | ☐ |
| **F7** | `SELECT CAST(1e30 AS DECIMAL(5,0))` | `numeric value out of range ... not in [ -99999 .. 99999 ]` | 22003 | ☐ |
| **F8** | `SELECT tpep_pickup_datetime FROM NYC_TAXI.YELLOW_TRIPS LIMIT 1` (unquoted → upper-cased) | `object TPEP_PICKUP_DATETIME not found` (case-sensitivity gotcha) | 42000 | ☐ |
| **F9** | A write without confirming: `DROP TABLE NYC_TAXI.YELLOW_TRIPS` | **Approval gate** appears; nothing runs until confirmed; **Cancel** leaves the table intact. | — | ☐ |
| **F10** | Disconnect the DB (stop the nano container) then run B1. | Clear connection error, not a silent hang; reconnect path offered. | — | ☐ |

---

## G. Performance / profiling button

| ID | Steps | Expected | P/F |
|---|---|---|---|
| **G1** | Run B2, then click the per-query **Performance** button. | Profile/analysis tab opens: time-share bars, step table (EXA_STATISTICS parts), computed bottleneck callout. | ☐ |
| **G2** | Profile the long self-join **C1**. | Profiling attributes most time to the join/fan-out step; callout flags join selectivity / fan-out; wall time roughly matches the ~2m18s observed. | ☐ |
| **G3** | Profile a spilling query (H1). | Disk-spill / temp-write step is visible and flagged. | ☐ |

---

## H. Spill / out-of-memory stress (optional, heavy)

The nano container is capped ~7.7 GB RAM — these are meant to push it.

| ID | SQL | Expected | P/F |
|---|---|---|---|
| **H1** | Unbounded self-join (full year, both sides):<br>`SELECT COUNT(*) FROM NYC_TAXI.YELLOW_TRIPS a JOIN NYC_TAXI.YELLOW_TRIPS b ON a."PULocationID"=b."PULocationID"` | Either completes very slowly (minutes, with disk spill visible in profiling) **or** fails with a clear resource/temp-space error — **never** a silent hang or app crash. | ☐ |
| **H2** | Big DISTINCT/sort:<br>`SELECT DISTINCT "tpep_pickup_datetime","tpep_dropoff_datetime","PULocationID","DOLocationID","total_amount" FROM NYC_TAXI.YELLOW_TRIPS ORDER BY 1` | Runs seconds-to-minutes; result streamed/capped in grid; UI responsive; graceful outcome. | ☐ |
| **H3** | Cancel H1 mid-flight. | Aborts cleanly; server temp space released; session reusable. | ☐ |

---

## Sign-off

| Section | Result | Notes |
|---|---|---|
| A. Data load | ☐ PASS ☐ FAIL | |
| B. Aggregation correctness | ☐ PASS ☐ FAIL | |
| C. Long-running + cancel | ☐ PASS ☐ FAIL | |
| D. Multi-statement tab | ☐ PASS ☐ FAIL | |
| E. Large result set | ☐ PASS ☐ FAIL | |
| F. Error handling | ☐ PASS ☐ FAIL | |
| G. Profiling | ☐ PASS ☐ FAIL | |
| H. Spill/OOM stress | ☐ PASS ☐ FAIL | |

**Cleanup:** `DROP SCHEMA NYC_TAXI CASCADE;` (goes through the approval gate).
