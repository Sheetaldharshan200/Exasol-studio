//! Live check for the analytics hub: attach a source as a virtual schema and
//! READ from it — the same statements the add-data-source flow runs, against
//! a real Exasol, through the in-process exarrow driver.
//!
//! This tier exists because the unit tests prove the DDL text and the plan,
//! not that the database accepts the adapter, resolves the connection and
//! returns rows. "Created" without a successful read is the failure this
//! feature promises never to ship, so the proof has to run for real.
//!
//! Opt-in, hermetic otherwise:
//!
//! ```text
//! EXASOL_LIVE_PASSWORD=… cargo test --test virtual_schema_live -- --ignored --nocapture
//! ```
//!
//! Defaults point at Studio's own local Exasol Personal (127.0.0.1:8565, sys).
//! The source is the database itself, attached through the Exasol Lua adapter
//! (exasol/exasol-virtual-schema-lua): it needs no JAR, no driver and no
//! language container, so the proof depends on nothing but a running database
//! and the network. `EXASOL_LIVE_SELF_ADDRESS` is how the database reaches
//! itself FROM INSIDE (Podman publishes 8565 on the host for the container's
//! 8563); `PG_LIVE_*` additionally attaches a PostgreSQL when its adapter has
//! been staged through the flow.

use exarrow_rs::adbc::Database;
use exarrow_rs::connection::ConnectionBuilder;
use std::path::PathBuf;

/// Pinned exactly like `adapters/exasol-lua.ts`; `catalog_pin_matches` fails
/// when the two drift apart.
const EVSL_TAG: &str = "1.0.0";
const EVSL_ASSET: &str = "exasol-virtual-schema-dist-1.0.0.lua";
const EVSL_SHA256: &str = "6c9f5560f51f5bc7d280052c0ab73f27f6e087e245250bb728e56148a606ea37";

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).ok().filter(|v| !v.is_empty()).unwrap_or_else(|| default.into())
}

fn password() -> Option<String> {
    std::env::var("EXASOL_LIVE_PASSWORD").ok().filter(|p| !p.is_empty())
}

struct Live {
    conn: exarrow_rs::adbc::Connection,
}

impl Live {
    async fn connect() -> Option<Self> {
        let Some(pw) = password() else {
            eprintln!("skip: EXASOL_LIVE_PASSWORD not set");
            return None;
        };
        // Studio's process default is `ring`; exarrow would otherwise pick
        // aws-lc-rs and the two providers fight. Same call the app makes.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let params = ConnectionBuilder::new()
            .host(&env_or("EXASOL_LIVE_HOST", "127.0.0.1"))
            .port(env_or("EXASOL_LIVE_PORT", "8565").parse().expect("EXASOL_LIVE_PORT"))
            .username(&env_or("EXASOL_LIVE_USER", "sys"))
            .password(&pw)
            .use_tls(true)
            .validate_server_certificate(false)
            .client_name("Exasol Studio live test")
            .build()
            .expect("connection params");
        let conn = Database::new(params).connect().await.expect("connect to the live database");
        Some(Self { conn })
    }

    async fn exec(&mut self, sql: &str) -> Result<Vec<Vec<String>>, String> {
        let rs = self.conn.execute(sql.to_string()).await.map_err(|e| e.to_string())?;
        if rs.row_count().is_some() {
            return Ok(Vec::new());
        }
        let batches = rs.fetch_all().await.map_err(|e| e.to_string())?;
        let mut rows = Vec::new();
        for b in &batches {
            for r in 0..b.num_rows() {
                rows.push(
                    (0..b.num_columns())
                        .map(|c| arrow::util::display::array_value_to_string(b.column(c), r).unwrap_or_default())
                        .collect(),
                );
            }
        }
        Ok(rows)
    }

