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

/// Does a bridge actually EXECUTE this driver, or is it only declared?
///
/// The bridge implements JDBC, ODBC and pyexasol; every other id used to fall
/// through to pyexasol, so choosing "Exasol TS driver" silently opened a
/// pyexasol connection and said nothing. Running a different driver than the
/// one the user picked is a wrong answer, not a missing feature — an
/// unimplemented driver is refused by name until its runtime lands.
pub fn driver_implemented(driver_id: &str) -> bool {
    matches!(
        driver_id,
        // in-process sqlx — the native websocket protocol
        "" | "sqlx-exasol" | "websocket-api"
        // real bridge implementations
        | "pyexasol" | "jdbc" | "odbc"
        // TS driver: bundled Node + the driver bundled into driver-bridge.cjs
        | "ts-js"
        // SQLAlchemy dialect, in the managed Python venv (installed with pyexasol)
        | "sqlalchemy"
        // Arrow-native driver, compiled into Studio — nothing to install
        | "exarrow-rs"
        // Go driver: a prebuilt bridge binary shipped with the app
        | "go"
        // R: the official `exasol` package in a managed R library (R itself is
        // the user's — it is far too large and too path-bound to bundle)
        | "r"
    )
}

/// The bundled TS-driver bridge: release resource first, then the workspace
/// path for `tauri dev` / local builds (same resolution agent-core.cjs uses).
fn ts_bridge_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    if let Ok(p) = app.path().resolve("driver-bridge.cjs", tauri::path::BaseDirectory::Resource) {
        if p.exists() {
            return Ok(p);
        }
    }
    let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/agent-core/dist/driver-bridge.cjs");
    if dev.exists() {
        return Ok(dev.canonicalize().unwrap_or(dev));
    }
    Err(AppError::Storage(
        "The TS driver bridge is missing — run `pnpm -F @exasol-studio/agent-core build`.".into(),
    ))
}

/// The prebuilt Go bridge binary: release resource first, then the local build
/// (`scripts/build-driver-bridges.sh`) for `tauri dev`.
fn go_bridge_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    let name = if std::env::consts::OS == "windows" { "exasol-bridge-go.exe" } else { "exasol-bridge-go" };
    let packaged = format!("bridges/{name}");
    if let Ok(p) = app.path().resolve(&packaged, tauri::path::BaseDirectory::Resource) {
        if p.exists() {
            return Ok(p);
        }
    }
    let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/bridges").join(name);
    if dev.exists() {
        return Ok(dev.canonicalize().unwrap_or(dev));
    }
    Err(AppError::Storage(
        "The Go driver bridge is missing — run `./scripts/build-driver-bridges.sh`.".into(),
    ))
}

/// Which statements return rows, decided by the SAME classifier the native path
/// uses. A bridge that guessed — or ran a statement twice to find out — would
/// double its side effects, so the answer is computed once, here.
///
/// The coupling is deliberate and is the point: when the classifier learns a
/// new output-producing keyword, every driver learns it at once. It is also the
/// only failure mode — a statement the classifier calls DML runs exactly once,
/// but its rows are discarded and reported as a row count, on the native path
/// and on every bridge alike.
pub(crate) fn expect_rows(statements: &[String]) -> Vec<bool> {
    statements.iter().map(|s| crate::query::is_result_set_statement(s)).collect()
}

/// The R bridge script: release resource first, then the workspace copy.
fn r_bridge_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    if let Ok(p) = app.path().resolve("bridge.R", tauri::path::BaseDirectory::Resource) {
        if p.exists() {
            return Ok(p);
        }
    }
    let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/driver-bridges/r/bridge.R");
    if dev.exists() {
        return Ok(dev.canonicalize().unwrap_or(dev));
    }
    Err(AppError::Storage("The R driver bridge script is missing — reinstall Exasol Studio.".into()))
}

