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
    // plus Studio's own bundled tools (exapump, exasol/c4, MCP server).
    if let Some(home) = dirs::home_dir() {
        cmd.cwd(&home);
        let h = home.display();
        let path = std::env::var("PATH").unwrap_or_default();
        cmd.env(
            "PATH",
            format!(
                "{h}/Library/Application Support/com.exasol.studio/personal-local/bin:\
{h}/.local/bin:{h}/.exasol-starter-kit/bin:/opt/homebrew/bin:/usr/local/bin:{path}"
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
