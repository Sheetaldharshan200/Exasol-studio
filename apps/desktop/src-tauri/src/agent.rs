use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, AppResult};
use crate::market::resolve_bin;
use crate::state::AppState;

// The webview cannot fetch http://127.0.0.1 from the tauri:// origin (WebKit
// treats it as mixed content), so ALL agent traffic is proxied through Rust:
// `agent_api` for REST and `agent_stream` for SSE → Tauri events.

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
    /// Session ids with an active SSE reader, to avoid duplicate event streams.
    streams: Mutex<HashSet<String>>,
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

/// A Node runtime bundled into the app resources (placed by the release
/// workflow's fetch-runtime step). Absent in dev builds → returns None and we
/// fall back to system Node.
pub(crate) fn bundled_node(app: &AppHandle) -> Option<PathBuf> {
    let rel = if cfg!(windows) { "runtime/node/node.exe" } else { "runtime/node/bin/node" };
    app.path()
        .resolve(rel, tauri::path::BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists())
}

/// The Node binary Studio itself runs on: bundled runtime first, system Node
/// second. Shared with the MCP gateway export (ai_clients).
pub(crate) fn node_binary(app: &AppHandle) -> Option<PathBuf> {
    bundled_node(app).or_else(|| resolve_bin("node"))
}

fn spawn_sidecar(app: &AppHandle, state: &AppState) -> AppResult<(Child, AgentInfo)> {
    // Prefer the bundled Node (shipping builds), fall back to system Node (dev).
    let node = bundled_node(app).or_else(|| resolve_bin("node")).ok_or_else(|| {
        AppError::Assistant(
            "Node.js is required for the AI assistant but was not found. Install it from nodejs.org or via Homebrew.".into(),
        )
    })?;
    let script = script_path(app)?;
    let data_dir = state.data_dir.join("agent");

    let mut cmd = Command::new(node);
    cmd.arg(&script)
        .arg("--data-dir")
        .arg(&data_dir)
        .stdin(Stdio::piped()) // held open; closing it shuts the agent down
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    // Provision the Exa engine (opencode) for the sidecar's EngineService.
    // ALWAYS pass the data ROOT so the service resolves the installed component
    // copy lazily — installing the engine takes effect without a sidecar
    // restart. Also pass the bundled baseline so a fresh install works offline
    // before any component update. Absent both → the panel shows the install
    // gate.
    cmd.env("EXA_ENGINE_DATA_ROOT", &state.data_dir);
    // Engine-config seeding (MCP servers + the exa agent) lives in the
    // SIDECAR — the single writer of opencode.json. Rust only supplies the
    // launch ingredients it alone knows: the gateway spec and a real npx.
    if let Ok(launch) = crate::ai_clients::mcp_launch(app) {
        cmd.env("EXA_GATEWAY_NODE", &launch.command);
        if let Some(script) = launch.args.first() {
            cmd.env("EXA_GATEWAY_SCRIPT", script);
        }
        if let Some((_, dir)) = launch.env.iter().find(|(k, _)| k == "EXASOL_STUDIO_AGENT_DIR") {
            cmd.env("EXA_AGENT_DIR", dir);
        }
    }
    if let Some(npx) = crate::market::resolve_bin("npx") {
        cmd.env("EXA_NPX", npx);
    }
    if let Some(baseline) = crate::engine::bundled_engine_path(app) {
        let cfg_dir = crate::components_update::component_dir(&state.data_dir, crate::components_update::ComponentId::ExaAgent).join("config");
        let _ = std::fs::create_dir_all(&cfg_dir);
        cmd.env("EXA_ENGINE_BIN", baseline);
        cmd.env("EXA_ENGINE_CONFIG_DIR", cfg_dir);
    }

    let mut child = cmd
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

/// Get the sidecar's connection info, starting or respawning it as needed.
fn ensure_agent(app: &AppHandle) -> AppResult<AgentInfo> {
    let state = app.state::<AppState>();
    let sidecar = app.state::<AgentSidecar>();
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

    let (child, info) = spawn_sidecar(app, &state)?;
    let out = info.clone();
    *guard = Some((child, info));
    Ok(out)
}

/// Grant a saved connection to the agent: decrypt the profile server-side
/// and register it with the sidecar over localhost. The password flows
/// Rust → sidecar memory only — it never enters the webview.
#[tauri::command]
pub async fn agent_grant_connection(app: AppHandle, profile_id: String) -> AppResult<()> {
    let profile = {
        let state = app.state::<AppState>();
        crate::profiles::find_profile(&state, &profile_id)?
    };
    let info = ensure_agent(&app)?;
    let body = serde_json::json!({
        "id": profile.id,
        "name": profile.name,
        "host": profile.host,
        "port": profile.port,
        "user": profile.username,
        "password": profile.password,
        "encryption": profile.ssl_mode != "disabled",
        "schema": profile.schema,
    });
    let client = reqwest::Client::new();
    let res = client
        .put(format!("http://127.0.0.1:{}/v1/connections", info.port))
        .bearer_auth(&info.token)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Assistant(format!("agent connection grant failed: {e}")))?;
    if !res.status().is_success() {
        return Err(AppError::Assistant("agent rejected the connection".into()));
    }
    Ok(())
}

