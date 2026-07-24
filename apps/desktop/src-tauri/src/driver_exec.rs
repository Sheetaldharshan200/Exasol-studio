//! Multi-driver query execution.
//!
//! The app's native path is `sqlx-exasol` (WebSocket) — it powers browsing,
//! metadata and normal queries. This module adds *execution through other
//! drivers* (PyExasol, SQLAlchemy, JDBC, …) for people who want to run a query —
//! or a bulk import/export — over a specific driver.
//!
//! Runtimes are NOT bundled. Each is installed on demand into a managed folder
//! (official Exasol tooling, fetched via `uv` / Maven / Adoptium). Picking a
//! driver whose runtime isn't present returns a clear "install it first" error.

use serde::Serialize;
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, AppResult};
use crate::market::{augmented_path, emit_log, resolve_bin, run_streamed};
use crate::profiles::ConnectionProfile;
use crate::query::{ColumnMeta, ExecuteResponse, StatementResult};

const JDBC_VERSION: &str = "25.2.3";

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

pub fn is_bridge_driver(driver_id: &str) -> bool {
    driver_runtime(driver_id) != "native"
}

/// The `python`, `jvm`, … runtimes all execute through the shared Python bridge
/// (JDBC via jaydebeapi/JPype), so they share the managed venv.
fn uses_python_bridge(runtime: &str) -> bool {
    runtime == "python" || runtime == "jvm" || runtime == "odbc"
}

fn has_marker(app: &AppHandle, name: &str) -> bool {
    python_dir(app).map(|d| d.join(name).exists()).unwrap_or(false)
}

fn python_ready(app: &AppHandle) -> bool {
    python_bin(app).map(|p| p.exists()).unwrap_or(false) && has_marker(app, ".python-ready")
}

fn odbc_ready(app: &AppHandle) -> bool {
    python_bin(app).map(|p| p.exists()).unwrap_or(false) && has_marker(app, ".odbc-ready")
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

fn jdbc_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(runtimes_dir(app)?.join("jdbc"))
}

fn jdbc_jar(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(jdbc_dir(app)?.join(format!("exasol-jdbc-{JDBC_VERSION}.jar")))
}

/// Locate the extracted JRE's home (the dir that contains `bin/java[.exe]`).
fn jre_home(app: &AppHandle) -> Option<PathBuf> {
    let base = jdbc_dir(app).ok()?.join("jre");
    let want = if cfg!(windows) { "java.exe" } else { "java" };
    let mut stack = vec![base];
    while let Some(dir) = stack.pop() {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() {
                    if p.join("bin").join(want).exists() {
                        return Some(p);
                    }
                    stack.push(p);
                }
            }
        }
    }
    None
}

fn python_jdbc_ready(app: &AppHandle) -> bool {
    python_bin(app).map(|p| p.exists()).unwrap_or(false)
        && has_marker(app, ".jvm-ready")
        && jdbc_jar(app).map(|p| p.exists()).unwrap_or(false)
        && jre_home(app).is_some()
}

// ── Status ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverStatus {
    pub driver_id: String,
    pub runtime: String,
    pub ready: bool,
    pub supported: bool,
    pub hint: String,
}

#[tauri::command]
pub fn driver_status(app: AppHandle, driver_id: String) -> AppResult<DriverStatus> {
    let runtime = driver_runtime(&driver_id);
    let (ready, supported, hint) = match runtime {
        "native" => (true, true, String::new()),
        "python" => {
            let ok = python_ready(&app);
            (ok, true, if ok { String::new() } else { "Install the Python driver runtime to run queries over this driver.".into() })
        }
        "jvm" => {
            let ok = python_jdbc_ready(&app);
            (ok, true, if ok { String::new() } else { "Install the JDBC runtime (bundled JRE + Exasol JDBC driver) to run queries over JDBC.".into() })
        }
        "odbc" => {
            let ok = odbc_ready(&app);
            (ok, true, if ok { String::new() } else { "Install the ODBC runtime, then install Exasol’s ODBC driver on your OS (from Exasol Downloads) — it’s detected automatically.".into() })
        }
        other => (false, false, format!("The {other} driver runtime isn’t available yet — it’s coming in a later update.")),
    };
    Ok(DriverStatus { driver_id, runtime: runtime.to_string(), ready, supported, hint })
}

