---
name: exasol-sql
description: Exasol SQL dialect essentials — syntax, metadata, profiling, tuning
---

# Exasol SQL

Dialect:
- Pagination: `LIMIT n` (NEVER `FETCH FIRST`, `TOP`, or `ROWNUM`).
- Window filtering: `QUALIFY` (e.g. `QUALIFY ROW_NUMBER() OVER (PARTITION BY c ORDER BY d) = 1`).
- Identity/auto-increment: `IDENTITY` columns.
- Unquoted identifiers fold to UPPERCASE; double-quote to preserve case or use reserved words.
- Reserved words are NOT valid as bare aliases — VALUE, TYPE, ORDER, etc. Alias as TOTAL, VAL, etc.
- String concat: `||`. Current time: `CURRENT_TIMESTAMP`. Date truncation: `TRUNC(d, 'MM')`.

Metadata (schema SYS):
- Schemas: `EXA_ALL_SCHEMAS`. Tables: `EXA_ALL_TABLES` (TABLE_SCHEMA, TABLE_NAME, TABLE_ROW_COUNT).
- Columns: `EXA_ALL_COLUMNS`. Views: `EXA_ALL_VIEWS`. Constraints: `EXA_ALL_CONSTRAINT_COLUMNS`.
- Always schema-qualify (`TPCH.ORDERS`), especially in dashboards/artifacts that run without a default schema.

Performance:
- Exasol has NO `EXPLAIN`. Profile instead: `ALTER SESSION SET PROFILE='ON'` → run → `FLUSH STATISTICS` → read `EXA_STATISTICS.EXA_USER_PROFILE_LAST_DAY` (DURATION, CPU, OBJECT_ROWS).
- Table design: `DISTRIBUTE BY` the common join key, `PARTITION BY` a range/date column. Skew on DISTRIBUTE keys is the usual culprit for slow joins.

Analytics: heavy lifting belongs in the DB — aggregate with GROUP BY and let Exasol crunch millions of rows; return only the small result to charts.
