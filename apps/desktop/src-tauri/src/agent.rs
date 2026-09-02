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
    // exapump (the data-load CLI the agent's shell uses) lives in the managed
    // component dir, not on the GUI PATH — prepend it so the engine's shell
    // finds it by name.
    {
        let bin_dir = state.data_dir.join("personal-local").join("bin");
        let base = std::env::var("PATH").unwrap_or_default();
        let sep = if std::env::consts::OS == "windows" { ";" } else { ":" };
        cmd.env("PATH", format!("{}{}{}", bin_dir.to_string_lossy(), sep, base));
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
    // Keep exapump usable for the SAME database: the agent's data loads run
    // `exapump upload … -p studio`, so provision/refresh that profile with
    // this connection's credentials (best-effort — exapump may be absent).
    // validate-certificate=false: the local Personal DB serves a self-signed
    // cert that would otherwise fail every load.
    {
        let state = app.state::<AppState>();
        let exapump = state.data_dir.join("personal-local").join("bin").join("exapump");
        if exapump.exists() {
            // Re-grant refreshes: drop any previous "studio" profile first.
            let _ = std::process::Command::new(&exapump)
                .args(["profile", "remove", "studio"])
                .output();
            let _ = std::process::Command::new(&exapump)
                .args([
                    "profile",
                    "add",
                    "studio",
                    "--host",
                    &profile.host,
                    "--port",
                    &profile.port.to_string(),
                    "--user",
                    &profile.username,
                    "--password",
                    &profile.password,
                    "--tls",
                    if profile.ssl_mode == "disabled" { "false" } else { "true" },
                    "--validate-certificate",
                    "false",
                    "--default",
                ])
                .output();
        }
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

/// The exa.json the RUNNING engine actually reads: Studio spawns the engine
/// with XDG_CONFIG_HOME pinned to the managed component dir (see
/// spawn_sidecar's EXA_ENGINE_CONFIG_DIR), so the file lives at
/// `<data>/components/exa-agent/config/exa/exa.json` — NOT ~/.config/exa.
fn engine_config_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    let state = app.state::<AppState>();
    let dir = crate::components_update::component_dir(&state.data_dir, crate::components_update::ComponentId::ExaAgent)
        .join("config")
        .join("exa");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("exa.json"))
}

/// Tool groups → the engine tool names their permission entries gate. The
/// seeded config denies all of these; grants must flip BOTH options.tools
/// (the prompt/permission suffix path) AND the permission map (which wins the
/// engine's Permission.merge).
const TOOL_PERMS: [(&str, &[&str]); 4] = [
    ("files", &["read", "edit"]),
    ("shell", &["bash"]),
    ("search", &["grep", "glob", "list"]),
    ("tasks", &["todowrite", "todoread", "task"]),
];

/// Open the engine's exa.json, hand `f` the whole ROOT object, write back.
/// Every key not touched by `f` is preserved.
fn with_engine_config(
    app: &AppHandle,
    f: impl FnOnce(&mut serde_json::Map<String, serde_json::Value>),
) -> AppResult<serde_json::Value> {
    let path = engine_config_path(app)?;
    let mut root: serde_json::Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if !root.is_object() {
        root = serde_json::json!({});
    }
    f(root.as_object_mut().unwrap());
    std::fs::write(&path, serde_json::to_string_pretty(&root).unwrap_or_default())?;
    Ok(root)
}

/// The `agent.exa` object inside the root, created as needed.
fn exa_agent_obj<'a>(
    root: &'a mut serde_json::Map<String, serde_json::Value>,
) -> &'a mut serde_json::Map<String, serde_json::Value> {
    root.entry("agent")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .expect("agent object")
        .entry("exa")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .expect("agent.exa object")
}

