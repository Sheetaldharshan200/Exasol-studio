---
name: data-loading-playbook
description: THE decision matrix for getting data into or out of Exasol — which exact tool or mechanism to use for every case (attached CSV/TSV/Parquet, huge local files via exapump, JSON via json-tables, remote URLs via IMPORT, table-to-table SQL, exports) so the fastest correct path is always chosen
---

# Data loading playbook — pick the right mechanism, never improvise

Match the situation to the row below. Use EXACTLY the stated tool. Never invent
commands (there is no `EXA_PUMP` SQL, no `CALL import_csv(...)` procedure — 
`import_csv` is a native tool you INVOKE, not SQL you write).

| Situation | Correct mechanism |
|---|---|
| ONE data file attached in this chat (CSV/TSV/Parquet) | `import_csv` tool (auto-detects format, infers types from all rows, one approval) |
| SEVERAL data files attached in this chat | `import_attachments` tool — ONE call, one approval, every file drained as A2A tasks. Never loop import_csv per file |
| Huge file on the user's DISK (hundreds of MB+, not attached) | Do NOT pull it through chat. Tell the user: right-click the file in the Files explorer → "Load into database", or use the workbench Load Data dialog — it streams via **exapump** (native bulk IMPORT, orders of magnitude faster than row inserts) |
| JSON / JSONL documents to become relational tables | **exasol-json-tables** (Marketplace package): its ingest engine maps nested JSON to typed tables. If it isn't installed, say so and point to the Marketplace — do not hand-roll JSON parsing in SQL |
| Data at a URL (http/https/S3/cloud bucket) | Native `IMPORT INTO <table> FROM CSV AT '<url>' ...` via run_sql (approval gated). For syntax details load the `exasol-import` skill |
| Copy/transform between tables already in Exasol | Plain SQL: `CREATE TABLE ... AS SELECT` or `INSERT INTO ... SELECT` via run_sql — never export+reimport |
| Export tables to files | `export_tables` tool (parallel CSV to ~/Downloads/exasol-exports, one approval). For cloud/remote targets: `EXPORT ... INTO CSV AT` via run_sql |

Hard rules:
- Reads run free; EVERYTHING that creates or changes data (including CREATE SCHEMA) goes through the approval gate. Never try to sidestep it.
- After a load, report the REAL per-table row counts from tool results. Never fabricate sample rows.
- Types come from the import tools' inference — do not hand-write CREATE TABLE for attached files unless the user asks for custom types.
- If the right mechanism is unavailable (no connection, package missing), say exactly that in one line — never fall back to narrating fake commands.
