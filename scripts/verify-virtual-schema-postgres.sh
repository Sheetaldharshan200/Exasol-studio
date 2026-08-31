#!/usr/bin/env bash
# Verify Exasol → PostgreSQL JDBC virtual schema, end to end, in Docker.
#
# REQUIRES an x86_64 Linux host (or a CI runner). Exasol's single-node Docker DB
# (exasol/docker-db) ships amd64-only and needs a privileged container — it does
# NOT run on Apple Silicon (arm64) Macs, even under emulation. Run this there.
#
# What it does:
#   1. starts PostgreSQL with a sample `customers` table,
#   2. starts a single-node Exasol,
#   3. uploads the Postgres JDBC driver + the JDBC virtual-schema adapter to
#      BucketFS,
#   4. creates the ADAPTER SCRIPT, CONNECTION and VIRTUAL SCHEMA,
#   5. queries the Postgres table THROUGH Exasol to prove it works.
set -euo pipefail

PG=exa-pg
EXA=exa-db
NET=exa-vs-net
PG_DB=demo
PG_USER=postgres
PG_PW=exasol
EXA_PW=exasol            # default SYS password for docker-db is "exasol"
JDBC_VER=42.7.4          # Postgres JDBC driver
VS_JAR_URL="https://github.com/exasol/virtual-schemas/releases/download/9.0.5/virtual-schema-dist-9.0.5-postgresql-2.1.7.jar"
JDBC_URL="https://jdbc.postgresql.org/download/postgresql-${JDBC_VER}.jar"
WORK="$(mktemp -d)"

echo "==> network"
docker network create "$NET" >/dev/null 2>&1 || true

echo "==> postgres"
docker rm -f "$PG" >/dev/null 2>&1 || true
docker run -d --name "$PG" --network "$NET" \
  -e POSTGRES_PASSWORD="$PG_PW" -e POSTGRES_DB="$PG_DB" postgres:16 >/dev/null
until docker exec "$PG" pg_isready -U "$PG_USER" >/dev/null 2>&1; do sleep 1; done
docker exec -i "$PG" psql -U "$PG_USER" -d "$PG_DB" <<'SQL'
CREATE TABLE IF NOT EXISTS customers (id INT PRIMARY KEY, name TEXT, city TEXT, revenue NUMERIC(12,2));
INSERT INTO customers VALUES
 (1,'Acme Corp','Berlin',150000.00),(2,'Globex','London',98000.50),
 (3,'Initech','Munich',210500.75),(4,'Umbrella','Paris',54000.00),
 (5,'Soylent','Amsterdam',132250.25) ON CONFLICT (id) DO NOTHING;
SQL

echo "==> exasol single-node (this takes a few minutes to boot)"
docker rm -f "$EXA" >/dev/null 2>&1 || true
docker run -d --name "$EXA" --network "$NET" --privileged -p 8563:8563 \
  exasol/docker-db:latest >/dev/null
echo "   waiting for Exasol to accept SQL on :8563 ..."
# exaplus ships inside the container; poll until the DB answers.
until docker exec "$EXA" bash -lc '/usr/opt/EXASuite-*/EXASolution-*/bin/Console/exaplus -c 127.0.0.1:8563 -u sys -p '"$EXA_PW"' -sql "SELECT 1;" >/dev/null 2>&1'; do
  sleep 5
done

echo "==> fetch drivers/adapter"
curl -fsSL "$JDBC_URL"  -o "$WORK/postgresql.jar"
curl -fsSL "$VS_JAR_URL" -o "$WORK/vs-postgres.jar"

echo "==> upload to BucketFS (default bucket 'default', pw 'write')"
BFS="http://w:write@127.0.0.1:2580/default"
docker cp "$WORK/postgresql.jar"  "$EXA":/tmp/postgresql.jar
docker cp "$WORK/vs-postgres.jar" "$EXA":/tmp/vs-postgres.jar
docker exec "$EXA" bash -lc "curl -fsS -X PUT -T /tmp/postgresql.jar  $BFS/drivers/jdbc/postgresql.jar"
docker exec "$EXA" bash -lc "curl -fsS -X PUT -T /tmp/vs-postgres.jar $BFS/vs-postgres.jar"

echo "==> create adapter script, connection, virtual schema, then query"
docker exec -i "$EXA" bash -lc '/usr/opt/EXASuite-*/EXASolution-*/bin/Console/exaplus -c 127.0.0.1:8563 -u sys -p '"$EXA_PW"' -' <<SQL
CREATE SCHEMA IF NOT EXISTS ADAPTER;
CREATE OR REPLACE JAVA ADAPTER SCRIPT ADAPTER.JDBC_ADAPTER AS
  %scriptclass com.exasol.adapter.RequestDispatcher;
  %jar /buckets/bfsdefault/default/vs-postgres.jar;
/
CREATE OR REPLACE CONNECTION PG_CONN
  TO 'jdbc:postgresql://${PG}:5432/${PG_DB}'
  USER '${PG_USER}' IDENTIFIED BY '${PG_PW}';
CREATE VIRTUAL SCHEMA PG_VS USING ADAPTER.JDBC_ADAPTER WITH
  CONNECTION_NAME = 'PG_CONN'
  SCHEMA_NAME     = 'public'
  CATALOG_NAME    = '${PG_DB}';
SELECT '--- rows via Exasol virtual schema ---' AS note;
SELECT ID, NAME, CITY, REVENUE FROM PG_VS.CUSTOMERS ORDER BY ID;
SELECT COUNT(*) AS rows_through_exasol FROM PG_VS.CUSTOMERS;
SQL

echo "==> OK. Teardown:  docker rm -f $PG $EXA && docker network rm $NET"