/// `Rscript` on the user's machine. R is not bundled: it is a large runtime
/// that hard-codes its own install paths, so it cannot travel with the app.
fn rscript_bin() -> Option<std::path::PathBuf> {
    resolve_bin("Rscript")
}

/// Studio's managed R library — the official `exasol` package is installed
/// here, never into the user's own library.
fn r_lib_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = runtimes_dir(app)?.join("r-lib");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn r_ready(app: &AppHandle) -> bool {
    rscript_bin().is_some()
        && r_lib_dir(app).map(|d| d.join("exasol").is_dir()).unwrap_or(false)
}

/// What to tell the user when a driver has no implementation yet.
///
/// Specific where the reason is specific: ADO.NET is not "coming later", it is
/// published by Exasol as a **Windows-only MSI** (the downloads portal lists no
/// macOS or Linux build, and there is no NuGet package), so no amount of work
/// here makes it run on this machine.
pub fn unimplemented_driver_message(driver_id: &str) -> String {
    if driver_id == "ado-net" {
        return "Exasol publishes the ADO.NET provider only as a Windows installer (no macOS/Linux build, no NuGet package), \
                so it can run only on Windows, after installing that provider. Studio will not quietly run a different driver in its place."
            .to_string();
    }
    let runtime = driver_runtime(driver_id);
    format!(
        "The \"{driver_id}\" driver is not wired up in Studio yet — it needs the {runtime} runtime bridge. \
         Pick the native driver (or JDBC/ODBC/pyexasol) for this connection; Studio will not quietly run a different driver in its place."
    )
}

/// The `python`, `jvm`, … runtimes all execute through the shared Python bridge
/// (JDBC via jaydebeapi/JPype), so they share the managed venv.
fn uses_python_bridge(runtime: &str) -> bool {
    runtime == "python" || runtime == "jvm" || runtime == "odbc"
}

/// Every runtime that executes by spawning a bridge process and exchanging one
/// JSON request/response — Python, the bundled Node, and the prebuilt Go binary.
fn uses_bridge_process(runtime: &str) -> bool {
    uses_python_bridge(runtime) || runtime == "node" || runtime == "go" || runtime == "r"
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
    // A user-supplied JAR (Drivers tab → "Use custom JAR") wins over the
    // managed one, so people can pin their own driver version.
    if let Some(custom) = driver_override(app, "jdbc") {
        let p = PathBuf::from(&custom);
        if p.is_file() {
            return Ok(p);
        }
    }
    Ok(jdbc_dir(app)?.join(format!("exasol-jdbc-{JDBC_VERSION}.jar")))
}

fn overrides_path(app: &AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    Some(app.state::<crate::state::AppState>().data_dir.join("driver-overrides.json"))
}

/// The stored per-driver artifact override (currently: a custom JAR path).
pub fn driver_override(app: &AppHandle, driver_id: &str) -> Option<String> {
    let path = overrides_path(app)?;
    let raw = std::fs::read_to_string(path).ok()?;
    let map: serde_json::Value = serde_json::from_str(&raw).ok()?;
    map.get(driver_id).and_then(|v| v.as_str()).map(String::from)
}