/// Proxy a REST call to the sidecar (the webview cannot reach it directly).
#[tauri::command]
pub async fn agent_api(
    app: AppHandle,
    path: String,
    method: String,
    body: Option<serde_json::Value>,
) -> AppResult<serde_json::Value> {
    let info = ensure_agent(&app)?;
    let url = format!("http://127.0.0.1:{}/v1{}", info.port, path);
    let client = reqwest::Client::new();
    let mut req = match method.as_str() {
        "GET" => client.get(&url),
        "PUT" => client.put(&url),
        "POST" => client.post(&url),
        "DELETE" => client.delete(&url),
        other => return Err(AppError::Assistant(format!("unsupported method {other}"))),
    }
    .bearer_auth(&info.token);
    if let Some(b) = body {
        req = req.json(&b);
    }
    let res = req
        .send()
        .await
        .map_err(|e| AppError::Assistant(format!("agent request failed: {e}")))?;
    let status = res.status();
    let payload: serde_json::Value = res
        .json()
        .await
        .unwrap_or_else(|_| serde_json::json!({ "error": "invalid agent response" }));
    if !status.is_success() {
        let msg = payload
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("agent error");
        return Err(AppError::Assistant(format!("{msg}")));
    }
    Ok(payload)
}

/// Attach to a session's SSE stream and forward every event to the webview
/// as `agent-event:<session_id>`. Idempotent per session.
#[tauri::command]
pub async fn agent_stream(app: AppHandle, session_id: String) -> AppResult<()> {
    let info = ensure_agent(&app)?;
    {
        let sidecar = app.state::<AgentSidecar>();
        let mut streams = sidecar
            .streams
            .lock()
            .map_err(|_| AppError::Assistant("agent state poisoned".into()))?;
        if !streams.insert(session_id.clone()) {
            return Ok(()); // already attached
        }
    }

    let url = format!(
        "http://127.0.0.1:{}/v1/sessions/{}/stream?token={}",
        info.port, session_id, info.token
    );
    let event_name = format!("agent-event:{session_id}");
    let app2 = app.clone();
    let sid = session_id.clone();

    tauri::async_runtime::spawn(async move {
        let cleanup = |app: &AppHandle| {
            if let Ok(mut s) = app.state::<AgentSidecar>().streams.lock() {
                s.remove(&sid);
            }
        };
        let client = reqwest::Client::new();
        let res = match client.get(&url).send().await {
            Ok(r) => r,
            Err(_) => return cleanup(&app2),
        };
        let mut buf = String::new();
        let mut stream = res.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let Ok(bytes) = chunk else { break };
            buf.push_str(&String::from_utf8_lossy(&bytes));
            // SSE frames are separated by a blank line; data lines carry JSON.
            while let Some(pos) = buf.find("\n\n") {
                let frame = buf[..pos].to_string();
                buf.drain(..pos + 2);
                for line in frame.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                            let _ = app2.emit(&event_name, v);
                        }
                    }
                }
            }
        }
        cleanup(&app2);
    });

    Ok(())
}

