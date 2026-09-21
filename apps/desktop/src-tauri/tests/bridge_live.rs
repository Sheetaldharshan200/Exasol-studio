//! Live checks for the driver bridges — each one spawned exactly the way
//! `driver_exec.rs` spawns it, against a real database.
//!
//! This tier exists because the unit tests cannot see the thing that actually
//! breaks: the *process contract*. Every bug these bridges have shipped lived
//! there — a driver rejecting with a plain object (`[object Object]`), a failed
//! SELECT reported as a successful zero-row result, and the R package printing
//! progress to stdout, which turns the JSON reply into unparseable garbage.
//! Only running the real process and parsing its real stdout catches those.
//!
//! Opt-in, so the normal suite stays hermetic and offline. Each bridge also
//! skips itself when its runtime is absent, so this is safe to run anywhere:
//!
//! ```text
//! EXASOL_LIVE_PASSWORD=$(cat ~/.exasol-starter-kit/credentials/personal_sys_password) \
//!   cargo test --test bridge_live -- --ignored --nocapture
//! ```
//!
//! Defaults point at a local starter-kit database (127.0.0.1:8563, sys).

use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

fn repo_root() -> PathBuf {
    // <repo>/apps/desktop/src-tauri
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn password() -> Option<String> {
    std::env::var("EXASOL_LIVE_PASSWORD").ok().filter(|p| !p.is_empty())
}

fn request(statements: &[&str], expect_rows: &[bool], max_rows: usize, driver_path: &str) -> Value {
    json!({
        "host": std::env::var("EXASOL_LIVE_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
        "port": std::env::var("EXASOL_LIVE_PORT").ok().and_then(|p| p.parse::<u16>().ok()).unwrap_or(8563),
        "user": std::env::var("EXASOL_LIVE_USER").unwrap_or_else(|_| "sys".into()),
        "password": password().unwrap_or_default(),
        "schema": "",
        // Local databases use a self-signed certificate: encrypted, unverified.
        "tls": true,
        "verify": false,
        "maxRows": max_rows,
        "jarPath": "",
        "driverPath": driver_path,
        "statements": statements,
        "expectRows": expect_rows,
    })
}

/// Spawn a bridge and parse its reply — the exact round trip `execute_bridge`
/// performs, including the requirement that stdout is ONE JSON document.
fn run_bridge(program: &Path, script: Option<&Path>, req: &Value) -> Value {
    let mut cmd = Command::new(program);
    if let Some(s) = script {
        cmd.arg(s);
    }
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap_or_else(|e| panic!("could not spawn {}: {e}", program.display()));
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(req.to_string().as_bytes())
        .expect("write request");
    let out = child.wait_with_output().expect("bridge runs");
    let stdout = String::from_utf8_lossy(&out.stdout);
    serde_json::from_str(stdout.trim()).unwrap_or_else(|e| {
        panic!(
            "stdout must be exactly one JSON document ({e}).\n--- stdout ---\n{stdout}\n--- stderr ---\n{}",
            String::from_utf8_lossy(&out.stderr)
        )
    })
}

/// Every bridge answers the same shape, so every bridge gets the same checks.
///
/// `label` names a scratch schema for the write round-trip, so bridges tested
/// in parallel (cargo runs tests on threads) never share one.
fn assert_bridge_contract(program: &Path, script: Option<&Path>, driver_path: &str, label: &str) {
    // 1. A typed result set: numbers stay numbers, a scaled DECIMAL keeps every
    //    digit, and a real NULL stays NULL.
    let reply = run_bridge(
        program,
        script,
        &request(
            &["SELECT 1 AS N, 'hello' AS S, CAST(1234.56 AS DECIMAL(10,2)) AS D, CAST(NULL AS VARCHAR(5)) AS NOTHING"],
            &[true],
            10,
            driver_path,
        ),
    );
    assert!(reply.get("fatal").is_none(), "unexpected fatal: {reply}");
    let r = &reply["results"][0];
    assert!(r["error"].is_null(), "statement failed: {}", r["error"]);
    assert_eq!(r["kind"], "resultSet");
    assert_eq!(r["rows"].as_array().expect("rows").len(), 1);
    let row = &r["rows"][0];
    assert_eq!(row[0], json!(1), "INTEGER must stay a number");
    assert_eq!(row[1], json!("hello"));
    assert_eq!(
        row[2].to_string().trim_matches('"'),
        "1234.56",
        "a scaled DECIMAL must keep its scale"
    );
    assert!(row[3].is_null(), "a real NULL must stay NULL, got {}", row[3]);
    assert_eq!(r["columns"][0]["name"], "N");

    // 2. A failing statement is an ERROR that stops the batch — never a silent
    //    zero-row success, and never a stringified object.
    let reply = run_bridge(
        program,
        script,
        &request(
            &["SELECT * FROM A_TABLE_THAT_DOES_NOT_EXIST_XYZ", "SELECT 1"],
            &[true, true],
            10,
            driver_path,
        ),
    );
    let results = reply["results"].as_array().expect("results");
    assert_eq!(results.len(), 1, "nothing after a failing statement may run");
    let err = results[0]["error"].as_str().unwrap_or("");
    assert!(!err.is_empty(), "a failed statement must carry a message");
    assert!(!err.contains("[object"), "never a stringified object: {err}");

    // 3. Truncation is reported only when rows were REALLY dropped. The
    //    off-by-one here ("exactly max_rows" wrongly flagged as truncated) is a
    //    bug each bridge has to get right separately.
    let three = "SELECT 1 AS N UNION ALL SELECT 2 UNION ALL SELECT 3";
    let limited = run_bridge(program, script, &request(&[three], &[true], 2, driver_path));
    let r = &limited["results"][0];
    assert!(r["error"].is_null(), "truncation query failed: {}", r["error"]);
    assert_eq!(r["rows"].as_array().expect("rows").len(), 2);
    assert_eq!(r["truncated"], json!(true), "a row was dropped, so say so");

    let exact = run_bridge(program, script, &request(&[three], &[true], 3, driver_path));
    let r = &exact["results"][0];
    assert_eq!(r["rows"].as_array().expect("rows").len(), 3);
    assert_eq!(
        r["truncated"],
        json!(false),
        "exactly max_rows rows is a COMPLETE result, not a truncated one"
    );

    // 4. Writes actually land. This is the only check that proves the driver
    //    commits: a bridge that opens a transaction and never commits looks
    //    perfectly healthy until the rows turn out not to be there. It is also
    //    the `expectRows = false` path, where a silent zero-row "success" hides.
    let schema = format!("STUDIO_BRIDGE_PROBE_{label}");
    let create = format!("CREATE SCHEMA IF NOT EXISTS {schema}");
    let table = format!("CREATE OR REPLACE TABLE {schema}.T (A DECIMAL(9,0))");
    let insert = format!("INSERT INTO {schema}.T VALUES (1),(2),(3)");
    let count = format!("SELECT COUNT(*) AS C FROM {schema}.T");
    let drop = format!("DROP SCHEMA IF EXISTS {schema} CASCADE");

    let written = run_bridge(
        program,
        script,
        &request(
            &[&create, &table, &insert, &count],
            &[false, false, false, true],
            10,
            driver_path,
        ),
    );
    let results = written["results"].as_array().expect("results");
    assert_eq!(results.len(), 4, "every statement must run: {written}");
    for r in results {
        assert!(r["error"].is_null(), "write step failed: {}", r["error"]);
    }
    assert_eq!(
        results[2]["rowCount"], json!(3),
        "the INSERT must report the rows it wrote, not 0"
    );
    assert_eq!(
        results[3]["rows"][0][0],
        json!(3),
        "the rows must still be there on a NEW connection — otherwise nothing was committed"
    );

    // Best-effort cleanup: a failure here must not mask the result above.
    let _ = run_bridge(program, script, &request(&[&drop], &[false], 1, driver_path));
}

/// No credentials means "a live run was not asked for" — skip.
///
/// Anything else is NOT skipped silently: once credentials are given, a missing
/// artifact that THIS REPO builds is a setup error and fails loudly, because a
/// test that quietly reports success while testing nothing is worse than no
/// test. Only a runtime the user owns (R, node) is allowed to skip.
fn live_requested() -> bool {
    if password().is_some() {
        return true;
    }
    eprintln!("skipped: set EXASOL_LIVE_PASSWORD to run the live bridge checks");
    false
}

/// An artifact this repo builds. Missing it, during a run that asked for live
/// checks, is a failure with the command that fixes it.
fn built_artifact(path: PathBuf, how_to_build: &str) -> PathBuf {
    assert!(
        path.exists(),
        "{} is missing — run `{how_to_build}` before the live checks",
        path.display()
    );
    path
}

#[test]
#[ignore = "needs a live database (EXASOL_LIVE_PASSWORD) and the built Go bridge"]
fn go_bridge_speaks_the_contract() {
    if !live_requested() {
        return;
    }
    let bin = built_artifact(
        repo_root().join("apps/desktop/src-tauri/resources/bridges/exasol-bridge-go"),
        "./scripts/build-driver-bridges.sh",
    );
    assert_bridge_contract(&bin, None, "", "GO");
}

#[test]
#[ignore = "needs a live database (EXASOL_LIVE_PASSWORD) and the built TS bridge"]
fn ts_bridge_speaks_the_contract() {
    if !live_requested() {
        return;
    }
    let script = built_artifact(
        repo_root().join("packages/agent-core/dist/driver-bridge.cjs"),
        "pnpm -F @exasol-studio/agent-core build",
    );
    // node is the user's runtime in a dev checkout, so its absence skips.
    let Some(node) = which("node") else {
        eprintln!("skipped: no node on PATH");
        return;
    };
    assert_bridge_contract(&node, Some(&script), "", "TS");
}

#[test]
#[ignore = "needs a live database, R with the exasol package, and EXASOL_ODBC_DRIVER"]
fn r_bridge_speaks_the_contract() {
    if !live_requested() {
        return;
    }
    // R is never bundled, and `exasol` reaches the database through the Exasol
    // ODBC driver — so this check needs both, named explicitly.
    let Some(rscript) = std::env::var("EXASOL_RSCRIPT").ok().map(PathBuf::from).or_else(|| which("Rscript"))
    else {
        eprintln!("skipped: no Rscript (set EXASOL_RSCRIPT)");
        return;
    };
    let driver = std::env::var("EXASOL_ODBC_DRIVER").unwrap_or_default();
    if driver.is_empty() || !Path::new(&driver).exists() {
        eprintln!("skipped: set EXASOL_ODBC_DRIVER to the Exasol ODBC library");
        return;
    }
    let script = repo_root().join("packages/driver-bridges/r/bridge.R");
    assert_bridge_contract(&rscript, Some(&script), &driver, "R");
}

fn which(bin: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|d| d.join(bin)).find(|p| p.is_file())
}
