//! Data loading via the official ExaPump CLI (exasol-labs/exapump).
//! Builds an `EXAPUMP_DSN` from the active connection and streams the upload
//! log to the frontend over `load:log` / `load:done` events.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, AppResult};
use crate::market::{augmented_path, resolve_bin};

/// Resolve the exapump binary: PATH first, then our managed Marketplace install
/// (asset named `exapump-<ver>-<os>-<arch>`).
fn exapump_path(app: &AppHandle) -> Option<String> {
    if let Some(p) = resolve_bin("exapump") {
        return Some(p.to_string_lossy().to_string());
    }
    let managed_name = if cfg!(windows) {
        "exapump.exe"
    } else {
        "exapump"
    };
    // An independently-installed ExaPump (its own env) takes precedence over the
    // shared managed copy — gated on its install manifest so a half-built env
    // can't shadow the working one (mirrors the MCP server).
    if let Ok(dd) = app.path().app_data_dir() {
        let id = crate::components_update::ComponentId::ExaPump;
        if crate::components_update::read_manifest(&dd, id).is_some() {
            let own = crate::components_update::component_dir(&dd, id).join(managed_name);
            if own.is_file() {
                return Some(own.to_string_lossy().to_string());
            }
        }
    }
    let managed = app
        .path()
        .app_data_dir()
        .ok()?
        .join("personal-local/bin")
        .join(managed_name);
    if managed.is_file() {
        return Some(managed.to_string_lossy().to_string());
    }
    let dir = app
        .path()
        .app_data_dir()
        .ok()?
        .join("marketplace")
        .join("exapump");
    for entry in std::fs::read_dir(&dir).ok()?.flatten() {
        let p = entry.path();
        if p.is_file() {
            if let Some(n) = p.file_name().and_then(|n| n.to_str()) {
                if n.to_lowercase().contains("exapump") {
                    return Some(p.to_string_lossy().to_string());
                }
            }
        }
    }
    None
}

/// True when exapump can be found (used to route to the Marketplace if not).
#[tauri::command]
pub fn exapump_available(app: AppHandle) -> bool {
    exapump_path(&app).is_some()
}

/// Percent-encode DSN user-info so passwords with special chars are safe.
fn enc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn emit(app: &AppHandle, line: impl Into<String>, level: &str) {
    let _ = app.emit("load:log", json!({ "line": line.into(), "level": level }));
}

/// Upload a CSV/Parquet file into an Exasol table with exapump.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn exapump_upload(
    app: AppHandle,
    profile_id: String,
    schema: Option<String>,
    file: String,
    table: String,
    delimiter: Option<String>,
    dry_run: bool,
) -> AppResult<Value> {
    // A read-only connection is not loaded into (a dry run still is).
    let read_only = crate::safety::read_only(&app.state::<crate::state::AppState>(), &profile_id);
    if read_only && !dry_run {
        let name = crate::profiles::find_profile(&app.state::<crate::state::AppState>(), &profile_id)?.name;
        return Err(AppError::InvalidSettings(format!("\"{name}\" is read-only: data cannot be loaded into it.")));
    }
    let schema_path = schema.filter(|s| !s.is_empty()).map(|s| format!("/{s}")).unwrap_or_default();
    let target = pump_target(&app, &profile_id, &schema_path)?;
    let (bin, dsn) = (target.bin, target.dsn);

    let mut args: Vec<String> = vec!["upload".into(), file, "--table".into(), table];
    args.extend(target.pin_args);
    if let Some(d) = delimiter.filter(|d| !d.is_empty()) {
        args.push("--delimiter".into());
        args.push(d);
    }
    if dry_run {
        args.push("--dry-run".into());
    }
    run_upload(app, bin, dsn, args, dry_run)
}

/// How to run exapump against a saved connection: the binary, the DSN (for
/// the environment, never argv) and the certificate pin arguments.
struct PumpTarget {
    bin: String,
    dsn: String,
    pin_args: Vec<String>,
}

/// Credentials and trust come from the saved connection, never from the page.
fn pump_target(app: &AppHandle, profile_id: &str, schema_path: &str) -> AppResult<PumpTarget> {
    let profile = crate::profiles::find_profile(&app.state::<crate::state::AppState>(), profile_id)?;
    if profile.auth_method != "password" {
        return Err(AppError::InvalidSettings("ExaPump signs in with a password; this connection uses a token.".into()));
    }
    // Through an SSH tunnel or proxy: the open connection's loopback port.
    let (host, port) = match &profile.network {
        Some(_) => {
            let state = app.state::<crate::state::AppState>();
            let route = state.carriers.lock().ok().and_then(|c| c.get(&profile.id).and_then(|c| c.route_port()));
            match route {
                Some(p) => ("127.0.0.1".to_string(), p),
                None => return Err(AppError::InvalidSettings("Connect first: this connection runs through an SSH tunnel or proxy.".into())),
            }
        }
        None => (profile.host.clone(), profile.port),
    };
    let (user, password) = (profile.username.clone(), profile.password.clone());
    let (_, verify) = crate::tls_trust::driver_tls(&profile.ssl_mode);
    let bin = exapump_path(app).ok_or_else(|| {
        AppError::Storage(
            "ExaPump isn't installed. Install it from the Marketplace, then try again.".into(),
        )
    })?;

    let dsn = format!(
        "exasol://{}:{}@{host}:{port}{schema_path}?tls=true&validateservercertificate={}",
        enc(&user),
        enc(&password),
        // A pin is passed as exapump's own pin (below); else the verify mode.
        if verify && profile.fingerprint.is_none() { "1" } else { "0" },
    );

    let pin_args = profile.fingerprint.iter().flat_map(|fp| ["--certificate-fingerprint".to_string(), fp.clone()]).collect();
    Ok(PumpTarget { bin, dsn, pin_args })
}

