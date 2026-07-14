use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::error::{AppError, AppResult};
use crate::market::resolve_bin;
use crate::state::AppState;

/// Connection details for the agent-core sidecar HTTP+SSE server.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub port: u16,
    pub token: String,
}

#[derive(Debug, Deserialize)]
struct ReadyLine {
    event: String,
    port: u16,
    token: String,
}

/// Managed state holding the sidecar process. The child's stdin pipe is held
/// open for its lifetime — agent-core exits on its own when the pipe closes
/// (parent death), so no orphaned processes.
#[derive(Default)]
pub struct AgentSidecar {
    inner: Mutex<Option<(Child, AgentInfo)>>,
}

/// Locate the bundled agent-core script: release resource first, then the
/// workspace path for `tauri dev` / local builds.
fn script_path(app: &AppHandle) -> AppResult<PathBuf> {
    if let Ok(p) = app
        .path()
        .resolve("agent-core.cjs", tauri::path::BaseDirectory::Resource)
    {
        if p.exists() {
            return Ok(p);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/agent-core/dist/agent-core.cjs");
    if dev.exists() {
        return Ok(dev.canonicalize().unwrap_or(dev));
    }
    Err(AppError::Assistant(
        "agent-core.cjs not found — run `pnpm -F @exasol-studio/agent-core build`".into(),
    ))
}

fn spawn_sidecar(app: &AppHandle, state: &AppState) -> AppResult<(Child, AgentInfo)> {
    let node = resolve_bin("node").ok_or_else(|| {
        AppError::Assistant(
            "Node.js is required for the AI assistant but was not found. Install it from nodejs.org or via Homebrew.".into(),
        )
    })?;
    let script = script_path(app)?;
    let data_dir = state.data_dir.join("agent");

    let mut child = Command::new(node)
        .arg(&script)
        .arg("--data-dir")
        .arg(&data_dir)
        .stdin(Stdio::piped()) // held open; closing it shuts the agent down
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| AppError::Assistant(format!("failed to start agent: {e}")))?;

    // Read the single "ready" line with a timeout so a broken script can't
    // hang the UI.
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Assistant("agent stdout unavailable".into()))?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut line = String::new();
        if BufReader::new(stdout).read_line(&mut line).is_ok() {
            let _ = tx.send(line);
        }
    });

    let line = rx.recv_timeout(Duration::from_secs(15)).map_err(|_| {
        let _ = child.kill();
        AppError::Assistant("agent did not become ready within 15s".into())
    })?;

    let ready: ReadyLine = serde_json::from_str(line.trim())
        .map_err(|e| AppError::Assistant(format!("bad agent handshake: {e} ({line})")))?;
    if ready.event != "ready" {
        return Err(AppError::Assistant(format!("unexpected handshake: {line}")));
    }

    Ok((
        child,
        AgentInfo {
            port: ready.port,
            token: ready.token,
        },
    ))
}

/// Return the sidecar's port + token, starting it on first use and
/// respawning it if it died.
#[tauri::command]
pub fn agent_info(
    app: AppHandle,
    state: State<'_, AppState>,
    sidecar: State<'_, AgentSidecar>,
) -> AppResult<AgentInfo> {
    let mut guard = sidecar
        .inner
        .lock()
        .map_err(|_| AppError::Assistant("agent state poisoned".into()))?;

    if let Some((child, info)) = guard.as_mut() {
        match child.try_wait() {
            Ok(None) => return Ok(info.clone()), // still running
            _ => *guard = None,                  // exited — respawn below
        }
    }

    let (child, info) = spawn_sidecar(&app, &state)?;
    let out = info.clone();
    *guard = Some((child, info));
    Ok(out)
}
