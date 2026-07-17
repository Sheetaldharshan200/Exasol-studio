//! Small filesystem helpers invoked from the frontend after a native dialog
//! has produced a user-chosen path (writing via std::fs avoids fs-plugin
//! scope configuration for arbitrary save locations).

use crate::error::{AppError, AppResult};
use base64::Engine;
use tauri::Manager;

/// Write UTF-8 text to an absolute path chosen by the user in a save dialog.
#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> AppResult<()> {
    std::fs::write(&path, contents)?;
    Ok(())
}

/// Install the `exa-agent` terminal command: a tiny wrapper in ~/.local/bin
/// that runs the bundled CLI with the bundled Node (system node as fallback).
/// Returns the wrapper path; the UI shows a PATH hint if needed.
#[tauri::command]
pub async fn install_cli(app: tauri::AppHandle) -> AppResult<String> {
    let script = app
        .path()
        .resolve("exa-agent.cjs", tauri::path::BaseDirectory::Resource)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if !script.exists() {
        return Err(AppError::Storage(
            "exa-agent.cjs is missing from this build — reinstall Exasol Studio.".into(),
        ));
    }
    let node_rel = if cfg!(windows) { "runtime/node/node.exe" } else { "runtime/node/bin/node" };
    let bundled_node = app
        .path()
        .resolve(node_rel, tauri::path::BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists());

    let home = dirs_home().ok_or_else(|| AppError::Storage("cannot resolve home directory".into()))?;
    let bin_dir = home.join(".local").join("bin");
    std::fs::create_dir_all(&bin_dir)?;

    if cfg!(windows) {
        let node = bundled_node
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "node".into());
        let target = bin_dir.join("exa-agent.cmd");
        std::fs::write(
            &target,
            format!("@echo off\r\n\"{}\" \"{}\" %*\r\n", node, script.to_string_lossy()),
        )?;
        Ok(target.to_string_lossy().to_string())
    } else {
        let node = bundled_node
            .map(|p| format!("\"{}\"", p.to_string_lossy()))
            .unwrap_or_else(|| "node".into());
        let target = bin_dir.join("exa-agent");
        std::fs::write(
            &target,
            format!("#!/bin/sh\nexec {} \"{}\" \"$@\"\n", node, script.to_string_lossy()),
        )?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))?;
        }
        // Fresh accounts rarely have ~/.local/bin on PATH — add it to the
        // shell rc files, idempotently, so `exa-agent` works in a new
        // terminal without any manual step.
        ensure_path_line(&home);
        Ok(target.to_string_lossy().to_string())
    }
}

/// Append the ~/.local/bin PATH export to ~/.zshrc (macOS default shell) and
/// ~/.bashrc (only when it already exists), skipping files that mention
/// `.local/bin` already. Best-effort — a failure never blocks the install.
fn ensure_path_line(home: &std::path::Path) {
    const LINE: &str = "\n# Added by Exasol Studio (exa-agent CLI)\nexport PATH=\"$HOME/.local/bin:$PATH\"\n";
    let zshrc = home.join(".zshrc");
    let bashrc = home.join(".bashrc");
    for (rc, always) in [(zshrc, true), (bashrc, false)] {
        let existing = std::fs::read_to_string(&rc).unwrap_or_default();
        if existing.contains(".local/bin") {
            continue;
        }
        if !always && !rc.exists() {
            continue;
        }
        let _ = std::fs::write(&rc, format!("{existing}{LINE}"));
    }
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(Into::into)
}

/// Persist a chat attachment (base64 payload) under the app data dir so it can
/// be opened in a preview tab. Returns the absolute path written.
#[tauri::command]
pub async fn save_attachment(
    app: tauri::AppHandle,
    name: String,
    base64_data: String,
) -> AppResult<String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Storage(e.to_string()))?
        .join("attachments");
    std::fs::create_dir_all(&dir)?;
    // Keep the real filename (extension drives the preview) but strip
    // anything path-like so an attachment can never escape the directory.
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let safe = safe.trim_matches('.').to_string();
    let file = dir.join(if safe.is_empty() { "attachment".into() } else { safe });
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| AppError::Storage(format!("invalid attachment payload: {e}")))?;
    std::fs::write(&file, bytes)?;
    Ok(file.to_string_lossy().to_string())
}