// ── Runtime setup (install on demand) ────────────────────────────────────────

fn ensure_uv() -> AppResult<String> {
    resolve_bin("uv")
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| AppError::Storage("`uv` is required. Install it from the Marketplace first.".into()))
}

/// Ensure the managed Python venv exists (shared by pyexasol and the JDBC bridge).
fn ensure_python_venv(app: &AppHandle, id: &str, uv: &str, extra: &[&str]) -> AppResult<()> {
    let venv = python_dir(app)?.join("venv");
    let venv_s = venv.to_string_lossy().to_string();
    if !python_bin(app)?.exists() {
        emit_log(app, id, "Creating a managed Python 3.11 environment…", "info");
        if run_streamed(app, id, uv, &["venv", "--clear", "--python", "3.11", &venv_s])? != 0 {
            return Err(AppError::Storage("Could not create the Python environment.".into()));
        }
    }
    let mut args = vec!["pip", "install", "--python", venv_s.as_str()];
    args.extend_from_slice(extra);
    emit_log(app, id, format!("Installing: {}", extra.join(" ")), "info");
    if run_streamed(app, id, uv, &args)? != 0 {
        return Err(AppError::Storage("Package install failed. See the log.".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn driver_setup(app: AppHandle, driver_id: String) -> AppResult<Value> {
    let runtime = driver_runtime(&driver_id);
    let id = format!("driver-{runtime}");
    let result = match runtime {
        "python" => setup_python(&app, &id).await,
        "jvm" => setup_jvm(&app, &id).await,
        "odbc" => setup_odbc(&app, &id).await,
        other => Err(AppError::Storage(format!("The {other} driver runtime isn’t installable yet."))),
    };
    match result {
        Ok(_) => {
            emit_log(&app, &id, "✓ Driver runtime ready.", "success");
            let _ = app.emit("market:done", json!({ "id": id, "ok": true }));
            Ok(json!({ "ok": true }))
        }
        Err(e) => {
            emit_log(&app, &id, format!("✗ {e}"), "err");
            let _ = app.emit("market:done", json!({ "id": id, "ok": false, "error": e.to_string() }));
            Err(e)
        }
    }
}

async fn setup_python(app: &AppHandle, id: &str) -> AppResult<()> {
    let uv = ensure_uv()?;
    let app2 = app.clone();
    let id2 = id.to_string();
    tokio::task::spawn_blocking(move || {
        ensure_python_venv(&app2, &id2, &uv, &["pyexasol", "sqlalchemy-exasol", "pandas"])
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))??;
    let _ = std::fs::write(python_dir(app)?.join(".python-ready"), b"1");
    Ok(())
}

async fn setup_odbc(app: &AppHandle, id: &str) -> AppResult<()> {
    let uv = ensure_uv()?;
    let app2 = app.clone();
    let id2 = id.to_string();
    tokio::task::spawn_blocking(move || ensure_python_venv(&app2, &id2, &uv, &["pyodbc"]))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))??;
    // Mark the ODBC bridge installed. The Exasol ODBC driver itself is a system
    // component the user installs from Exasol Downloads; the bridge auto-detects it.
    let _ = std::fs::write(python_dir(app)?.join(".odbc-ready"), b"1");
    crate::market::emit_log(
        app,
        id,
        "Note: install Exasol’s ODBC driver on your OS (Exasol Downloads) — it will be detected automatically.",
        "info",
    );
    Ok(())
}

async fn setup_jvm(app: &AppHandle, id: &str) -> AppResult<()> {
    let uv = ensure_uv()?;
    // 1) Python venv with the JDBC bridge deps.
    {
        let app2 = app.clone();
        let id2 = id.to_string();
        let uv2 = uv.clone();
        tokio::task::spawn_blocking(move || {
            ensure_python_venv(&app2, &id2, &uv2, &["jaydebeapi", "JPype1"])
        })
        .await
        .map_err(|e| AppError::Storage(e.to_string()))??;
    }
    let dir = jdbc_dir(app)?;
    std::fs::create_dir_all(&dir)?;

    // 2) Exasol JDBC jar from Maven Central.
    let jar = jdbc_jar(app)?;
    if !jar.exists() {
        emit_log(app, id, format!("Downloading Exasol JDBC driver {JDBC_VERSION}…"), "info");
        let url = format!("https://repo1.maven.org/maven2/com/exasol/exasol-jdbc/{JDBC_VERSION}/exasol-jdbc-{JDBC_VERSION}.jar");
        download(&url, &jar).await?;
    }

    // 3) A JRE (Adoptium Temurin 21), extracted under jdbc/jre.
    if jre_home(app).is_none() {
        emit_log(app, id, "Downloading a Java runtime (Temurin JRE 21)…", "info");
        let (url, archive) = adoptium_url(&dir);
        download(&url, &archive).await?;
        emit_log(app, id, "Extracting the Java runtime…", "info");
        let jre_dir = dir.join("jre");
        std::fs::create_dir_all(&jre_dir)?;
        extract_archive(&archive, &jre_dir)?;
        let _ = std::fs::remove_file(&archive);
        if jre_home(app).is_none() {
            return Err(AppError::Storage("Java runtime extracted but no `bin/java` was found.".into()));
        }
    }
    let _ = std::fs::write(python_dir(app)?.join(".jvm-ready"), b"1");
    Ok(())
}

/// Adoptium API binary URL for this platform + the local archive path to save to.
fn adoptium_url(dir: &std::path::Path) -> (String, PathBuf) {
    let os = match std::env::consts::OS {
        "macos" => "mac",
        "windows" => "windows",
        _ => "linux",
    };
    let arch = if std::env::consts::ARCH == "aarch64" { "aarch64" } else { "x64" };
    let ext = if os == "windows" { "zip" } else { "tar.gz" };
    let url = format!("https://api.adoptium.net/v3/binary/latest/21/ga/{os}/{arch}/jre/hotspot/normal/eclipse");
    (url, dir.join(format!("jre-download.{ext}")))
}

/// Extract a .tar.gz or .zip using the system `tar` (bsdtar handles both).
fn extract_archive(archive: &std::path::Path, dest: &std::path::Path) -> AppResult<()> {
    let a = archive.to_string_lossy().to_string();
    let d = dest.to_string_lossy().to_string();
    let args: Vec<&str> = if a.ends_with(".zip") {
        vec!["-xf", &a, "-C", &d]
    } else {
        vec!["-xzf", &a, "-C", &d]
    };
    let status = Command::new("tar")
        .args(&args)
        .status()
        .map_err(|e| AppError::Storage(format!("could not run tar: {e}")))?;
    if !status.success() {
        return Err(AppError::Storage("Failed to extract the Java runtime.".into()));
    }
    Ok(())
}

async fn download(url: &str, dest: &std::path::Path) -> AppResult<()> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let resp = client
        .get(url)
        .header("User-Agent", "exasol-studio")
        .send()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Storage(format!("Download failed (HTTP {}) for {url}", resp.status())));
    }
    let bytes = resp.bytes().await.map_err(|e| AppError::Storage(e.to_string()))?;
    std::fs::write(dest, &bytes)?;
    Ok(())
}

