//! Connect external AI clients (Claude Desktop, Claude Code, Cursor, …) to the
//! Exasol Studio MCP GATEWAY — one `exasol-studio` MCP entry that speaks for
//! EVERY database currently connected in Studio (nano, Personal, remote, …),
//! not a per-database MCP config. Each client's config gets an entry that
//! launches the bundled stdio bridge (mcp-gateway.cjs); the bridge proxies
//! tool calls to the running agent sidecar, which holds the live pools and
//! enforces read-only (single SELECT/WITH/DESCRIBE statements) on the route.
//!
//! This is deliberately separate from the in-app agent's connector registry
//! (agent-core `mcp-servers.json`): connectors bring external tools INTO the
//! Studio agent; this module takes the Exasol database OUT to other AI clients.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiClientStatus {
    pub id: String,
    pub name: String,
    /// The client appears to be installed on this machine.
    pub detected: bool,
    /// Its config already carries the `exasol` MCP entry.
    pub connected: bool,
    pub config_path: String,
    /// True when Studio can write the config itself (JSON). False = show a
    /// copyable snippet instead (TOML/YAML configs are not rewritten).
    pub auto: bool,
}

struct ClientDef {
    id: &'static str,
    name: &'static str,
    /// Relative to $HOME.
    config_rel: &'static str,
    /// Extra $HOME-relative dirs whose presence means "installed".
    probe_rel: &'static [&'static str],
    /// Top-level key holding MCP servers in the config JSON.
    servers_key: &'static str,
    auto: bool,
}

const CLIENTS: &[ClientDef] = &[
    ClientDef {
        id: "claude-desktop",
        name: "Claude Desktop",
        config_rel: "Library/Application Support/Claude/claude_desktop_config.json",
        probe_rel: &["Library/Application Support/Claude"],
        servers_key: "mcpServers",
        auto: true,
    },
    ClientDef {
        id: "claude-code",
        name: "Claude Code",
        config_rel: ".claude.json",
        probe_rel: &[".claude"],
        servers_key: "mcpServers",
        auto: true,
    },
    ClientDef {
        id: "cursor",
        name: "Cursor",
        config_rel: ".cursor/mcp.json",
        probe_rel: &[".cursor"],
        servers_key: "mcpServers",
        auto: true,
    },
    ClientDef {
        id: "vscode-copilot",
        name: "VS Code (Copilot)",
        config_rel: "Library/Application Support/Code/User/mcp.json",
        probe_rel: &["Library/Application Support/Code/User"],
        servers_key: "servers",
        auto: true,
    },
    ClientDef {
        id: "gemini-cli",
        name: "Gemini CLI",
        config_rel: ".gemini/settings.json",
        probe_rel: &[".gemini"],
        servers_key: "mcpServers",
        auto: true,
    },
    ClientDef {
        id: "codex",
        name: "Codex CLI",
        config_rel: ".codex/config.toml",
        probe_rel: &[".codex"],
        servers_key: "mcp_servers",
        auto: false, // TOML — copyable snippet, we never rewrite TOML blindly.
    },
    ClientDef {
        id: "opencode",
        name: "OpenCode",
        config_rel: ".config/opencode/opencode.json",
        probe_rel: &[".config/opencode"],
        servers_key: "mcp",
        auto: false, // different entry shape — snippet only.
    },
];

fn home() -> AppResult<PathBuf> {
    dirs::home_dir().ok_or_else(|| AppError::Storage("Could not resolve the home directory.".into()))
}

/// The gateway launch spec: Node + the bundled stdio bridge. Holds NO
/// credentials — the bridge discovers the running sidecar via gateway.json
/// and every database it exposes lives only in the sidecar's memory.
struct McpLaunch {
    command: String,
    args: Vec<String>,
    env: Vec<(String, String)>,
}