#[tauri::command]
pub fn driver_overrides_get(app: AppHandle) -> AppResult<serde_json::Value> {
    let Some(path) = overrides_path(&app) else { return Ok(json!({})) };
    if !path.exists() {
        return Ok(json!({}));
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(serde_json::from_str(&raw).unwrap_or_else(|_| json!({})))
}

#[tauri::command]
pub fn driver_override_set(app: AppHandle, driver_id: String, path: Option<String>) -> AppResult<serde_json::Value> {
    let Some(file) = overrides_path(&app) else { return Ok(json!({})) };
    let mut map: serde_json::Value = if file.exists() {
        serde_json::from_str(&std::fs::read_to_string(&file).unwrap_or_default()).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    let obj = map.as_object_mut().ok_or_else(|| AppError::Storage("driver overrides file is corrupt".into()))?;
    match path.filter(|p| !p.trim().is_empty()) {
        Some(p) => {
            if !std::path::Path::new(&p).is_file() {
                return Err(AppError::Storage(format!("No file at {p}")));
            }
            obj.insert(driver_id, serde_json::Value::String(p));
        }
        None => {
            obj.remove(&driver_id);
        }
    }
    std::fs::write(&file, serde_json::to_string_pretty(&map).unwrap_or_default())
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(map)
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
            (ok, true, if ok { String::new() } else { "Install the ODBC Driver from the Marketplace — one click sets up the runtime and wires the official Exasol driver, no OS install needed.".into() })
        }
        "node" => {
            // Bundled with the app; only a broken install can lose it.
            let ok = crate::agent::node_binary(&app).is_some();
            (ok, true, if ok { String::new() } else { "The bundled Node runtime is missing — reinstall Exasol Studio.".into() })
        }
        "go" => {
            // Shipped as a prebuilt binary; only a broken install can lose it.
            let ok = go_bridge_path(&app).is_ok();
            (ok, true, if ok { String::new() } else { "The Go driver bridge is missing — reinstall Exasol Studio.".into() })
        }
        "r" => {
            let hint = if rscript_bin().is_none() {
                "R isn’t installed on this machine. Install R (r-project.org), then install the R driver runtime here — R is too large and too path-bound to ship inside Studio."
            } else {
                "Install the R driver runtime: Studio puts the official Exasol R package in its own library and points it at the ODBC driver it manages."
            };
            let ok = r_ready(&app);
            (ok, true, if ok { String::new() } else { hint.into() })
        }
        other => (false, false, format!("The {other} driver runtime isn’t available yet — it’s coming in a later update.")),
    };
    // What the picker calls "supported" must match what execute_via_driver
    // will actually DO — driver_implemented() is the single authority, so a
    // driver can never be offered and then refused (or quietly substituted:
    // sqlalchemy mapped to the python runtime and exarrow-rs to native, both
    // of which would have run a different driver than the one selected).
    let (ready, supported, hint) = if driver_implemented(&driver_id) {
        (ready, supported, hint)
    } else {
        (false, false, unimplemented_driver_message(&driver_id))
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
        "r" => setup_r(&app, &id).await,
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
        "Note: the Marketplace ODBC Driver install wires the official Exasol driver automatically; an OS-registered driver also works.",
        "info",
    );
    Ok(())
}

/// Install the official Exasol R package into Studio's own R library.
///
/// `exasol` talks to the database through the Exasol ODBC driver and is built
/// from source, so this needs the user's R plus a compiler — which is exactly
/// why R is detected rather than bundled. Nothing is written to the user's own
/// R library.
async fn setup_r(app: &AppHandle, id: &str) -> AppResult<()> {
    let rscript = rscript_bin().ok_or_else(|| {
        AppError::Storage(
            "R isn’t installed on this machine. Install R from r-project.org, then run this again.".into(),
        )
    })?;
    let lib = r_lib_dir(app)?.to_string_lossy().to_string();
    let script = format!(
        "lib <- {lib:?}; dir.create(lib, showWarnings = FALSE, recursive = TRUE); \
         repo <- \"https://cloud.r-project.org\"; \
         need <- setdiff(c(\"jsonlite\", \"DBI\", \"RODBC\", \"remotes\"), rownames(installed.packages(lib.loc = c(lib, .libPaths())))); \
         if (length(need)) install.packages(need, lib = lib, repos = repo); \
         .libPaths(c(lib, .libPaths())); \
         if (!requireNamespace(\"exasol\", quietly = TRUE)) remotes::install_github(\"exasol/r-exasol\", lib = lib, upgrade = \"never\"); \
         if (!requireNamespace(\"exasol\", quietly = TRUE)) stop(\"the exasol package did not install\")"
    );
    let rscript_s = rscript.to_string_lossy().to_string();
    emit_log(app, id, "Installing the official Exasol R package into Studio’s R library…", "info");
    let app2 = app.clone();
    let id2 = id.to_string();
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        if run_streamed(&app2, &id2, &rscript_s, &["-e", &script])? != 0 {
            return Err(AppError::Storage(
                "The R package install failed — R needs a compiler and the unixODBC development files. See the log.".into(),
            ));
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))??;
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
    if uses_bridge_process(runtime) {
        execute_bridge(app, profile, statements, max_rows)
    } else {
        Err(AppError::Storage(format!("Execution via the {runtime} driver isn’t available yet.")))
    }
}