// ── Execution routing ─────────────────────────────────────────────────────────

pub fn execute_via_driver(
    app: &AppHandle,
    profile: &ConnectionProfile,
    statements: &[String],
    max_rows: usize,
) -> AppResult<ExecuteResponse> {
    let runtime = driver_runtime(&profile.driver_id);
    if uses_python_bridge(runtime) {
        execute_python(app, profile, statements, max_rows)
    } else {
        Err(AppError::Storage(format!("Execution via the {runtime} driver isn’t available yet.")))
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
        return Err(AppError::Storage("This driver's runtime isn’t installed. Install it, then try again.".into()));
    }
    let is_jdbc = profile.driver_id == "jdbc";
    if is_jdbc && !python_jdbc_ready(app) {
        return Err(AppError::Storage("The JDBC runtime isn’t fully installed. Install it, then try again.".into()));
    }
    if profile.driver_id == "odbc" && !odbc_ready(app) {
        return Err(AppError::Storage("The ODBC runtime isn’t installed. Install it, then try again.".into()));
    }

    let script = python_dir(app)?.join("bridge.py");
    std::fs::write(&script, PYTHON_BRIDGE)?;

    let tls = profile.ssl_mode != "disabled";
    let verify = profile.ssl_mode == "verify_ca" || profile.ssl_mode == "verify_identity";
    let jar = jdbc_jar(app)?.to_string_lossy().to_string();
    let req = json!({
        "driver": profile.driver_id,
        "host": profile.host,
        "port": profile.port,
        "user": profile.username,
        "password": profile.password,
        "schema": profile.schema.clone().unwrap_or_default(),
        "tls": tls,
        "verify": verify,
        "maxRows": max_rows,
        "jarPath": jar,
        "statements": statements,
    });

    let mut cmd = Command::new(&py);
    cmd.arg(&script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if std::env::consts::OS != "windows" {
        cmd.env("PATH", augmented_path());
    }
    if is_jdbc {
        if let Some(home) = jre_home(app) {
            cmd.env("JAVA_HOME", &home);
        }
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Storage(format!("Could not run the driver bridge: {e}")))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(req.to_string().as_bytes()).map_err(|e| AppError::Storage(e.to_string()))?;
    }
    let out = child.wait_with_output().map_err(|e| AppError::Storage(e.to_string()))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let parsed: Value = serde_json::from_str(stdout.trim()).map_err(|_| {
        let err = String::from_utf8_lossy(&out.stderr);
        AppError::Storage(format!("The driver returned no result. {}", err.lines().last().unwrap_or("").trim()))
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
                exec_ms: r.get("elapsedMs").and_then(|v| v.as_u64()).unwrap_or(0),
                fetch_ms: 0,
                error,
            });
        }
    }
    let total_elapsed_ms = results.iter().map(|r| r.elapsed_ms).sum();
    Ok(ExecuteResponse { results, total_elapsed_ms, success })
}