    async fn must(&mut self, sql: &str) -> Vec<Vec<String>> {
        match self.exec(sql).await {
            Ok(rows) => rows,
            Err(e) => panic!("statement failed: {}\n{e}", sql.lines().next().unwrap_or("")),
        }
    }
}

async fn evsl_source() -> String {
    // Fetched once per run from the pinned release and checked against the
    // digest GitHub publishes — the installer verifies the same way. (Async:
    // the blocking client spins up its own runtime, which tokio forbids here.)
    let url = format!("https://github.com/exasol/exasol-virtual-schema-lua/releases/download/{EVSL_TAG}/{EVSL_ASSET}");
    let resp = reqwest::get(&url).await.and_then(|r| r.error_for_status()).expect("download the Lua adapter");
    let bytes = resp.bytes().await.expect("body");
    let digest = {
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(&bytes))
    };
    assert_eq!(digest, EVSL_SHA256, "the released adapter changed under its tag");
    String::from_utf8(bytes.to_vec()).expect("lua source is utf-8")
}

/// The Lua adapter pin in this test and in the TS catalog must agree, or the
/// proof runs against a different adapter than the one Studio installs.
#[test]
fn catalog_pin_matches() {
    let catalog = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../src/features/connection/virtual-schemas/adapters/exasol-lua.ts");
    let text = std::fs::read_to_string(&catalog).expect("exasol-lua.ts exists");
    assert!(
        text.contains(&format!("tag: \"{EVSL_TAG}\"")),
        "adapters/exasol-lua.ts pins a different release than this test ({EVSL_TAG})"
    );
}

#[tokio::test]
#[ignore = "needs a live Exasol (EXASOL_LIVE_PASSWORD)"]
async fn exasol_attaches_a_schema_of_itself_and_reads_rows() {
    let Some(mut db) = Live::connect().await else { return };
    let lua = evsl_source().await;
    let self_address = env_or("EXASOL_LIVE_SELF_ADDRESS", "localhost:8563");
    let pw = password().unwrap();

    // The source: a real table with real rows.
    db.must("CREATE SCHEMA IF NOT EXISTS VS_LIVE_SRC").await;
    db.must("CREATE OR REPLACE TABLE VS_LIVE_SRC.CUSTOMERS (ID DECIMAL(9,0), NAME VARCHAR(50), CITY VARCHAR(50), REVENUE DECIMAL(12,2))").await;
    db.must("INSERT INTO VS_LIVE_SRC.CUSTOMERS VALUES (1,'Acme','Berlin',150000.00),(2,'Globex','London',98000.50),(3,'Initech','Munich',210500.75)").await;

    // Exactly what `buildPlan` emits for the exasol-lua adapter (ddl.test.ts
    // pins the text; this pins that the database accepts it).
    db.must("CREATE SCHEMA IF NOT EXISTS \"ADAPTER\"").await;
    db.must(&format!("CREATE OR REPLACE LUA ADAPTER SCRIPT \"ADAPTER\".\"EXASOL_LUA_ADAPTER\" AS\n{}", lua.trim_end())).await;
    db.must("DROP VIRTUAL SCHEMA IF EXISTS \"VS_LIVE_SELF\" CASCADE").await;
    db.must(&format!("CREATE OR REPLACE CONNECTION \"VS_LIVE_CONN\" TO '{self_address}' USER 'sys' IDENTIFIED BY '{pw}'")).await;
    db.must("CREATE VIRTUAL SCHEMA \"VS_LIVE_SELF\" USING \"ADAPTER\".\"EXASOL_LUA_ADAPTER\" WITH CONNECTION_NAME = 'VS_LIVE_CONN' SCHEMA_NAME = 'VS_LIVE_SRC'").await;

    // PROVE: metadata, then rows — created means readable.
    let tables = db.must("SELECT TABLE_NAME FROM EXA_ALL_TABLES WHERE TABLE_SCHEMA = 'VS_LIVE_SELF' ORDER BY 1").await;
    assert_eq!(tables, vec![vec!["CUSTOMERS".to_string()]], "the attached schema must list the source table");
    let rows = db.must("SELECT ID, NAME, CITY, REVENUE FROM \"VS_LIVE_SELF\".\"CUSTOMERS\" ORDER BY ID").await;
    assert_eq!(rows.len(), 3, "every source row must come back through the virtual schema");
    assert_eq!(rows[2][1], "Initech");
    assert_eq!(rows[2][3], "210500.75", "a scaled DECIMAL keeps its scale across the federation");

    // A join across the boundary is the whole point of the hub.
    let joined = db.must("SELECT COUNT(*) FROM VS_LIVE_SRC.CUSTOMERS l JOIN \"VS_LIVE_SELF\".\"CUSTOMERS\" v ON l.ID = v.ID").await;
    assert_eq!(joined[0][0], "3");

    // Tidy up — the same drop statements the flow offers after a failure.
    db.must("DROP VIRTUAL SCHEMA IF EXISTS \"VS_LIVE_SELF\" CASCADE").await;
    db.must("DROP CONNECTION IF EXISTS \"VS_LIVE_CONN\"").await;
    db.must("DROP SCHEMA IF EXISTS VS_LIVE_SRC CASCADE").await;
}