fn execute_bridge(
    app: &AppHandle,
    profile: &ConnectionProfile,
    statements: &[String],
    max_rows: usize,
) -> AppResult<ExecuteResponse> {
    if !driver_implemented(&profile.driver_id) {
        return Err(AppError::Storage(unimplemented_driver_message(&profile.driver_id)));
    }
    // The TS and Go drivers run on runtimes Studio already ships — the bundled
    // Node with the driver bundled into the bridge, and a prebuilt Go binary —
    // so neither asks the user to install anything.
    let is_ts = profile.driver_id == "ts-js";
    let is_go = profile.driver_id == "go";
    let is_r = profile.driver_id == "r";
    let needs_python = !is_ts && !is_go && !is_r;
    let py = if needs_python { python_bin(app)? } else { std::path::PathBuf::new() };
    if needs_python && !py.exists() {
        return Err(AppError::Storage("This driver's runtime isn’t installed. Install it, then try again.".into()));
    }
    let is_jdbc = profile.driver_id == "jdbc";
    if is_jdbc && !python_jdbc_ready(app) {
        return Err(AppError::Storage("The JDBC runtime isn’t fully installed. Install it, then try again.".into()));
    }
    if profile.driver_id == "odbc" && !odbc_ready(app) {
        return Err(AppError::Storage("The ODBC runtime isn’t installed. Install it, then try again.".into()));
    }
    if is_r && !r_ready(app) {
        return Err(AppError::Storage(
            "The R driver runtime isn’t installed. Install it from the Drivers tab (it needs R on this machine), then try again."
                .into(),
        ));
    }

    // (runtime binary, script it runs). The Go bridge IS the binary, so it has
    // no script argument.
    let (runtime_bin, script): (std::path::PathBuf, Option<std::path::PathBuf>) = if is_go {
        (go_bridge_path(app)?, None)
    } else if is_r {
        let rscript = rscript_bin().ok_or_else(|| {
            AppError::Storage("R isn’t installed on this machine — install R, then install the R driver runtime.".into())
        })?;
        (rscript, Some(r_bridge_path(app)?))
    } else if is_ts {
        let node = crate::agent::node_binary(app).ok_or_else(|| {
            AppError::Storage("The bundled Node runtime is missing — reinstall Exasol Studio.".into())
        })?;
        (node, Some(ts_bridge_path(app)?))
    } else {
        let p = python_dir(app)?.join("bridge.py");
        std::fs::write(&p, PYTHON_BRIDGE)?;
        (py.clone(), Some(p))
    };

    let tls = profile.ssl_mode != "disabled";
    let verify = profile.ssl_mode == "verify_ca" || profile.ssl_mode == "verify_identity";
    let jar = if needs_python { jdbc_jar(app)?.to_string_lossy().to_string() } else { String::new() };
    // A Marketplace-installed ODBC library is used by PATH (pyodbc accepts a
    // driver file path), so no OS-level driver registration is ever required.
    let odbc_lib = driver_override(app, "odbc")
        .filter(|p| std::path::Path::new(p).is_file())
        .unwrap_or_default();
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
        "driverPath": odbc_lib,
        "statements": statements,
        "expectRows": expect_rows(statements),
    });

    let mut cmd = Command::new(&runtime_bin);
    if let Some(script) = &script {
        cmd.arg(script);
    }
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if std::env::consts::OS != "windows" {
        cmd.env("PATH", augmented_path());
    }
    if is_jdbc {
        if let Some(home) = jre_home(app) {
            cmd.env("JAVA_HOME", &home);
        }
    }
    if is_r {
        // The managed library, so the bridge finds `exasol` without Studio ever
        // writing into the user's own R library.
        cmd.env("EXASOL_STUDIO_R_LIB", r_lib_dir(app)?);
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
    Ok(ExecuteResponse { results, total_elapsed_ms, success, profile_session: None, profile_base_stmt: None })
}