/// The shared Python bridge: PyExasol for the `python` drivers, jaydebeapi for
/// JDBC. Reads one JSON request on stdin, writes one JSON response on stdout.
const PYTHON_BRIDGE: &str = r#"
import sys, json, time

def cell(v):
    if v is None: return None
    if isinstance(v, (int, float, bool)): return v
    return str(v)

def run_pyexasol(req):
    import pyexasol
    dsn = "%s:%s" % (req["host"], req["port"])
    C = pyexasol.connect(dsn=dsn, user=req["user"], password=req["password"],
        schema=req.get("schema") or "", encryption=bool(req.get("tls", True)),
        websocket_sslopt={"cert_reqs": 0} if (req.get("tls", True) and not req.get("verify")) else None)
    max_rows = int(req.get("maxRows", 1000))
    out = {"results": []}
    for stmt in req.get("statements", []):
        t0 = time.time()
        e = {"statement": stmt, "kind": "rowCount", "columns": [], "rows": [], "rowCount": 0, "truncated": False, "elapsedMs": 0, "error": None}
        try:
            st = C.execute(stmt)
            if getattr(st, "result_type", "") == "resultSet":
                cols = st.columns(); names = list(cols.keys())
                e["kind"] = "resultSet"
                e["columns"] = [{"name": n, "typeName": str(cols[n].get("type", ""))} for n in names]
                rows = st.fetchmany(max_rows)
                e["rows"] = [[cell(v) for v in r] for r in rows]
                e["rowCount"] = len(e["rows"]); e["truncated"] = len(e["rows"]) >= max_rows
            else:
                e["rowCount"] = st.rowcount()
        except Exception as ex:
            e["error"] = str(ex)
        e["elapsedMs"] = int((time.time()-t0)*1000); out["results"].append(e)
        if e["error"]: break
    try: C.close()
    except Exception: pass
    return out

