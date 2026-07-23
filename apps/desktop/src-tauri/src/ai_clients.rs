//! Connect external AI clients (Claude Desktop, Claude Code, Cursor, …) to the
//! bundled read-only Exasol MCP server — the Studio equivalent of the starter
//! kit's `exakit mcp-setup`. Each client's own config file gets an `exasol`
//! MCP entry pointing at the managed `exasol-mcp-server` with the dedicated
//! STUDIO_MCP_* read-only identity (the DB enforces read-only, not trust).
//!
//! This is deliberately separate from the in-app agent's connector registry
//! (agent-core `mcp-servers.json`): connectors bring external tools INTO the
//! Studio agent; this module takes the Exasol database OUT to other AI clients.

use crate::error::{AppError, AppResult};
use crate::profiles;
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

/// The managed MCP server launch spec: binary + env, from the Studio-managed
/// read-only identity. Errors when local Exasol / the MCP package isn't set up.
struct McpLaunch {
    command: String,
    env: Vec<(String, String)>,
}

fn mcp_launch(app: &AppHandle) -> AppResult<McpLaunch> {
    let state = app.state::<AppState>();
    let data_dir = state.data_dir.clone();
    let bin = if cfg!(windows) {
        data_dir.join("personal-local/python/Scripts/exasol-mcp-server.exe")
    } else {
        data_dir.join("personal-local/python/bin/exasol-mcp-server")
    };
    if !bin.is_file() {
        return Err(AppError::Storage(
            "The bundled Exasol MCP server is not installed yet — set up the local database (Marketplace → Exasol Personal) first.".into(),
        ));
    }
    let marker = data_dir.join("agent/mcp-identity.json");
    let raw = fs::read_to_string(&marker).map_err(|_| {
        AppError::Storage(
            "No managed MCP identity found — set up the local database first (it provisions the read-only MCP user).".into(),
        )
    })?;
    let identity: Value = serde_json::from_str(&raw)
        .map_err(|e| AppError::Storage(format!("The MCP identity marker is unreadable: {e}")))?;
    let profile_id = identity
        .get("profileId")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Storage("The MCP identity marker is missing its profile reference.".into()))?;
    let username = identity
        .get("username")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if !username.starts_with("STUDIO_MCP_") {
        return Err(AppError::Storage(
            "The managed MCP identity is not the dedicated read-only user; refusing to export it.".into(),
        ));
    }
    let profile = profiles::find_profile(&state, profile_id)?;
    Ok(McpLaunch {
        command: bin.to_string_lossy().to_string(),
        env: vec![
            ("EXA_DSN".into(), format!("{}:{}", profile.host, profile.port)),
            ("EXA_USER".into(), username),
            ("EXA_PASSWORD".into(), profile.password),
            ("EXA_SSL_CERT_VALIDATION".into(), "no".into()),
        ],
    })
}

fn entry_json(launch: &McpLaunch) -> Value {
    let env: serde_json::Map<String, Value> = launch
        .env
        .iter()
        .map(|(k, v)| (k.clone(), Value::String(v.clone())))
        .collect();
    json!({ "command": launch.command, "args": [], "env": env })
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
        .map(|m| m.contains_key("exasol"))
        .unwrap_or(false)
}

fn status_for(def: &ClientDef, home: &PathBuf) -> AiClientStatus {
    let config = home.join(def.config_rel);
    let detected = config.exists() || def.probe_rel.iter().any(|p| home.join(p).exists());
    let connected = if def.auto {
        read_config(&config).map(|c| has_exasol_entry(&c, def.servers_key)).unwrap_or(false)
    } else {
        // Best-effort for non-JSON configs: substring probe.
        fs::read_to_string(&config).map(|raw| raw.contains("exasol")).unwrap_or(false)
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

/// Prerequisite probe for the AI-clients tab: is the bundled MCP server +
/// managed read-only identity in place? (Cheap file checks only — no vault
/// access, so it works even while the vault is locked.)
#[tauri::command]
pub fn ai_clients_ready(app: AppHandle) -> AppResult<AiClientsReady> {
    let data_dir = app.state::<AppState>().data_dir.clone();
    let bin = if cfg!(windows) {
        data_dir.join("personal-local/python/Scripts/exasol-mcp-server.exe")
    } else {
        data_dir.join("personal-local/python/bin/exasol-mcp-server")
    };
    if !bin.is_file() {
        return Ok(AiClientsReady {
            ready: false,
            reason: Some("The bundled Exasol MCP server is not installed yet. Set up the local database (Marketplace → Databases → Exasol Personal) — it installs the MCP server and its read-only identity.".into()),
        });
    }
    if !data_dir.join("agent/mcp-identity.json").is_file() {
        return Ok(AiClientsReady {
            ready: false,
            reason: Some("The read-only MCP identity has not been provisioned yet. Finish the local database setup, then come back here.".into()),
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
    servers
        .as_object_mut()
        .unwrap()
        .insert("exasol".into(), entry_json(&launch));
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
        if servers.remove("exasol").is_some() {
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
            Ok(format!(
                "# ~/.codex/config.toml\n[mcp_servers.exasol]\ncommand = \"{}\"\nargs = []\nenv = {{ {} }}\n",
                launch.command, env_lines
            ))
        }
        "opencode" => {
            let env: serde_json::Map<String, Value> = launch
                .env
                .iter()
                .map(|(k, v)| (k.clone(), Value::String(v.clone())))
                .collect();
            let entry = json!({ "mcp": { "exasol": { "type": "local", "command": [launch.command], "environment": env } } });
            Ok(format!(
                "// merge into ~/.config/opencode/opencode.json\n{}",
                serde_json::to_string_pretty(&entry).unwrap_or_default()
            ))
        }
        _ => Ok(serde_json::to_string_pretty(&json!({ "mcpServers": { "exasol": entry_json(&launch) } }))
            .unwrap_or_default()),
    }
}