/// The shared Python bridge: PyExasol for the `python` drivers, jaydebeapi for
/// JDBC. Reads one JSON request on stdin, writes one JSON response on stdout.
/// The Python bridge — pyexasol, the SQLAlchemy dialect, JDBC (jaydebeapi) and
/// ODBC (pyodbc), all in the managed venv. Kept as real Python next to the Go
/// and R bridges so it can be read, linted and edited like the others; it is
/// embedded at compile time and written into the venv at run time.
const PYTHON_BRIDGE: &str = include_str!("../../../../packages/driver-bridges/python/bridge.py");

#[cfg(test)]
mod driver_support_tests {
    use super::{driver_implemented, driver_runtime, expect_rows, unimplemented_driver_message};

    #[test]
    fn bridges_are_told_which_statements_return_rows_by_the_shared_classifier() {
        let stmts: Vec<String> = [
            "SELECT 1",
            "  /* lead */ WITH x AS (SELECT 1) SELECT * FROM x",
            "(SELECT 1) UNION (SELECT 2)",
            "EXECUTE SCRIPT SEMANTIC_ADMIN.DESCRIBE_SEMANTIC_OBJECT('a','b')",
            "INSERT INTO T VALUES (1)",
            "CREATE TABLE T (A INT)",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        assert_eq!(
            expect_rows(&stmts),
            vec![true, true, true, true, false, false],
            "a bridge that reads this wrong either loses rows or double-runs a statement"
        );
    }


    #[test]
    fn only_drivers_with_a_real_implementation_are_allowed() {
        for id in ["", "sqlx-exasol", "websocket-api", "pyexasol", "jdbc", "odbc"] {
            assert!(driver_implemented(id), "{id} should execute");
        }
        // Declared in driver_runtime() but no bridge implements them — these
        // used to silently run pyexasol instead.
        assert!(driver_implemented("ts-js"), "TS runs on the bundled Node bridge");
        assert!(driver_implemented("sqlalchemy"), "SQLAlchemy runs through its own dialect");
        assert!(driver_implemented("exarrow-rs"), "exarrow runs in-process");
        assert!(driver_implemented("go"), "Go runs on the prebuilt bridge binary");
        assert!(driver_implemented("r"), "R runs the official package in a managed library");
        // ADO.NET is published only as a Windows MSI, so it stays refused here.
        assert!(!driver_implemented("ado-net"), "ado-net must be refused, not substituted");
    }

    #[test]
    fn every_unimplemented_driver_the_ui_can_offer_is_refused_by_the_same_rule() {
        // The picker's "supported" and the executor's gate must never
        // disagree. Every id the executor claims must have a path that really
        // runs THAT driver — exarrow's is `exarrow_exec`, not the sqlx pool.
        assert!(!driver_implemented("ado-net"), "ado-net runs a DIFFERENT driver than selected");
    }

    #[test]
    fn the_refusal_names_the_driver_and_the_runtime_it_needs() {
        let msg = unimplemented_driver_message("websocket-over-carrier-pigeon");
        assert!(msg.contains("websocket-over-carrier-pigeon"), "{msg}");
        assert!(msg.contains(driver_runtime("websocket-over-carrier-pigeon")), "{msg}");
    }

    #[test]
    fn ado_net_is_refused_with_the_real_reason_not_a_coming_soon() {
        let msg = unimplemented_driver_message("ado-net");
        assert!(msg.contains("Windows"), "the reason is the platform, not our backlog: {msg}");
        assert!(!msg.contains("not wired up"), "{msg}");
    }
}