/// Locate the bundled mcp-gateway.cjs: release resource first, then the
/// workspace path for `tauri dev` / local builds.
fn gateway_script(app: &AppHandle) -> AppResult<PathBuf> {
    if let Ok(p) = app.path().resolve("mcp-gateway.cjs", tauri::path::BaseDirectory::Resource) {
        if p.exists() {
            return Ok(p);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/agent-core/dist/mcp-gateway.cjs");
    if dev.exists() {
        return Ok(dev.canonicalize().unwrap_or(dev));
    }
    Err(AppError::Storage(
        "mcp-gateway.cjs not found — run `pnpm -F @exasol-studio/agent-core build`.".into(),
    ))
}

fn mcp_launch(app: &AppHandle) -> AppResult<McpLaunch> {
    let node = crate::agent::node_binary(app).ok_or_else(|| {
        AppError::Storage("Node.js is required for the Studio MCP gateway but was not found.".into())
    })?;
    let script = gateway_script(app)?;
    let agent_dir = app.state::<AppState>().data_dir.join("agent");
    Ok(McpLaunch {
        command: node.to_string_lossy().to_string(),
        args: vec![script.to_string_lossy().to_string()],
        env: vec![(
            "EXASOL_STUDIO_AGENT_DIR".into(),
            agent_dir.to_string_lossy().to_string(),
        )],
    })
}

/// The MCP entry name written into client configs. Deliberately NOT "exasol":
/// this entry speaks for ALL connected databases through the Studio gateway.
const ENTRY: &str = "exasol-studio";
/// The old per-database entry name — replaced on connect, removed on disconnect.
const LEGACY_ENTRY: &str = "exasol";

fn entry_json(launch: &McpLaunch) -> Value {
    let env: serde_json::Map<String, Value> = launch
        .env
        .iter()
        .map(|(k, v)| (k.clone(), Value::String(v.clone())))
        .collect();
    json!({ "command": launch.command, "args": launch.args, "env": env })
}

fn read_config(path: &PathBuf) -> AppResult<Value> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let raw = fs::read_to_string(path)
        .map_err(|e| AppError::Storage(format!("Could not read {}: {e}", path.display())))?;
    if raw.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&raw)
        .map_err(|e| AppError::Storage(format!("{} is not valid JSON: {e}", path.display())))
}

fn has_exasol_entry(cfg: &Value, key: &str) -> bool {
    cfg.get(key)
        .and_then(|s| s.as_object())
        .map(|m| m.contains_key(ENTRY))
        .unwrap_or(false)
}

fn status_for(def: &ClientDef, home: &PathBuf) -> AiClientStatus {
    let config = home.join(def.config_rel);
    let detected = config.exists() || def.probe_rel.iter().any(|p| home.join(p).exists());
    let connected = if def.auto {
        read_config(&config).map(|c| has_exasol_entry(&c, def.servers_key)).unwrap_or(false)
    } else {
        // Best-effort for non-JSON configs: substring probe.
        fs::read_to_string(&config).map(|raw| raw.contains(ENTRY)).unwrap_or(false)
    };
    AiClientStatus {
        id: def.id.into(),
        name: def.name.into(),
        detected,
        connected,
        config_path: config.to_string_lossy().to_string(),
        auto: def.auto,
    }
}

#[tauri::command]
pub fn list_ai_clients() -> AppResult<Vec<AiClientStatus>> {
    let home = home()?;
    Ok(CLIENTS.iter().map(|d| status_for(d, &home)).collect())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiClientsReady {
    pub ready: bool,
    pub reason: Option<String>,
}

/// Prerequisite probe for the AI-clients tab: can the gateway be exported?
/// Needs only the bundled bridge script + a Node runtime — no local-database
/// setup, since the gateway speaks for whatever databases are connected.
#[tauri::command]
pub fn ai_clients_ready(app: AppHandle) -> AppResult<AiClientsReady> {
    if gateway_script(&app).is_err() {
        return Ok(AiClientsReady {
            ready: false,
            reason: Some("The Studio MCP gateway is missing from this build (mcp-gateway.cjs). Reinstall or rebuild Exasol Studio.".into()),
        });
    }
    if crate::agent::node_binary(&app).is_none() {
        return Ok(AiClientsReady {
            ready: false,
            reason: Some("Node.js was not found. It powers the Studio MCP gateway — install it from nodejs.org or via Homebrew.".into()),
        });
    }
    Ok(AiClientsReady { ready: true, reason: None })
}

#[tauri::command]
pub fn connect_ai_client(app: AppHandle, client_id: String) -> AppResult<AiClientStatus> {
    let home = home()?;
    let def = CLIENTS
        .iter()
        .find(|d| d.id == client_id)
        .ok_or_else(|| AppError::Storage(format!("Unknown AI client: {client_id}")))?;
    if !def.auto {
        return Err(AppError::Storage(format!(
            "{} uses a non-JSON config — use the copyable snippet instead.",
            def.name
        )));
    }
    let launch = mcp_launch(&app)?;
    let path = home.join(def.config_rel);
    let mut cfg = read_config(&path)?;
    if !cfg.is_object() {
        return Err(AppError::Storage(format!("{} has an unexpected top-level shape.", path.display())));
    }
    // One-time backup before the first edit we ever make to this file.
    if path.exists() {
        let backup = path.with_extension("json.exasol-backup");
        if !backup.exists() {
            let _ = fs::copy(&path, &backup);
        }
    } else if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::Storage(format!("Could not create {}: {e}", parent.display())))?;
    }
    let obj = cfg.as_object_mut().unwrap();
    let servers = obj
        .entry(def.servers_key.to_string())
        .or_insert_with(|| json!({}));
    if !servers.is_object() {
        return Err(AppError::Storage(format!(
            "\"{}\" in {} is not an object; not touching it.",
            def.servers_key,
            path.display()
        )));
    }
    let map = servers.as_object_mut().unwrap();
    // Replace the old per-database entry with the all-databases gateway.
    map.remove(LEGACY_ENTRY);
    map.insert(ENTRY.into(), entry_json(&launch));
    fs::write(&path, serde_json::to_string_pretty(&cfg).unwrap_or_default())
        .map_err(|e| AppError::Storage(format!("Could not write {}: {e}", path.display())))?;
    Ok(status_for(def, &home))
}

