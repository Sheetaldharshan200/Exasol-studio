//! Real PTY-backed terminals (VS Code-style): each instance spawns the user's
//! shell in a pseudo-terminal; output streams to the webview as `term-data`
//! events, input/resize/kill arrive as commands. Same trust model as any
//! desktop terminal — it is the user's own shell, running as the user.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Curated shims dir (`<data>/bin`) exposing every Studio-managed tool under
/// its plain name — including marketplace binaries stored under versioned
/// filenames. Rebuilt (cheaply) on every terminal spawn so newly installed
/// tools appear in the next terminal.
fn ensure_shims(data_dir: &Path) -> Option<PathBuf> {
    let shims = data_dir.join("bin");
    std::fs::create_dir_all(&shims).ok()?;
    let mut targets: Vec<(String, PathBuf)> = Vec::new();
    for name in ["exasol", "exapump"] {
        targets.push((name.into(), data_dir.join("personal-local/bin").join(name)));
    }
    for name in ["exasol-mcp-server", "exasol-mcp-server-http", "exasol-install-skills"] {
        targets.push((name.into(), data_dir.join("personal-local/python/bin").join(name)));
    }
    // Marketplace downloads keep versioned names (tool-1.2.3-macos-aarch64).
    if let Ok(entries) = std::fs::read_dir(data_dir.join("marketplace/json-tables")) {
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().to_string();
            if file.starts_with("exasol-json-tables-ingest") && !file.ends_with(".whl") {
                targets.push(("exasol-json-tables-ingest".into(), entry.path()));
            }
        }
    }
    #[cfg(unix)]
    for (name, target) in targets {
        if !target.is_file() {
            continue;
        }
        let link = shims.join(&name);
        if std::fs::read_link(&link).map(|existing| existing == target).unwrap_or(false) {
            continue;
        }
        let _ = std::fs::remove_file(&link);
        let _ = std::os::unix::fs::symlink(&target, &link);
    }
    Some(shims)
}

struct TermHandle {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct TermRegistry(Mutex<HashMap<u32, TermHandle>>);

static NEXT_ID: AtomicU32 = AtomicU32::new(1);

#[tauri::command]
pub fn term_create(app: AppHandle, state: State<'_, TermRegistry>, cols: u16, rows: u16) -> AppResult<u32> {
    let pty = native_pty_system()
        .openpty(PtySize { rows: rows.max(4), cols: cols.max(20), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| AppError::Storage(format!("could not open a pty: {e}")))?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    // GUI apps inherit a restricted PATH — give the shell the usual user dirs
    // plus every Studio-managed tool (exasol, exapump, MCP server, extensions)
    // via the curated shims dir.
    if let Some(home) = dirs::home_dir() {
        cmd.cwd(&home);
        let h = home.display();
        let data_dir = app.state::<AppState>().data_dir.clone();
        let shims = ensure_shims(&data_dir)
            .map(|dir| format!("{}:", dir.display()))
            .unwrap_or_default();
        let path = std::env::var("PATH").unwrap_or_default();
        cmd.env(
            "PATH",
            format!(
                "{shims}{data}/personal-local/bin:\
{h}/.local/bin:{h}/.exasol-starter-kit/bin:/opt/homebrew/bin:/usr/local/bin:{path}",
                data = data_dir.display()
            ),
        );
    }
    let child = pty
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::Storage(format!("could not start {shell}: {e}")))?;

    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    let mut reader = pty
        .master
        .try_clone_reader()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let emit_app = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = emit_app.emit("term-data", serde_json::json!({ "id": id, "data": data }));
                }
            }
        }
        let _ = emit_app.emit("term-exit", serde_json::json!({ "id": id }));
    });

    let writer = pty
        .master
        .take_writer()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    state
        .0
        .lock()
        .unwrap()
        .insert(id, TermHandle { writer, master: pty.master, child });
    Ok(id)
}

#[tauri::command]
pub fn term_write(state: State<'_, TermRegistry>, id: u32, data: String) -> AppResult<()> {
    let mut map = state.0.lock().unwrap();
    let h = map.get_mut(&id).ok_or_else(|| AppError::Storage("terminal is gone".into()))?;
    h.writer
        .write_all(data.as_bytes())
        .map_err(|e| AppError::Storage(e.to_string()))
}

#[tauri::command]
pub fn term_resize(state: State<'_, TermRegistry>, id: u32, cols: u16, rows: u16) -> AppResult<()> {
    let map = state.0.lock().unwrap();
    let h = map.get(&id).ok_or_else(|| AppError::Storage("terminal is gone".into()))?;
    h.master
        .resize(PtySize { rows: rows.max(4), cols: cols.max(20), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| AppError::Storage(e.to_string()))
}

#[tauri::command]
pub fn term_kill(state: State<'_, TermRegistry>, id: u32) -> AppResult<()> {
    if let Some(mut h) = state.0.lock().unwrap().remove(&id) {
        let _ = h.child.kill();
    }
    Ok(())
}