/// Persist the shield's SQL operation grants where the ENGINE enforces them:
/// `~/.config/exa/exa.json` → agent.exa.options.sqlOps (the engine's database
/// tool reads this file live, per statement — same store `exa ops grant`
/// writes). The prompt directive alone is advisory; without this file the
/// tool refuses writes even when the shield shows them granted.
///
/// The "shell" tool group is managed alongside: present while any write class
/// is granted (so exapump can load data files from the terminal), removed when
/// the shield goes read-only — terminal data loads follow the shield too.
/// Open ~/.config/exa/exa.json, hand `f` the agent.exa.options object, and
/// write the file back. Creates the path (dirs, nesting) as needed; every
/// other config key is preserved untouched.
fn with_exa_options(
    f: impl FnOnce(&mut serde_json::Map<String, serde_json::Value>),
) -> AppResult<serde_json::Map<String, serde_json::Value>> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| AppError::Storage("Could not resolve home directory.".into()))?;
    let dir = std::path::PathBuf::from(home).join(".config").join("exa");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("exa.json");
    let mut root: serde_json::Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if !root.is_object() {
        root = serde_json::json!({});
    }
    let options = root
        .as_object_mut()
        .unwrap()
        .entry("agent")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| AppError::Storage("exa.json: \"agent\" is not an object".into()))?
        .entry("exa")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| AppError::Storage("exa.json: \"agent.exa\" is not an object".into()))?
        .entry("options")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| AppError::Storage("exa.json: \"agent.exa.options\" is not an object".into()))?;
    f(options);
    let snapshot = options.clone();
    std::fs::write(&path, serde_json::to_string_pretty(&root).unwrap_or_default())?;
    Ok(snapshot)
}

/// The engine agent's current option store (granted SQL classes + tool
/// groups) — the Settings "Tools & Plugins" page reads its truth from here.
#[tauri::command]
pub fn engine_options_get() -> AppResult<serde_json::Value> {
    let opts = with_exa_options(|_| {})?;
    Ok(serde_json::json!({
        "sqlOps": opts.get("sqlOps").cloned().unwrap_or_else(|| serde_json::json!([])),
        "tools": opts.get("tools").cloned().unwrap_or_else(|| serde_json::json!([])),
    }))
}

/// Replace the engine agent's tool-group grants (Settings → Tools & Plugins).
/// Whitelisted names only; the shield's ops sync continues to manage the
/// "shell" entry alongside on later shield changes.
#[tauri::command]
pub fn engine_tools_sync(tools: Vec<String>) -> AppResult<()> {
    const GROUPS: [&str; 4] = ["files", "shell", "search", "tasks"];
    let list: Vec<String> = tools.into_iter().filter(|t| GROUPS.contains(&t.as_str())).collect();
    with_exa_options(|options| {
        options.insert("tools".into(), serde_json::json!(list));
    })?;
    Ok(())
}

#[tauri::command]
pub fn engine_ops_sync(sql_ops: Vec<String>) -> AppResult<()> {
    const CLASSES: [&str; 8] = [
        "insert", "update", "delete", "create", "alter", "drop", "dcl", "admin",
    ];
    let ops: Vec<String> = sql_ops
        .into_iter()
        .filter(|o| CLASSES.contains(&o.as_str()))
        .collect();
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| AppError::Storage("Could not resolve home directory.".into()))?;
    let dir = std::path::PathBuf::from(home).join(".config").join("exa");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("exa.json");
    let mut root: serde_json::Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if !root.is_object() {
        root = serde_json::json!({});
    }
    let options = root
        .as_object_mut()
        .unwrap()
        .entry("agent")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| AppError::Storage("exa.json: \"agent\" is not an object".into()))?
        .entry("exa")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| AppError::Storage("exa.json: \"agent.exa\" is not an object".into()))?
        .entry("options")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| AppError::Storage("exa.json: \"agent.exa.options\" is not an object".into()))?;
    let writes_granted = !ops.is_empty();
    options.insert("sqlOps".into(), serde_json::json!(ops));
    let mut tools: Vec<String> = options
        .get("tools")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|t| t.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let has_shell = tools.iter().any(|t| t == "shell");
    if writes_granted && !has_shell {
        tools.push("shell".into());
    } else if !writes_granted && has_shell {
        tools.retain(|t| t != "shell");
    }
    options.insert("tools".into(), serde_json::json!(tools));
    std::fs::write(&path, serde_json::to_string_pretty(&root).unwrap_or_default())?;
    Ok(())
}