#[tokio::test]
#[ignore = "needs a live Exasol and a reachable PostgreSQL (PG_LIVE_*)"]
async fn postgresql_attaches_and_reads_rows() {
    let Some(mut db) = Live::connect().await else { return };
    let Ok(pg_host) = std::env::var("PG_LIVE_HOST") else {
        eprintln!("skip: PG_LIVE_HOST not set");
        return;
    };
    let pg_port = env_or("PG_LIVE_PORT", "5432");
    let pg_db = env_or("PG_LIVE_DATABASE", "postgres");
    let pg_user = env_or("PG_LIVE_USER", "postgres");
    let pg_pw = env_or("PG_LIVE_PASSWORD", "");
    let pg_schema = env_or("PG_LIVE_SCHEMA", "public");
    let pg_table = env_or("PG_LIVE_TABLE", "customers");

    // The JDBC adapter needs its JAR + driver staged (the flow's prerequisites
    // step does that); without them this is a skip, not a failure.
    let adapters = db.must("SELECT SCRIPT_NAME FROM EXA_ALL_SCRIPTS WHERE SCRIPT_SCHEMA = 'ADAPTER' AND SCRIPT_NAME = 'POSTGRESQL_JDBC_ADAPTER'").await;
    if adapters.is_empty() {
        eprintln!("skip: ADAPTER.POSTGRESQL_JDBC_ADAPTER is not installed — run the add-data-source flow once");
        return;
    }

    db.must("DROP VIRTUAL SCHEMA IF EXISTS \"VS_LIVE_PG\" CASCADE").await;
    db.must(&format!("CREATE OR REPLACE CONNECTION \"VS_LIVE_PG_CONN\" TO 'jdbc:postgresql://{pg_host}:{pg_port}/{pg_db}' USER '{pg_user}' IDENTIFIED BY '{pg_pw}'")).await;
    db.must(&format!("CREATE VIRTUAL SCHEMA \"VS_LIVE_PG\" USING \"ADAPTER\".\"POSTGRESQL_JDBC_ADAPTER\" WITH CONNECTION_NAME = 'VS_LIVE_PG_CONN' SCHEMA_NAME = '{pg_schema}'")).await;
    let rows = db.must(&format!("SELECT * FROM \"VS_LIVE_PG\".\"{}\" LIMIT 5", pg_table.to_uppercase())).await;
    assert!(!rows.is_empty(), "the PostgreSQL table must return rows through Exasol");
    db.must("DROP VIRTUAL SCHEMA IF EXISTS \"VS_LIVE_PG\" CASCADE").await;
    db.must("DROP CONNECTION IF EXISTS \"VS_LIVE_PG_CONN\"").await;
}