fn run_upload(app: AppHandle, bin: String, dsn: String, args: Vec<String>, dry_run: bool) -> AppResult<Value> {
    emit(
        &app,
        if dry_run {
            "Previewing (dry run)…"
        } else {
            "Starting ExaPump upload…"
        },
        "info",
    );
    emit(&app, format!("$ exapump {}", args.join(" ")), "cmd");

    let mut cmd = crate::process::command(&bin);
    cmd.args(&args)
        .env("EXAPUMP_DSN", &dsn)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if std::env::consts::OS != "windows" {
        cmd.env("PATH", augmented_path());
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Storage(format!("Could not run exapump: {e}")))?;
    let out = child.stdout.take();
    let err = child.stderr.take();
    let a1 = app.clone();
    let h1 = std::thread::spawn(move || {
        if let Some(o) = out {
            for line in BufReader::new(o).lines().map_while(Result::ok) {
                emit(&a1, line, "out");
            }
        }
    });
    let a2 = app.clone();
    let h2 = std::thread::spawn(move || {
        if let Some(e) = err {
            for line in BufReader::new(e).lines().map_while(Result::ok) {
                emit(&a2, line, "out");
            }
        }
    });
    let status = child.wait().map_err(|e| AppError::Storage(e.to_string()))?;
    let _ = h1.join();
    let _ = h2.join();
    let ok = status.success();
    if ok {
        emit(
            &app,
            if dry_run {
                "✓ Preview complete."
            } else {
                "✓ Upload complete."
            },
            "success",
        );
    } else {
        emit(
            &app,
            format!("✗ exapump exited with code {}", status.code().unwrap_or(-1)),
            "err",
        );
    }
    let _ = app.emit("load:done", json!({ "ok": ok, "dryRun": dry_run }));
    if ok {
        Ok(json!({ "ok": true }))
    } else {
        Err(AppError::Storage(
            "ExaPump upload failed — see the log.".into(),
        ))
    }
}

/// Export a whole query result (not just the fetched rows) to a CSV or
/// Parquet file the person picks. Returns the path, or None when cancelled.
#[tauri::command]
pub async fn exapump_export(app: AppHandle, profile_id: String, query: String, format: String) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    if !["csv", "parquet"].contains(&format.as_str()) {
        return Err(AppError::InvalidSettings("Export as CSV or Parquet.".into()));
    }
    // An export reads; a statement that writes is not exported, read-only connection or not.
    if crate::safety::is_write(&query) {
        return Err(AppError::InvalidSettings("Only a query's result can be exported.".into()));
    }
    let query = query.trim().trim_end_matches(';').trim().to_string();
    let target = pump_target(&app, &profile_id, "")?;
    let name = format!("result.{format}");
    let filter = if format == "csv" { "CSV" } else { "Parquet" };
    let dialog = app.clone();
    let wanted = format.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.dialog().file().set_file_name(&name).add_filter(filter, &[wanted.as_str()]).blocking_save_file())
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    crate::files::write_permitted(&path, crate::files::home_dir().as_deref()).map_err(AppError::InvalidSettings)?;
    // The file is what the format says it is: a typed-in other extension is refused, not mislabelled.
    let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    if ext != format {
        return Err(AppError::InvalidSettings(format!("Save the export as a .{format} file.")));
    }
    let mut args: Vec<String> = vec!["export".into(), "--query".into(), query, "--output".into(), path.to_string_lossy().into_owned(), "--format".into(), format];
    args.extend(target.pin_args);
    let (bin, dsn) = (target.bin, target.dsn);
    let out = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = crate::process::command(&bin);
        cmd.args(&args).env("EXAPUMP_DSN", &dsn).stdin(Stdio::null());
        if std::env::consts::OS != "windows" {
            cmd.env("PATH", augmented_path());
        }
        cmd.output()
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))?
    .map_err(|e| AppError::Storage(format!("Could not run exapump: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let last = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("exapump failed").trim();
        return Err(AppError::Storage(format!("Export failed: {last}")));
    }
    Ok(Some(path.to_string_lossy().into_owned()))
}
