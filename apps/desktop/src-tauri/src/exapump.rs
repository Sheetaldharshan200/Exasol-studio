//! Data loading via the official ExaPump CLI (exasol-labs/exapump).
//! Builds an `EXAPUMP_DSN` from the active connection and streams the upload
//! log to the frontend over `load:log` / `load:done` events.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, AppResult};
use crate::market::{augmented_path, resolve_bin};

/// Resolve the exapump binary: PATH first, then our managed Marketplace install
/// (asset named `exapump-<ver>-<os>-<arch>`).
fn exapump_path(app: &AppHandle) -> Option<String> {
    if let Some(p) = resolve_bin("exapump") {
        return Some(p.to_string_lossy().to_string());
    }
    let dir = app.path().app_data_dir().ok()?.join("marketplace").join("exapump");
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
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
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
    host: String,
    port: u16,
    user: String,
    password: String,
    schema: Option<String>,
    tls: bool,
    file: String,
    table: String,
    delimiter: Option<String>,
    dry_run: bool,
) -> AppResult<Value> {
    let bin = exapump_path(&app).ok_or_else(|| {
        AppError::Storage("ExaPump isn't installed. Install it from the Marketplace, then try again.".into())
    })?;

    let schema_path = schema.filter(|s| !s.is_empty()).map(|s| format!("/{s}")).unwrap_or_default();
    let dsn = format!(
        "exasol://{}:{}@{host}:{port}{schema_path}?tls={}&validateservercertificate=0",
        enc(&user),
        enc(&password),
        if tls { "true" } else { "false" },
    );

    let mut args: Vec<String> = vec!["upload".into(), file, "--table".into(), table];
    if let Some(d) = delimiter.filter(|d| !d.is_empty()) {
        args.push("--delimiter".into());
        args.push(d);
    }
    if dry_run {
        args.push("--dry-run".into());
    }

    emit(&app, if dry_run { "Previewing (dry run)…" } else { "Starting ExaPump upload…" }, "info");
    emit(&app, format!("$ exapump {}", args.join(" ")), "cmd");

    let mut cmd = Command::new(&bin);
    cmd.args(&args)
        .env("EXAPUMP_DSN", &dsn)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if std::env::consts::OS != "windows" {
        cmd.env("PATH", augmented_path());
    }
    let mut child = cmd.spawn().map_err(|e| AppError::Storage(format!("Could not run exapump: {e}")))?;
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
        emit(&app, if dry_run { "✓ Preview complete." } else { "✓ Upload complete." }, "success");
    } else {
        emit(&app, format!("✗ exapump exited with code {}", status.code().unwrap_or(-1)), "err");
    }
    let _ = app.emit("load:done", json!({ "ok": ok, "dryRun": dry_run }));
    if ok {
        Ok(json!({ "ok": true }))
    } else {
        Err(AppError::Storage("ExaPump upload failed — see the log.".into()))
    }
}
