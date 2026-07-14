//! Multi-driver query execution.
//!
//! The app's native path is `sqlx-exasol` (WebSocket) — it powers browsing,
//! metadata and normal queries. This module adds *execution through other
//! drivers* (PyExasol, SQLAlchemy, JDBC, ODBC, …) for people who want to run a
//! query — or a bulk import/export — over a specific driver.
//!
//! Runtimes are NOT bundled. Each is installed on demand into a managed folder
//! (from our releases / the Marketplace). Picking a driver whose runtime isn't
//! present returns a clear "install it first" error.

use serde::Serialize;
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::market::{augmented_path, resolve_bin};
use crate::profiles::ConnectionProfile;
use crate::query::{ColumnMeta, ExecuteResponse, StatementResult};

/// Which runtime a driver id needs. "native" drivers run in-process (sqlx).
pub fn driver_runtime(driver_id: &str) -> &'static str {
    match driver_id {
        "sqlx-exasol" | "websocket-api" | "exarrow-rs" | "" => "native",
        "pyexasol" | "sqlalchemy" => "python",
        "jdbc" => "jvm",
        "odbc" => "odbc",
        "ts-js" => "node",
        "go" => "go",
        "r" => "r",
        "ado-net" => "dotnet",
        _ => "native",
    }
}

/// True when execution must go through an external-runtime bridge.
pub fn is_bridge_driver(driver_id: &str) -> bool {
    driver_runtime(driver_id) != "native"
}

fn runtimes_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Storage(e.to_string()))?
        .join("driver-runtimes");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn python_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(runtimes_dir(app)?.join("python"))
}

fn python_bin(app: &AppHandle) -> AppResult<PathBuf> {
    let venv = python_dir(app)?.join("venv");
    #[cfg(windows)]
    let p = venv.join("Scripts").join("python.exe");
    #[cfg(not(windows))]
    let p = venv.join("bin").join("python");
    Ok(p)
}

// ── Status ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverStatus {
    pub driver_id: String,
    pub runtime: String,
    /// native drivers are always ready; bridge drivers need their runtime.
    pub ready: bool,
    /// Whether this runtime bridge is implemented yet.
    pub supported: bool,
    /// One-line hint for the UI when not ready.
    pub hint: String,
}

/// Report whether a driver can execute right now.
#[tauri::command]
pub fn driver_status(app: AppHandle, driver_id: String) -> AppResult<DriverStatus> {
    let runtime = driver_runtime(&driver_id);
    let (ready, supported, hint) = match runtime {
        "native" => (true, true, String::new()),
        "python" => {
            let ok = python_bin(&app).map(|p| p.exists()).unwrap_or(false);
            (
                ok,
                true,
                if ok { String::new() } else { "Install the Python driver runtime to run queries over this driver.".into() },
            )
        }
        other => (
            false,
            false,
            format!("The {other} driver runtime isn’t available yet — it’s coming in a later update."),
        ),
    };
    Ok(DriverStatus { driver_id, runtime: runtime.to_string(), ready, supported, hint })
}

// ── Python runtime setup (pyexasol / sqlalchemy) ─────────────────────────────

/// Install the Python driver runtime (a managed venv + pyexasol + sqlalchemy).
/// Streams progress over `market:log` under the id `driver-python`.
#[tauri::command]
pub async fn driver_setup(app: AppHandle, driver_id: String) -> AppResult<Value> {
    let runtime = driver_runtime(&driver_id);
    let id = format!("driver-{runtime}");
    if runtime != "python" {
        let e = AppError::Storage(format!("The {runtime} driver runtime isn’t installable yet."));
        crate::market::emit_log(&app, &id, format!("✗ {e}"), "err");
        let _ = tauri::Emitter::emit(&app, "market:done", json!({ "id": id, "ok": false }));
        return Err(e);
    }
    let uv = resolve_bin("uv")
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| AppError::Storage("`uv` is required to install the Python driver runtime. Install it from the Marketplace first.".into()))?;
    let venv = python_dir(&app)?.join("venv");
    let venv_s = venv.to_string_lossy().to_string();

    crate::market::emit_log(&app, &id, "Creating a managed Python 3.11 environment…", "info");
    if crate::market::run_streamed(&app, &id, &uv, &["venv", "--clear", "--python", "3.11", &venv_s])? != 0 {
        let e = AppError::Storage("Could not create the Python environment.".into());
        let _ = tauri::Emitter::emit(&app, "market:done", json!({ "id": id, "ok": false }));
        return Err(e);
    }
    crate::market::emit_log(&app, &id, "Installing PyExasol + SQLAlchemy dialect…", "info");
    if crate::market::run_streamed(&app, &id, &uv, &["pip", "install", "--python", &venv_s, "pyexasol", "sqlalchemy-exasol", "pandas"])? != 0 {
        let e = AppError::Storage("Driver install failed. See the log.".into());
        let _ = tauri::Emitter::emit(&app, "market:done", json!({ "id": id, "ok": false }));
        return Err(e);
    }
    crate::market::emit_log(&app, &id, "✓ Python driver runtime ready.", "success");
    let _ = tauri::Emitter::emit(&app, "market:done", json!({ "id": id, "ok": true }));
    Ok(json!({ "ok": true }))
}

// ── Execution routing ─────────────────────────────────────────────────────────

/// Execute `statements` through the profile's (non-native) driver. Returns the
/// same shape as the native path so the frontend renders it identically.
pub fn execute_via_driver(
    app: &AppHandle,
    profile: &ConnectionProfile,
    statements: &[String],
    max_rows: usize,
) -> AppResult<ExecuteResponse> {
    match driver_runtime(&profile.driver_id) {
        "python" => execute_python(app, profile, statements, max_rows),
        other => Err(AppError::Storage(format!(
            "Execution via the {other} driver isn’t available yet."
        ))),
    }
}