def run_jdbc(req):
    import jaydebeapi
    url = "jdbc:exa:%s:%s" % (req["host"], req["port"])
    if not req.get("tls", True): url += ";encryption=0"
    elif not req.get("verify"): url += ";validateservercertificate=0"
    if req.get("schema"): url += ";schema=%s" % req["schema"]
    C = jaydebeapi.connect("com.exasol.jdbc.EXADriver", url, [req["user"], req["password"]], req["jarPath"])
    max_rows = int(req.get("maxRows", 1000))
    out = {"results": []}
    for stmt in req.get("statements", []):
        t0 = time.time()
        e = {"statement": stmt, "kind": "rowCount", "columns": [], "rows": [], "rowCount": 0, "truncated": False, "elapsedMs": 0, "error": None}
        cur = C.cursor()
        try:
            cur.execute(stmt)
            if cur.description:
                e["kind"] = "resultSet"
                e["columns"] = [{"name": d[0], "typeName": ""} for d in cur.description]
                rows = cur.fetchmany(max_rows)
                e["rows"] = [[cell(v) for v in r] for r in rows]
                e["rowCount"] = len(e["rows"]); e["truncated"] = len(e["rows"]) >= max_rows
            else:
                try: e["rowCount"] = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
                except Exception: e["rowCount"] = 0
        except Exception as ex:
            e["error"] = str(ex)
        finally:
            try: cur.close()
            except Exception: pass
        e["elapsedMs"] = int((time.time()-t0)*1000); out["results"].append(e)
        if e["error"]: break
    try: C.close()
    except Exception: pass
    return out

def run_odbc(req):
    import pyodbc
    exa = [d for d in pyodbc.drivers() if "exa" in d.lower()]
    if not exa:
        raise Exception("No Exasol ODBC driver is registered on this system. Install it from Exasol Downloads.")
    cs = "DRIVER={%s};EXAHOST=%s:%s;EXAUID=%s;EXAPWD=%s" % (exa[0], req["host"], req["port"], req["user"], req["password"])
    if req.get("tls", True) and not req.get("verify"):
        cs += ";SSLCERTIFICATE=SSL_VERIFY_NONE"
    if req.get("schema"):
        cs += ";SCHEMA=%s" % req["schema"]
    C = pyodbc.connect(cs, autocommit=True)
    max_rows = int(req.get("maxRows", 1000))
    out = {"results": []}
    for stmt in req.get("statements", []):
        t0 = time.time()
        e = {"statement": stmt, "kind": "rowCount", "columns": [], "rows": [], "rowCount": 0, "truncated": False, "elapsedMs": 0, "error": None}
        cur = C.cursor()
        try:
            cur.execute(stmt)
            if cur.description:
                e["kind"] = "resultSet"
                e["columns"] = [{"name": d[0], "typeName": ""} for d in cur.description]
                rows = cur.fetchmany(max_rows)
                e["rows"] = [[cell(v) for v in r] for r in rows]
                e["rowCount"] = len(e["rows"]); e["truncated"] = len(e["rows"]) >= max_rows
            else:
                try: e["rowCount"] = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
                except Exception: e["rowCount"] = 0
        except Exception as ex:
            e["error"] = str(ex)
        finally:
            try: cur.close()
            except Exception: pass
        e["elapsedMs"] = int((time.time()-t0)*1000); out["results"].append(e)
        if e["error"]: break
    try: C.close()
    except Exception: pass
    return out

def main():
    try:
        req = json.load(sys.stdin)
    except Exception as ex:
        print(json.dumps({"fatal": "bad request: %s" % ex})); return
    driver = req.get("driver")
    try:
        if driver == "jdbc":
            out = run_jdbc(req)
        elif driver == "odbc":
            out = run_odbc(req)
        else:
            out = run_pyexasol(req)
    except Exception as ex:
        print(json.dumps({"fatal": "%s" % ex})); return
    print(json.dumps(out))

main()
"#;
