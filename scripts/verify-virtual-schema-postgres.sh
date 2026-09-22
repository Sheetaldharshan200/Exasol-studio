#!/usr/bin/env bash
# Verify Exasol → PostgreSQL virtual schema end to end against a REAL local
# Exasol Personal, with PostgreSQL in a Podman container.
#
# This is the manual counterpart of the add-data-source flow: it does by hand
# exactly what Studio does for the user — fetch the adapter and driver, upload
# them to BucketFS, register the adapter script, create the connection and the
# virtual schema, then PROVE it by reading the PostgreSQL table through Exasol.
#
# Requires:
#   - a running Exasol Personal (Studio's own: 127.0.0.1:8565), reachable with
#     EXASOL_LIVE_PASSWORD (user sys unless EXASOL_LIVE_USER is set);
#   - its BucketFS write URL in EXASOL_BUCKETFS_URL, e.g.
#     http://w:<write-password>@127.0.0.1:2581/default  (`exasol info` prints it);
#   - podman on PATH (Exasol Personal 2.3 runs on Podman on every platform, so
#     it is already there wherever Studio's local database is);
#   - uv, to run pyexasol from Studio's locked python stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXA_HOST="${EXASOL_LIVE_HOST:-127.0.0.1}"
EXA_PORT="${EXASOL_LIVE_PORT:-8565}"
EXA_USER="${EXASOL_LIVE_USER:-sys}"
EXA_PW="${EXASOL_LIVE_PASSWORD:?set EXASOL_LIVE_PASSWORD to the sys password of the local Exasol Personal}"
BFS="${EXASOL_BUCKETFS_URL:?set EXASOL_BUCKETFS_URL, e.g. http://w:<write-pw>@127.0.0.1:2581/default (see: exasol info)}"

PG=exa-vs-pg
PG_DB=demo
PG_USER=postgres
PG_PW=exasol
# PostgreSQL is reached FROM THE DATABASE, which on a local Personal is this
# machine — so the container publishes 5432 on localhost.
PG_PORT="${PG_PORT:-5432}"

# Pinned to the same releases as apps/desktop/src/features/connection/virtual-schemas/adapters/postgresql.ts
VS_JAR_URL="https://github.com/exasol/postgresql-virtual-schema/releases/download/4.0.2/virtual-schema-dist-14.0.5-postgresql-4.0.2.jar"
JDBC_VER=42.7.4
JDBC_URL="https://repo1.maven.org/maven2/org/postgresql/postgresql/${JDBC_VER}/postgresql-${JDBC_VER}.jar"
WORK="$(mktemp -d)"

# pyexasol comes from the python stack Studio ships. The environment is built
# OUTSIDE the repo (uv would otherwise drop a .venv next to the lock file) and
# synced from the lock on first use — `--no-sync` here would leave it empty.
export UV_PROJECT_ENVIRONMENT="${TMPDIR:-/tmp}/exasol-studio-python-stack"

sql() {
  # One pyexasol session per call, the same way the refresh workflow talks to
  # a database.
  uv run --locked --project "$ROOT/apps/desktop/src-tauri/resources/python-stack" python - "$@" <<'PY'
import ssl, sys, pyexasol
host, port, user, pw, *stmts = sys.argv[1:]
c = pyexasol.connect(dsn=f"{host}:{port}", user=user, password=pw, encryption=True,
                     websocket_sslopt={"cert_reqs": ssl.CERT_NONE})
for stmt in stmts:
    st = c.execute(stmt)
    if st.result_type == "resultSet":
        for row in st.fetchall(): print("   ", row)
c.close()
PY
}

echo "==> postgres (podman)"
podman rm -f "$PG" >/dev/null 2>&1 || true
podman run -d --name "$PG" -p "127.0.0.1:${PG_PORT}:5432" \
  -e POSTGRES_PASSWORD="$PG_PW" -e POSTGRES_DB="$PG_DB" docker.io/library/postgres:16 >/dev/null
until podman exec "$PG" pg_isready -U "$PG_USER" >/dev/null 2>&1; do sleep 1; done
podman exec -i "$PG" psql -U "$PG_USER" -d "$PG_DB" <<'SQL'
CREATE TABLE IF NOT EXISTS customers (id INT PRIMARY KEY, name TEXT, city TEXT, revenue NUMERIC(12,2));
INSERT INTO customers VALUES
 (1,'Acme Corp','Berlin',150000.00),(2,'Globex','London',98000.50),
 (3,'Initech','Munich',210500.75),(4,'Umbrella','Paris',54000.00),
 (5,'Soylent','Amsterdam',132250.25) ON CONFLICT (id) DO NOTHING;
SQL

echo "==> fetch adapter + driver"
curl -fsSL "$VS_JAR_URL" -o "$WORK/vs-postgres.jar"
curl -fsSL "$JDBC_URL"   -o "$WORK/postgresql.jar"

echo "==> upload to BucketFS"
curl -fsS -X PUT -T "$WORK/vs-postgres.jar" "$BFS/vs-postgres.jar"
curl -fsS -X PUT -T "$WORK/postgresql.jar"  "$BFS/drivers/jdbc/postgresql.jar"

echo "==> adapter script, connection, virtual schema"
sql "$EXA_HOST" "$EXA_PORT" "$EXA_USER" "$EXA_PW" \
  "CREATE SCHEMA IF NOT EXISTS ADAPTER" \
  "CREATE OR REPLACE JAVA ADAPTER SCRIPT ADAPTER.POSTGRESQL_JDBC_ADAPTER AS
     %scriptclass com.exasol.adapter.RequestDispatcher;
     %jar /buckets/bfsdefault/default/vs-postgres.jar;
     %jar /buckets/bfsdefault/default/drivers/jdbc/postgresql.jar;
/" \
  "CREATE OR REPLACE CONNECTION PG_CONN TO 'jdbc:postgresql://127.0.0.1:${PG_PORT}/${PG_DB}' USER '${PG_USER}' IDENTIFIED BY '${PG_PW}'" \
  "DROP VIRTUAL SCHEMA IF EXISTS PG_VS CASCADE" \
  "CREATE VIRTUAL SCHEMA PG_VS USING ADAPTER.POSTGRESQL_JDBC_ADAPTER WITH CONNECTION_NAME = 'PG_CONN' SCHEMA_NAME = 'public'"

echo "==> PROVE: read the PostgreSQL table through Exasol"
sql "$EXA_HOST" "$EXA_PORT" "$EXA_USER" "$EXA_PW" \
  "SELECT ID, NAME, CITY, REVENUE FROM PG_VS.CUSTOMERS ORDER BY ID" \
  "SELECT COUNT(*) AS ROWS_THROUGH_EXASOL FROM PG_VS.CUSTOMERS"

echo "==> OK. Teardown:  podman rm -f $PG   (and DROP VIRTUAL SCHEMA PG_VS CASCADE; DROP CONNECTION PG_CONN; in Exasol)"