#[tauri::command]
pub fn disconnect_ai_client(client_id: String) -> AppResult<AiClientStatus> {
    let home = home()?;
    let def = CLIENTS
        .iter()
        .find(|d| d.id == client_id)
        .ok_or_else(|| AppError::Storage(format!("Unknown AI client: {client_id}")))?;
    if !def.auto {
        return Err(AppError::Storage(format!(
            "{} uses a non-JSON config — remove the exasol entry manually.",
            def.name
        )));
    }
    let path = home.join(def.config_rel);
    let mut cfg = read_config(&path)?;
    if let Some(servers) = cfg.get_mut(def.servers_key).and_then(|s| s.as_object_mut()) {
        let removed = servers.remove(ENTRY).is_some() | servers.remove(LEGACY_ENTRY).is_some();
        if removed {
            fs::write(&path, serde_json::to_string_pretty(&cfg).unwrap_or_default())
                .map_err(|e| AppError::Storage(format!("Could not write {}: {e}", path.display())))?;
        }
    }
    Ok(status_for(def, &home))
}

/// Copyable config snippet for clients we don't auto-edit (Codex TOML, OpenCode).
#[tauri::command]
pub fn ai_client_snippet(app: AppHandle, client_id: String) -> AppResult<String> {
    let launch = mcp_launch(&app)?;
    match client_id.as_str() {
        "codex" => {
            let env_lines = launch
                .env
                .iter()
                .map(|(k, v)| format!("{k} = \"{}\"", v.replace('"', "\\\"")))
                .collect::<Vec<_>>()
                .join(", ");
            let args = launch
                .args
                .iter()
                .map(|a| format!("\"{}\"", a.replace('"', "\\\"")))
                .collect::<Vec<_>>()
                .join(", ");
            Ok(format!(
                "# ~/.codex/config.toml\n[mcp_servers.exasol-studio]\ncommand = \"{}\"\nargs = [{}]\nenv = {{ {} }}\n",
                launch.command, args, env_lines
            ))
        }
        "opencode" => {
            let env: serde_json::Map<String, Value> = launch
                .env
                .iter()
                .map(|(k, v)| (k.clone(), Value::String(v.clone())))
                .collect();
            let mut cmd = vec![launch.command.clone()];
            cmd.extend(launch.args.iter().cloned());
            let entry = json!({ "mcp": { "exasol-studio": { "type": "local", "command": cmd, "environment": env } } });
            Ok(format!(
                "// merge into ~/.config/opencode/opencode.json\n{}",
                serde_json::to_string_pretty(&entry).unwrap_or_default()
            ))
        }
        _ => Ok(serde_json::to_string_pretty(&json!({ "mcpServers": { ENTRY: entry_json(&launch) } }))
            .unwrap_or_default()),
    }
}
