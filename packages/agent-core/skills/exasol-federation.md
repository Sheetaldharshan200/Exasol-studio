---
name: exasol-federation
description: Combine data across MULTIPLE sources ("I have this file here and a Postgres/MySQL/S3/other database there — show me X") — clarify the sources, then import+join on Exasol Personal or set up virtual schemas on a full Exasol, and deliver the joined answer or dashboard
---

# Multi-source questions — clarify, land the data, answer

The user has data in more than one place and wants ONE answer across them.
Do not start loading anything until the picture is complete.

## Step 1 — clarify (one message, all questions)

Ask exactly what is unknown, nothing more:
1. **Where is each source?** (a local file? attached in chat? another database
   — which engine, host, credentials? an S3/Azure bucket? a URL? an API?)
2. **Snapshot or live?» Is a one-time copy fine, or must the answer always
   reflect the source's current state?
3. **What is the question/join?** Which fields relate the sources (keys), and
   what should the final result look like (table, chart, dashboard)?

## Step 2 — route by deployment (be honest about Personal)

**On Exasol Personal (the local 127.0.0.1:8565 DB — the default here):**
virtual schemas are NOT available (they need BucketFS, which Personal does not
expose). Say that in one line if the user asks for them, then use the path that
works everywhere:

- **Import + join (the workhorse):** land each source in its own schema, then
  answer with plain SQL joins.
  - Files/attachments → `data-loading-playbook` mechanisms (import_csv /
    import_attachments / exapump / json-tables).
  - Data at a URL or S3/cloud bucket → native `IMPORT INTO … FROM CSV AT '<url>'`
    via run_sql (see `exasol-import` for syntax/credentials).
  - Another SQL database → native `IMPORT … FROM JDBC/EXA AT <connection>` when
    the source is reachable from this machine; otherwise have the user export
    (CSV/Parquet) and load the file. Create a named CONNECTION object for
    credentials — never inline passwords in SQL.
- **Refresh cadence:** if they need it current, re-run the import on a schedule
  (`exasol-scheduling`) — an honest near-live snapshot.

**On a full Exasol (Community Edition via Docker, cluster, SaaS):** genuine
LIVE federation is available via virtual schemas — the source appears as a
read-only schema you can join directly:
- Other SQL DBs → the JDBC virtual schemas (Postgres, MySQL, Oracle, …); see
  `exasol-jdbc-virtual-schemas`.
- Files in S3 / Azure storage → document virtual schemas; see
  `exasol-document-virtual-schemas`.
- Athena / DynamoDB / MongoDB → their dedicated adapters (see
  `exasol-ecosystem` for the exact repo; skip archived ones).
If the user is on Personal but truly needs LIVE federation, do not stop at
"unavailable" — walk the escalation ladder in
`load_skill('exasol-community-upgrade')`: check Docker, install it (with
permission) if missing, deploy Exasol Community Edition (full v8 with BucketFS,
with permission), create the virtual schemas THERE, and deliver the joined
answer. There is always a working path — import+join now, or the Community
ladder for the real live view.

## Step 3 — deliver

1. Land/attach the sources (approval-gated tools; report REAL row counts).
2. Write the join, sanity-check it (row counts, a LIMIT preview), show the
   answer.
3. Offer the natural next step: a saved query, a dashboard
   (`dashboard-builder`), or a scheduled refresh (`exasol-scheduling`).

Never claim a live-federated view when what you built is an imported snapshot —
name it what it is and state how fresh it is.
