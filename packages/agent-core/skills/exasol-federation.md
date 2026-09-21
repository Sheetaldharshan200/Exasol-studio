---
name: exasol-federation
description: Combine data across MULTIPLE sources ("I have data here and a Postgres/MySQL/S3/Snowflake/other database there — show me X") — DEFAULT to a virtual schema so the other source appears as a live, queryable schema inside Exasol; import+join only when a snapshot is what they want. Clarify the sources, land them, deliver the joined answer or dashboard.
---

# Multi-source questions — make the other source part of this database

The user has data in more than one place and wants ONE answer across them.
Exasol's answer to that is a **virtual schema**: the remote database, bucket
or file store appears as a read-only schema *inside* Exasol, so the user
joins it like any other table and the answer always reflects the source's
current state. That is the default here. Reach for it whenever the user says
anything like "I have data in <another place>", "my orders are in Postgres
and my customers are here", "there's a bucket with the raw files" — you do
not need them to say "virtual schema".

Do not start loading anything until the picture is complete.

## Step 1 — clarify (one message, all questions)

Ask exactly what is unknown, nothing more:
1. **Where is each source?** Another database (which engine? host, port,
   database, credentials), an S3/GCS/Azure bucket, DynamoDB, Elasticsearch, a
   local file, an attachment, a URL?
2. **Live or snapshot?** Default to live. Only choose a copy when the user
   says a point-in-time snapshot is fine, or the source is a file that will
   never change.
3. **What is the question/join?** Which fields relate the sources (keys), and
   what should the final result look like (table, chart, dashboard)?

## Step 2 — route

**Another database or a cloud bucket → virtual schema (the default).**
Virtual schemas run on every Exasol Studio manages, including the local
Exasol Personal on `127.0.0.1:8565`: Exasol Personal 2.3 enabled them for
local deployments once the adapter runtime is installed. Studio's Virtual
Schemas flow installs that runtime and the source's adapter for the user —
never tell them virtual schemas are unavailable locally.

- Relational sources (PostgreSQL, MySQL, Oracle, SQL Server, Snowflake,
  BigQuery, Redshift, Databricks, Db2, SAP HANA, Hive, Impala, Athena,
  Sybase, another Exasol) → the JDBC virtual schemas:
  `load_skill('exasol-jdbc-virtual-schemas')`.
- Files in S3 / Google Cloud Storage / Azure Blob / Azure Data Lake, or
  BucketFS, DynamoDB, Elasticsearch → the document virtual schemas:
  `load_skill('exasol-document-virtual-schemas')`.
- The full adapter list, with each source's own file, is Studio's virtual
  schema catalog (`apps/desktop/src/features/connection/virtual-schemas/`).
  Prefer the dedicated adapter over a generic one when the source has one.

Credentials always go in a named `CONNECTION` object — never inline a password
in SQL. After `CREATE VIRTUAL SCHEMA`, prove it with a `SELECT … LIMIT 5`
against one remote table before writing the join.

**A local file, an attachment, or a one-time snapshot → import + join.**
Land it in its own schema (`data-loading-playbook` mechanisms: import_csv /
import_attachments / exapump / `IMPORT INTO … FROM CSV AT '<url>'` — see
`exasol-import`), then answer with plain SQL. If the user wants a copy of a
database rather than a live view, `IMPORT … FROM JDBC AT <connection>` does
that too. For a copy that must stay fresh, schedule the import
(`exasol-scheduling`) — an honest near-live snapshot.

**When the adapter runtime is not installed yet:** say so in one line and
offer the install (Studio's flow does it, approval-gated). Fall back to
import+join only if the user declines the install.

## Step 3 — deliver

1. Create the connection and virtual schema (approval-gated tools; report
   REAL object counts from the new schema), or land the sources.
2. Write the join, sanity-check it (row counts, a LIMIT preview), show the
   answer.
3. Offer the natural next step: a saved query, a dashboard
   (`dashboard-builder`), or — for a snapshot — a scheduled refresh
   (`exasol-scheduling`).

Never claim a live-federated view when what you built is an imported
snapshot — name it what it is and state how fresh it is. And never claim a
snapshot is all that is possible when a virtual schema would have given them
the live view.