fn execute_python(
    app: &AppHandle,
    profile: &ConnectionProfile,
    statements: &[String],
    max_rows: usize,
) -> AppResult<ExecuteResponse> {
    let py = python_bin(app)?;
    if !py.exists() {
        return Err(AppError::Storage(
            "The Python driver runtime isn’t installed. Install it, then try again.".into(),
        ));
    }
    // Write the bridge script alongside the venv (idempotent).
    let script = python_dir(app)?.join("bridge.py");
    std::fs::write(&script, PYTHON_BRIDGE)?;

    let tls = profile.ssl_mode != "disabled";
    let req = json!({
        "driver": profile.driver_id,
        "host": profile.host,
        "port": profile.port,
        "user": profile.username,
        "password": profile.password,
        "schema": profile.schema.clone().unwrap_or_default(),
        "tls": tls,
        "maxRows": max_rows,
        "statements": statements,
    });

    let mut cmd = Command::new(&py);
    cmd.arg(&script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if std::env::consts::OS != "windows" {
        cmd.env("PATH", augmented_path());
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Storage(format!("Could not run the Python bridge: {e}")))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(req.to_string().as_bytes())
            .map_err(|e| AppError::Storage(e.to_string()))?;
    }
    let out = child.wait_with_output().map_err(|e| AppError::Storage(e.to_string()))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let parsed: Value = serde_json::from_str(stdout.trim()).map_err(|_| {
        let err = String::from_utf8_lossy(&out.stderr);
        AppError::Storage(format!(
            "The Python driver returned no result. {}",
            err.lines().last().unwrap_or("").trim()
        ))
    })?;

    if let Some(err) = parsed.get("fatal").and_then(|v| v.as_str()) {
        return Err(AppError::Storage(err.to_string()));
    }

    let mut results: Vec<StatementResult> = Vec::new();
    let mut success = true;
    if let Some(arr) = parsed.get("results").and_then(|v| v.as_array()) {
        for r in arr {
            let error = r.get("error").and_then(|v| v.as_str()).map(|s| s.to_string());
            if error.is_some() {
                success = false;
            }
            let columns = r
                .get("columns")
                .and_then(|v| v.as_array())
                .map(|cols| {
                    cols.iter()
                        .map(|c| ColumnMeta {
                            name: c.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            type_name: c.get("typeName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        })
                        .collect()
                })
                .unwrap_or_default();
            let rows = r
                .get("rows")
                .and_then(|v| v.as_array())
                .map(|rows| rows.iter().filter_map(|row| row.as_array().cloned()).collect())
                .unwrap_or_default();
            results.push(StatementResult {
                statement: r.get("statement").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                kind: r.get("kind").and_then(|v| v.as_str()).unwrap_or("rowCount").to_string(),
                columns,
                rows,
                row_count: r.get("rowCount").and_then(|v| v.as_u64()).unwrap_or(0),
                truncated: r.get("truncated").and_then(|v| v.as_bool()).unwrap_or(false),
                elapsed_ms: r.get("elapsedMs").and_then(|v| v.as_u64()).unwrap_or(0),
                error,
            });
        }
    }
    let total_elapsed_ms = results.iter().map(|r| r.elapsed_ms).sum();
    Ok(ExecuteResponse { results, total_elapsed_ms, success })
}

/// The Python bridge: reads one JSON request on stdin, runs each statement via
/// PyExasol (or the SQLAlchemy/PyExasol engine), writes one JSON response.
const PYTHON_BRIDGE: &str = r#"
import sys, json, time

def main():
    try:
        req = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"fatal": "bad request: %s" % e})); return
    try:
        import pyexasol
    except Exception:
        print(json.dumps({"fatal": "PyExasol is not installed in the driver runtime."})); return

    dsn = "%s:%s" % (req["host"], req["port"])
    try:
        C = pyexasol.connect(
            dsn=dsn, user=req["user"], password=req["password"],
            schema=req.get("schema") or "",
            encryption=bool(req.get("tls", True)),
            websocket_sslopt={"cert_reqs": 0} if req.get("tls", True) else None,
        )
    except Exception as e:
        print(json.dumps({"fatal": "connect failed: %s" % e})); return

    max_rows = int(req.get("maxRows", 1000))
    out = {"results": []}
    for stmt in req.get("statements", []):
        t0 = time.time()
        entry = {"statement": stmt, "kind": "rowCount", "columns": [], "rows": [],
                 "rowCount": 0, "truncated": False, "elapsedMs": 0, "error": None}
        try:
            st = C.execute(stmt)
            if getattr(st, "result_type", "") == "resultSet":
                cols = st.columns()
                names = list(cols.keys())
                entry["kind"] = "resultSet"
                entry["columns"] = [{"name": n, "typeName": str(cols[n].get("type", ""))} for n in names]
                rows = st.fetchmany(max_rows)
                data = []
                for r in rows:
                    data.append([("" if v is None else v) if isinstance(v, (int, float, bool)) else (None if v is None else str(v)) for v in r])
                entry["rows"] = data
                entry["rowCount"] = len(data)
                entry["truncated"] = len(data) >= max_rows
            else:
                entry["rowCount"] = st.rowcount()
        except Exception as e:
            entry["error"] = str(e)
        entry["elapsedMs"] = int((time.time() - t0) * 1000)
        out["results"].append(entry)
        if entry["error"]:
            break
    try:
        C.close()
    except Exception:
        pass
    print(json.dumps(out))

main()
"#;