/// Apply the granted tool GROUPS to agent.exa: options.tools (what the engine
/// surfaces in the prompt) and the permission entries (what actually gates the
/// tools — the seeded permission map denies them all by default).
fn apply_tool_groups(exa: &mut serde_json::Map<String, serde_json::Value>, groups: &[String]) {
    let options = exa
        .entry("options")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .expect("options object");
    options.insert("tools".into(), serde_json::json!(groups));
    let perm = exa
        .entry("permission")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .expect("permission object");
    for (group, tools) in TOOL_PERMS {
        let on = groups.iter().any(|g| g == group);
        for t in tools {
            perm.insert((*t).into(), serde_json::json!(if on { "allow" } else { "deny" }));
        }
    }
}

fn current_tools(exa: &serde_json::Map<String, serde_json::Value>) -> Vec<String> {
    exa.get("options")
        .and_then(|o| o.get("tools"))
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|t| t.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

/// Persist the shield's SQL operation grants where the ENGINE enforces them
/// (agent.exa.options.sqlOps — the store `exa ops grant` writes, read live by
/// the database tool). The "shell" tool group is managed alongside: present
/// while any write class is granted (so exapump can load data files), removed
/// when the shield goes read-only — terminal data loads follow the shield too.
#[tauri::command]
pub fn engine_ops_sync(app: AppHandle, sql_ops: Vec<String>) -> AppResult<()> {
    const CLASSES: [&str; 8] = [
        "insert", "update", "delete", "create", "alter", "drop", "dcl", "admin",
    ];
    let ops: Vec<String> = sql_ops
        .into_iter()
        .filter(|o| CLASSES.contains(&o.as_str()))
        .collect();
    let writes_granted = !ops.is_empty();
    with_engine_config(&app, |root| {
        let exa = exa_agent_obj(root);
        let mut tools = current_tools(exa);
        let has_shell = tools.iter().any(|t| t == "shell");
        if writes_granted && !has_shell {
            tools.push("shell".into());
        } else if !writes_granted && has_shell {
            tools.retain(|t| t != "shell");
        }
        apply_tool_groups(exa, &tools);
        let options = exa.get_mut("options").and_then(|o| o.as_object_mut()).expect("options");
        options.insert("sqlOps".into(), serde_json::json!(ops));
    })?;
    Ok(())
}

/// The engine agent's current grants + configured plugins — the Settings
/// "Tools & Plugins" page reads its truth from here. Seeds the "tasks" group
/// ON when no tool preference exists yet (multi-step planning should be a
/// default, not a discovery).
#[tauri::command]
pub fn engine_options_get(app: AppHandle) -> AppResult<serde_json::Value> {
    let mut seeded = false;
    let root = with_engine_config(&app, |root| {
        let exa = exa_agent_obj(root);
        let missing = exa
            .get("options")
            .and_then(|o| o.get("tools"))
            .is_none();
        if missing {
            seeded = true;
            apply_tool_groups(exa, &["tasks".to_string()]);
        }
    })?;
    let exa = root
        .get("agent")
        .and_then(|a| a.get("exa"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let options = exa.get("options").cloned().unwrap_or_else(|| serde_json::json!({}));
    Ok(serde_json::json!({
        "sqlOps": options.get("sqlOps").cloned().unwrap_or_else(|| serde_json::json!([])),
        "tools": options.get("tools").cloned().unwrap_or_else(|| serde_json::json!([])),
        "plugins": root.get("plugin").cloned().unwrap_or_else(|| serde_json::json!([])),
        "seeded": seeded,
    }))
}

/// Replace the engine agent's tool-group grants (Settings → Tools & Plugins).
#[tauri::command]
pub fn engine_tools_sync(app: AppHandle, tools: Vec<String>) -> AppResult<()> {
    let list: Vec<String> = tools
        .into_iter()
        .filter(|t| TOOL_PERMS.iter().any(|(g, _)| g == t))
        .collect();
    with_engine_config(&app, |root| apply_tool_groups(exa_agent_obj(root), &list))?;
    Ok(())
}
