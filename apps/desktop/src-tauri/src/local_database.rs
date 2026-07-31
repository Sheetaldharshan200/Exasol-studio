//! Background first-install setup for the Studio-owned local data/AI stack.

use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{AppError, AppResult};
use crate::local_runtime::RuntimeConnection;
use crate::market::{emit_log, ensure_uv, run_streamed, run_streamed_env};
use crate::profiles;
use crate::state::AppState;

const JOB_ID: &str = "personal-local-bootstrap";

#[derive(Default)]
pub struct LocalBootstrap {
    running: AtomicBool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityState {
    pub state: String,
    pub version: Option<String>,
    pub error: Option<String>,
    pub connection_id: Option<String>,
}

impl CapabilityState {
    fn waiting(version: &str) -> Self {
        Self {
            state: "waiting".into(),
            version: Some(version.into()),
            error: None,
            connection_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapStatus {
    pub state: String,
    pub step: String,
    pub message: String,
    pub local_ready: bool,
    pub profile_id: Option<String>,
    pub components: BTreeMap<String, CapabilityState>,
    pub semantic_views: CapabilityState,
    pub updated_at: String,
}

impl Default for BootstrapStatus {
    fn default() -> Self {
        let lock = crate::component_lock::components();
        let mut components = BTreeMap::new();
        components.insert(
            "pyexasol".into(),
            CapabilityState::waiting(&lock.python_stack.pyexasol_version),
        );
        components.insert(
            "mcp-server".into(),
            CapabilityState::waiting(&lock.python_stack.mcp_server_version),
        );
        components.insert(
            "exapump".into(),
            CapabilityState::waiting(&lock.exapump.version),
        );
        components.insert(
            "agent-skills".into(),
            CapabilityState::waiting(&lock.agent_skills.revision),
        );
        components.insert(
            "fable-method".into(),
            CapabilityState::waiting(&lock.fable_method.revision),
        );
        Self {
            state: "idle".into(),
            step: "waiting".into(),
            message: "First-install setup has not started.".into(),
            local_ready: false,
            profile_id: None,
            components,
            semantic_views: CapabilityState {
                state: "unavailable".into(),
                version: None,
                error: None,
                connection_id: None,
            },
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

fn status_path(data_dir: &Path) -> PathBuf {
    data_dir.join("personal-local/bootstrap.json")
}

fn capabilities_path(data_dir: &Path) -> PathBuf {
    data_dir.join("agent/capabilities.json")
}

fn read_status(data_dir: &Path) -> BootstrapStatus {
    std::fs::read_to_string(status_path(data_dir))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_status(app: &AppHandle, data_dir: &Path, mut status: BootstrapStatus) -> AppResult<()> {
    status.updated_at = chrono::Utc::now().to_rfc3339();
    let status_file = status_path(data_dir);
    let capability_file = capabilities_path(data_dir);
    if let Some(parent) = status_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if let Some(parent) = capability_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&status_file, serde_json::to_vec_pretty(&status)?)?;
    std::fs::write(
        capability_file,
        serde_json::to_vec_pretty(&json!({
            "localReady": status.local_ready,
            "components": status.components,
            "semanticViews": status.semantic_views,
        }))?,
    )?;
    let _ = app.emit("personal-local:status", &status);
    Ok(())
}

fn set_component(
    status: &mut BootstrapStatus,
    name: &str,
    state: &str,
    version: &str,
    error: Option<String>,
) {
    status.components.insert(
        name.into(),
        CapabilityState {
            state: state.into(),
            version: Some(version.into()),
            error,
            connection_id: None,
        },
    );
}

fn venv_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("personal-local/python")
}

fn venv_python(data_dir: &Path) -> PathBuf {
    if cfg!(windows) {
        venv_dir(data_dir).join("Scripts/python.exe")
    } else {
        venv_dir(data_dir).join("bin/python")
    }
}

fn venv_mcp_server(data_dir: &Path) -> PathBuf {
    if cfg!(windows) {
        venv_dir(data_dir).join("Scripts/exasol-mcp-server.exe")
    } else {
        venv_dir(data_dir).join("bin/exasol-mcp-server")
    }
}

/// The `exasol-mcp-server` executable inside a given venv root.
fn mcp_server_bin(env: &Path) -> PathBuf {
    if cfg!(windows) {
        env.join("Scripts/exasol-mcp-server.exe")
    } else {
        env.join("bin/exasol-mcp-server")
    }
}

/// Which MCP-server binary to run: the component's OWN isolated env when the
/// user has independently installed/updated it there, otherwise the shared
/// verified stack. This is what lets the MCP server be updated on its own
/// without a Studio release — see components_update.rs.
///
/// The own env is used only when its install MANIFEST is present AND the binary
/// exists — a half-built/corrupt env (binary without a manifest, written last on
/// success) must never shadow the verified fallback and break MCP startup.
fn mcp_server_command(data_dir: &Path) -> PathBuf {
    let id = crate::components_update::ComponentId::McpServer;
    let own = mcp_server_bin(&crate::components_update::component_env(data_dir, id));
    if crate::components_update::read_manifest(data_dir, id).is_some() && own.is_file() {
        own
    } else {
        venv_mcp_server(data_dir)
    }
}

fn runtime_env(runtime: &RuntimeConnection) -> [(String, String); 4] {
    [
        (
            "EXA_DSN".into(),
            format!("{}:{}", runtime.host, runtime.port),
        ),
        ("EXA_USER".into(), runtime.user.clone()),
        ("EXA_PASSWORD".into(), runtime.password.clone()),
        ("EXA_SSL_CERT_VALIDATION".into(), "no".into()),
    ]
}

fn validate_pyexasol_connection(
    app: &AppHandle,
    python: &Path,
    runtime: &RuntimeConnection,
) -> AppResult<()> {
    const SCRIPT: &str = r#"import os, ssl, time, pyexasol
deadline = time.monotonic() + 60
last_error = None
while time.monotonic() < deadline:
    connection = None
    try:
        connection = pyexasol.connect(
            dsn=os.environ["EXA_DSN"],
            user=os.environ["EXA_USER"],
            password=os.environ["EXA_PASSWORD"],
            encryption=True,
            websocket_sslopt={"cert_reqs": ssl.CERT_NONE},
        )
        connection.execute("SELECT 1")
        print("Authenticated PyExasol connection verified")
        raise SystemExit(0)
    except Exception as error:
        last_error = error
        time.sleep(5)
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass
raise RuntimeError(f"Exasol did not accept an authenticated query before the readiness deadline: {last_error}")
"#;
    let owned = runtime_env(runtime);
    let envs: Vec<(&str, &str)> = owned
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    let python_s = python.to_string_lossy().to_string();
    if run_streamed_env(app, JOB_ID, &python_s, &["-c", SCRIPT], &envs)? != 0 {
        return Err(AppError::Storage(
            "The managed runtime opened its port but did not become query-ready with its generated database credential."
                .into(),
        ));
    }
    Ok(())
}

/// One quick authentication attempt (no retry loop) — used to distinguish
/// "wrong credential" from "database not up yet" during recovery.
fn probe_credentials(app: &AppHandle, python: &Path, runtime: &RuntimeConnection) -> bool {
    const SCRIPT: &str = r#"import os, ssl, pyexasol
connection = pyexasol.connect(
    dsn=os.environ["EXA_DSN"],
    user=os.environ["EXA_USER"],
    password=os.environ["EXA_PASSWORD"],
    encryption=True,
    websocket_sslopt={"cert_reqs": ssl.CERT_NONE},
)
connection.execute("SELECT 1")
connection.close()
"#;
    let owned = runtime_env(runtime);
    let envs: Vec<(&str, &str)> = owned
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    let python_s = python.to_string_lossy().to_string();
    run_streamed_env(app, JOB_ID, &python_s, &["-c", SCRIPT], &envs).is_ok_and(|code| code == 0)
}

/// Recovery ladder for a personal database whose stored credential no longer
/// works — typically the SYS password was changed outside Studio (SQL client,
/// `exasol` CLI, exapump). Order: the session master password, then a clear,
/// actionable error. Success re-aligns secrets.json and the vault profile.
fn recover_personal_auth(
    app: &AppHandle,
    python: &Path,
    runtime: &RuntimeConnection,
) -> AppResult<RuntimeConnection> {
    let master = app.state::<AppState>().master_secret.read().unwrap().clone();
    if let Some(master) = master {
        if master != runtime.password {
            let mut candidate = runtime.clone();
            candidate.password = master.clone();
            if probe_credentials(app, python, &candidate) {
                emit_log(
                    app,
                    JOB_ID,
                    "The stored credential was stale, but your master password works — re-aligning Studio's records.",
                    "info",
                );
                crate::local_runtime::persist_personal_password(app, &master)?;
                profiles::ensure_personal_local_profile(
                    &app.state::<AppState>(),
                    &candidate.host,
                    candidate.port,
                    &candidate.user,
                    &master,
                )?;
                return Ok(candidate);
            }
        }
    }
    Err(AppError::Storage(
        "The local database rejected Studio's stored SYS credential — it was probably changed outside Studio (SQL client or CLI). Fix: unlock the vault so Studio can try your master password, or run `ALTER USER SYS IDENTIFIED BY \"<your master password>\"` with the current credential, then retry setup."
            .into(),
    ))
}

fn query_ready_runtime(
    app: &AppHandle,
    python: &Path,
    runtime: &RuntimeConnection,
) -> AppResult<RuntimeConnection> {
    match validate_pyexasol_connection(app, python, runtime) {
        Ok(()) => Ok(runtime.clone()),
        Err(first_error) if runtime.kind == "personal" => {
            emit_log(
                app,
                JOB_ID,
                format!("Initial authenticated readiness probe failed: {first_error}"),
                "info",
            );
            // The DB is up (the port opened) but auth failed → credential
            // drift, not a boot problem. Try the recovery ladder before the
            // heavier restart path.
            if crate::local_runtime::personal_db_running(app) {
                if let Ok(recovered) = recover_personal_auth(app, python, runtime) {
                    return Ok(recovered);
                }
            }
            let recovered = crate::local_runtime::restart_personal_runtime(app, JOB_ID)?;
            match validate_pyexasol_connection(app, python, &recovered) {
                Ok(()) => Ok(recovered),
                Err(_) => recover_personal_auth(app, python, &recovered),
            }
        }
        Err(error) => Err(error),
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpIdentity {
    version: u8,
    profile_id: String,
    username: String,
}

fn load_or_create_mcp_identity(
    app: &AppHandle,
    administrator: &RuntimeConnection,
) -> AppResult<(McpIdentity, profiles::ConnectionProfile)> {
    const NOTE: &str = "Studio-managed identity for the bundled Exasol MCP server.";
    let marker = app
        .state::<AppState>()
        .data_dir
        .join("agent/mcp-identity.json");
    let persist_marker = |identity: &McpIdentity| -> AppResult<()> {
        if let Some(parent) = marker.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let partial = marker.with_extension("partial");
        std::fs::write(&partial, serde_json::to_vec_pretty(identity)?)?;
        std::fs::rename(partial, &marker)?;
        Ok(())
    };
    if let Ok(raw) = std::fs::read_to_string(&marker) {
        let identity: McpIdentity = serde_json::from_str(&raw)?;
        if identity.version != 1 || !identity.username.starts_with("STUDIO_MCP_") {
            return Err(AppError::Storage(
                "The managed MCP identity marker is invalid; refusing to alter a database user."
                    .into(),
            ));
        }
        match profiles::find_profile(&app.state::<AppState>(), &identity.profile_id) {
            Ok(profile) => {
                if profile.username != identity.username
                    || profile.host != administrator.host
                    || profile.port != administrator.port
                    || profile.notes.as_deref() != Some(NOTE)
                {
                    return Err(AppError::Storage(
                        "The managed MCP profile does not match its ownership marker; refusing to reconcile credentials."
                            .into(),
                    ));
                }
                return Ok((identity, profile));
            }
            Err(AppError::InvalidSettings(_)) => {
                // The vault profile the marker points at was deleted (e.g. the
                // user cleared their saved connections). The database user may
                // still exist; keep its username, mint a fresh credential, and
                // let provisioning ALTER the password idempotently. Setup must
                // recover here, not fail forever on a dangling marker.
                let password = format!(
                    "StudioMcp{}",
                    rand::thread_rng()
                        .sample_iter(&Alphanumeric)
                        .take(24)
                        .map(char::from)
                        .collect::<String>()
                );
                let saved = profiles::save_profile(
                    &app.state::<AppState>(),
                    profiles::ConnectionProfile {
                        id: String::new(),
                        name: "Local Exasol (AI read-only)".into(),
                        host: administrator.host.clone(),
                        port: administrator.port,
                        username: identity.username.clone(),
                        password,
                        schema: None,
                        notes: Some(NOTE.into()),
                        ssl_mode: "preferred".into(),
                        compression: false,
                        driver_id: "sqlx-exasol".into(),
                        created_at: None,
                        last_used_at: None,
                    },
                )?;
                let identity = McpIdentity {
                    version: 1,
                    profile_id: saved.id.clone(),
                    username: identity.username,
                };
                persist_marker(&identity)?;
                let profile = profiles::find_profile(&app.state::<AppState>(), &saved.id)?;
                return Ok((identity, profile));
            }
            Err(other) => return Err(other),
        }
    }

    // Recover the exact vault profile if a previous run persisted it but was
    // interrupted before the non-secret ownership marker was renamed.
    let candidates: Vec<_> = profiles::load_profiles(&app.state::<AppState>())?
        .into_iter()
        .filter(|profile| {
            profile.username.starts_with("STUDIO_MCP_")
                && profile.host == administrator.host
                && profile.port == administrator.port
                && profile.notes.as_deref() == Some(NOTE)
        })
        .collect();
    if candidates.len() > 1 {
        return Err(AppError::Storage(
            "Multiple Studio-managed MCP profiles exist without an ownership marker; refusing to guess."
                .into(),
        ));
    }
    if let Some(candidate) = candidates.first() {
        let identity = McpIdentity {
            version: 1,
            profile_id: candidate.id.clone(),
            username: candidate.username.clone(),
        };
        persist_marker(&identity)?;
        let profile = profiles::find_profile(&app.state::<AppState>(), &candidate.id)?;
        return Ok((identity, profile));
    }

    let username = format!(
        "STUDIO_MCP_{}",
        rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(12)
            .map(char::from)
            .collect::<String>()
            .to_ascii_uppercase()
    );
    let password = format!(
        "StudioMcp{}",
        rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(24)
            .map(char::from)
            .collect::<String>()
    );
    // Persist through the vault before touching the database. A failed database
    // step can then retry with the same credential instead of rotating it.
    let saved = profiles::save_profile(
        &app.state::<AppState>(),
        profiles::ConnectionProfile {
            id: String::new(),
            name: "Local Exasol (AI read-only)".into(),
            host: administrator.host.clone(),
            port: administrator.port,
            username: username.clone(),
            password,
            schema: None,
            notes: Some(NOTE.into()),
            ssl_mode: "preferred".into(),
            compression: false,
            driver_id: "sqlx-exasol".into(),
            created_at: None,
            last_used_at: None,
        },
    )?;
    let identity = McpIdentity {
        version: 1,
        profile_id: saved.id.clone(),
        username,
    };
    persist_marker(&identity)?;
    let profile = profiles::find_profile(&app.state::<AppState>(), &saved.id)?;
    Ok((identity, profile))
}

fn provision_mcp_identity(
    app: &AppHandle,
    python: &Path,
    administrator: &RuntimeConnection,
) -> AppResult<(RuntimeConnection, profiles::ConnectionProfile)> {
    const SCRIPT: &str = r#"import os, ssl, pyexasol
connection = pyexasol.connect(
    dsn=os.environ["EXA_DSN"],
    user=os.environ["EXA_USER"],
    password=os.environ["EXA_PASSWORD"],
    encryption=True,
    websocket_sslopt={"cert_reqs": ssl.CERT_NONE},
)
username = os.environ["STUDIO_MCP_USER"]
password = os.environ["STUDIO_MCP_PASSWORD"]
if not username.startswith("STUDIO_MCP_") or not username.replace("_", "").isalnum():
    raise RuntimeError("managed MCP username is invalid")
if not password.isalnum():
    raise RuntimeError("managed MCP password contains an unsafe SQL character")
exists = connection.execute(
    f"SELECT COUNT(*) FROM EXA_DBA_USERS WHERE USER_NAME = '{username}'"
).fetchone()[0]
allowed = {"CREATE SESSION", "USE ANY SCHEMA", "SELECT ANY TABLE"}
def enabled(value):
    return str(value).upper() in {"TRUE", "1"}

def assert_read_only():
    grantees = f"('{username}', 'PUBLIC')"
    system_rows = connection.execute(
        f"SELECT GRANTEE, PRIVILEGE, ADMIN_OPTION FROM EXA_DBA_SYS_PRIVS WHERE GRANTEE IN {grantees}"
    ).fetchall()
    bad_system = [row for row in system_rows if str(row[1]).upper() not in allowed or enabled(row[2])]
    if bad_system:
        raise RuntimeError(f"managed MCP identity has unsafe effective system privileges: {bad_system}")

    role_rows = connection.execute(
        f"SELECT GRANTEE, GRANTED_ROLE, ADMIN_OPTION FROM EXA_DBA_ROLE_PRIVS WHERE GRANTEE IN {grantees}"
    ).fetchall()
    bad_roles = [row for row in role_rows if str(row[1]).upper() != "PUBLIC" or enabled(row[2])]
    if bad_roles:
        raise RuntimeError(f"managed MCP identity has unsafe effective roles: {bad_roles}")

    object_rows = connection.execute(
        f"SELECT GRANTEE, OBJECT_TYPE, PRIVILEGE, OBJECT_SCHEMA, OBJECT_NAME FROM EXA_DBA_OBJ_PRIVS WHERE GRANTEE IN {grantees}"
    ).fetchall()
    bad_objects = [row for row in object_rows if str(row[2]).upper() not in {"SELECT", "USAGE"}]
    if bad_objects:
        raise RuntimeError(f"managed MCP identity has write-capable object privileges: {bad_objects}")

    restricted = connection.execute(
        f"SELECT GRANTEE, OBJECT_NAME, PRIVILEGE FROM EXA_DBA_RESTRICTED_OBJ_PRIVS WHERE GRANTEE IN {grantees}"
    ).fetchall()
    connections = connection.execute(
        f"SELECT GRANTEE, GRANTED_CONNECTION, ADMIN_OPTION FROM EXA_DBA_CONNECTION_PRIVS WHERE GRANTEE IN {grantees}"
    ).fetchall()
    impersonation = connection.execute(
        f"SELECT GRANTEE, IMPERSONATION_ON FROM EXA_DBA_IMPERSONATION_PRIVS WHERE GRANTEE IN {grantees}"
    ).fetchall()
    if restricted or connections or impersonation:
        raise RuntimeError(
            f"managed MCP identity has restricted, connection, or impersonation grants: "
            f"{restricted}, {connections}, {impersonation}"
        )

    owned_schemas = connection.execute(
        f"SELECT SCHEMA_NAME FROM EXA_DBA_SCHEMAS WHERE SCHEMA_OWNER = '{username}'"
    ).fetchall()
    owned_objects = connection.execute(
        f"SELECT OBJECT_TYPE, OBJECT_NAME FROM EXA_DBA_OBJECTS WHERE OWNER = '{username}'"
    ).fetchall()
    if owned_schemas or owned_objects:
        raise RuntimeError(f"managed MCP identity owns writable database objects: {owned_schemas}, {owned_objects}")

if exists:
    assert_read_only()
    connection.execute(f'ALTER USER {username} IDENTIFIED BY "{password}"')
else:
    connection.execute(f'CREATE USER {username} IDENTIFIED BY "{password}"')
for privilege in ("CREATE SESSION", "USE ANY SCHEMA", "SELECT ANY TABLE"):
    connection.execute(f"GRANT {privilege} TO {username}")
assert_read_only()
connection.close()
print("Dedicated read-only MCP identity reconciled")
"#;
    let (identity, profile) = load_or_create_mcp_identity(app, administrator)?;
    let mut owned = runtime_env(administrator).to_vec();
    owned.push(("STUDIO_MCP_USER".into(), identity.username.clone()));
    owned.push(("STUDIO_MCP_PASSWORD".into(), profile.password.clone()));
    let envs: Vec<(&str, &str)> = owned
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    let python_s = python.to_string_lossy().to_string();
    if run_streamed_env(app, JOB_ID, &python_s, &["-c", SCRIPT], &envs)? != 0 {
        return Err(AppError::Storage(
            "Could not provision the dedicated read-only Studio MCP database identity.".into(),
        ));
    }

    let runtime = RuntimeConnection {
        kind: administrator.kind.clone(),
        host: administrator.host.clone(),
        port: administrator.port,
        user: identity.username,
        password: profile.password.clone(),
        engine: administrator.engine.clone(),
    };
    validate_pyexasol_connection(app, python, &runtime)?;
    Ok((runtime, profile))
}

fn validate_and_configure_mcp(
    app: &AppHandle,
    data_dir: &Path,
    python: &Path,
    runtime: &RuntimeConnection,
    credential_profile_id: &str,
) -> AppResult<()> {
    const SCRIPT: &str = r#"import json, os, queue, subprocess, sys, threading, time
process = subprocess.Popen(
    [os.environ["STUDIO_MCP_COMMAND"]],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    env=os.environ.copy(),
)
lines = queue.Queue()
threading.Thread(target=lambda: [lines.put(line) for line in process.stdout], daemon=True).start()
threading.Thread(target=lambda: [sys.stderr.write(line) for line in process.stderr], daemon=True).start()
request = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "exasol-studio", "version": os.environ["STUDIO_APP_VERSION"]},
    },
}
process.stdin.write(json.dumps(request) + "\n")
process.stdin.flush()
initialize_received = False
try:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"MCP server exited before initialize (code {process.returncode})")
        try:
            line = lines.get(timeout=max(0, min(1, deadline - time.monotonic())))
        except queue.Empty:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            print(f"Ignoring non-protocol MCP stdout: {line.rstrip()}", file=sys.stderr)
            continue
        if message.get("id") == 1 and "error" in message:
            raise RuntimeError(f"MCP initialize was rejected by the server: {message['error']}")
        if message.get("id") == 1 and "result" in message and not initialize_received:
            initialize_received = True
            process.stdin.write(json.dumps({
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
                "params": {},
            }) + "\n")
            process.stdin.write(json.dumps({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
                "params": {},
            }) + "\n")
            process.stdin.flush()
            continue
        if message.get("id") == 2 and isinstance(message.get("result", {}).get("tools"), list):
            print("MCP initialize and tools/list handshake verified")
            raise SystemExit(0)
    raise RuntimeError("complete initialize and tools/list response not received")
finally:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
"#;
    let command = mcp_server_command(data_dir);
    if !command.is_file() {
        return Err(AppError::Storage(format!(
            "The MCP package was installed but its server command is missing: {}",
            command.display()
        )));
    }
    let mut owned = runtime_env(runtime).to_vec();
    owned.push((
        "STUDIO_MCP_COMMAND".into(),
        command.to_string_lossy().to_string(),
    ));
    owned.push((
        "STUDIO_APP_VERSION".into(),
        env!("CARGO_PKG_VERSION").into(),
    ));
    let envs: Vec<(&str, &str)> = owned
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    let python_s = python.to_string_lossy().to_string();
    if run_streamed_env(app, JOB_ID, &python_s, &["-c", SCRIPT], &envs)? != 0 {
        return Err(AppError::Storage(
            "The Exasol MCP server did not complete an MCP initialize handshake.".into(),
        ));
    }
    let config = data_dir.join("agent/mcp-server.json");
    if let Some(parent) = config.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        config,
        serde_json::to_vec_pretty(&json!({
            "command": command,
            "args": [],
            "connectionProfileId": credential_profile_id,
            "env": {
                "EXA_DSN": format!("{}:{}", runtime.host, runtime.port),
                "EXA_USER": runtime.user,
                "EXA_SSL_CERT_VALIDATION": "no"
            },
            "secretEnv": {
                "EXA_PASSWORD": { "source": "studio-vault-profile", "profileId": credential_profile_id }
            }
        }))?,
    )?;
    Ok(())
}

fn ensure_python_stack(app: &AppHandle, data_dir: &Path) -> AppResult<PathBuf> {
    let stack = &crate::component_lock::components().python_stack;
    let uv = ensure_uv(app, JOB_ID)?;
    let venv = venv_dir(data_dir);
    let python = venv_python(data_dir);
    let version_probe = format!(
        "import importlib.metadata as m; assert m.version('pyexasol') == {:?}; assert m.version('exasol-mcp-server') == {:?}",
        stack.pyexasol_version, stack.mcp_server_version
    );
    let valid = python.is_file()
        && std::process::Command::new(&python)
            .args(["-c", &version_probe])
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
    if valid {
        return Ok(python);
    }
    let project = python_stack_bundle(app)?;
    let project_s = project.to_string_lossy().to_string();
    let venv_s = venv.to_string_lossy().to_string();
    let args = [
        "sync",
        "--locked",
        "--no-install-project",
        "--project",
        project_s.as_str(),
        "--python",
        stack.python_version.as_str(),
    ];
    let envs = [("UV_PROJECT_ENVIRONMENT", venv_s.as_str())];
    if run_streamed_env(app, JOB_ID, &uv, &args, &envs)? != 0 {
        return Err(AppError::Storage(
            "Could not synchronize the hash-locked PyExasol and Exasol MCP environment.".into(),
        ));
    }
    if !python.is_file() {
        return Err(AppError::Storage(
            "Managed Python was not created after uv completed.".into(),
        ));
    }
    Ok(python)
}

fn python_stack_bundle(app: &AppHandle) -> AppResult<PathBuf> {
    if let Ok(path) = app
        .path()
        .resolve("python-stack", tauri::path::BaseDirectory::Resource)
    {
        if python_stack_valid(&path)? {
            return Ok(path);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/python-stack");
    if python_stack_valid(&dev)? {
        return Ok(dev);
    }
    Err(AppError::Storage(
        "Bundled hash-locked Python stack is missing.".into(),
    ))
}

fn python_stack_valid(path: &Path) -> AppResult<bool> {
    let project = path.join("pyproject.toml");
    let lock = path.join("uv.lock");
    if !project.is_file() || !lock.is_file() {
        return Ok(false);
    }
    let expected = &crate::component_lock::components().python_stack.lock_sha256;
    let actual = crate::local_runtime::sha256_file(&lock)?;
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(AppError::Storage(format!(
            "Bundled Python lock checksum mismatch: expected {expected}, got {actual}."
        )));
    }
    Ok(true)
}

fn exapump_platform() -> AppResult<&'static crate::component_lock::Artifact> {
    let component = &crate::component_lock::components().exapump;
    crate::component_lock::artifact_for(component).ok_or_else(|| {
        AppError::Storage(format!(
            "ExaPump {} has no verified artifact for {}.",
            component.version,
            crate::component_lock::platform_key()
        ))
    })
}

fn ensure_exapump(app: &AppHandle, data_dir: &Path) -> AppResult<PathBuf> {
    let component = &crate::component_lock::components().exapump;
    let artifact = exapump_platform()?;
    let name = if cfg!(windows) {
        "exapump.exe"
    } else {
        "exapump"
    };
    let target = data_dir.join("personal-local/bin").join(name);
    if target.is_file()
        && crate::local_runtime::sha256_file(&target)?.eq_ignore_ascii_case(&artifact.sha256)
    {
        return Ok(target);
    }
    emit_log(
        app,
        JOB_ID,
        format!("Installing verified ExaPump {}…", component.version),
        "info",
    );
    crate::local_runtime::obtain_artifact(app, JOB_ID, artifact, &target)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&target)?.permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&target, permissions)?;
    }
    if run_streamed(
        app,
        JOB_ID,
        target.to_string_lossy().as_ref(),
        &["--version"],
    )? != 0
    {
        return Err(AppError::Storage(
            "ExaPump was downloaded but could not run.".into(),
        ));
    }
    Ok(target)
}

pub(crate) fn ensure_agent_skills(app: &AppHandle) -> AppResult<()> {
    let packaged = app
        .path()
        .resolve("skills", tauri::path::BaseDirectory::Resource)
        .ok()
        .or_else(|| {
            let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../../packages/agent-core/skills");
            dev.is_dir().then_some(dev)
        })
        .ok_or_else(|| AppError::Storage("Bundled agent skills are missing.".into()))?;
    for skill in [
        "fable-method/SKILL.md",
        "exasol-semantic-analyst/SKILL.md",
        "exasol/SKILL.md",
        "exasol-database/SKILL.md",
    ] {
        if !packaged.join(skill).is_file() {
            return Err(AppError::Storage(format!(
                "Bundled agent skill `{skill}` is missing."
            )));
        }
    }
    Ok(())
}

fn semantic_bundle(app: &AppHandle) -> AppResult<PathBuf> {
    if let Ok(path) = app.path().resolve(
        "exasol-semantic-views",
        tauri::path::BaseDirectory::Resource,
    ) {
        if path.join("tools/install.py").is_file() {
            return Ok(path);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/exasol-semantic-views");
    if dev.join("tools/install.py").is_file() {
        return Ok(dev);
    }
    Err(AppError::Storage(
        "Bundled Exasol Semantic Views installer is missing.".into(),
    ))
}

fn install_semantic_views(
    app: &AppHandle,
    data_dir: &Path,
    runtime: &RuntimeConnection,
    python: &Path,
) -> AppResult<()> {
    let semantic_revision = &crate::component_lock::components().semantic_views.revision;
    let marker = data_dir.join("personal-local/semantic-example.ready");
    let previously_ready = std::fs::read_to_string(&marker)
        .ok()
        .is_some_and(|version| version.trim() == semantic_revision);
    let installer = semantic_bundle(app)?.join("tools/install.py");
    let probe = installer
        .parent()
        .expect("installer has tools directory")
        .join("probe_ready.py");
    let python_s = python.to_string_lossy().to_string();
    let installer_s = installer.to_string_lossy().to_string();
    let probe_s = probe.to_string_lossy().to_string();
    let port = runtime.port.to_string();
    let envs = [
        ("EXASOL_HOST", runtime.host.as_str()),
        ("EXASOL_PORT", port.as_str()),
        ("EXASOL_USER", runtime.user.as_str()),
        ("EXASOL_PASSWORD", runtime.password.as_str()),
    ];
    if previously_ready {
        match run_streamed_env(app, JOB_ID, &python_s, &[&probe_s], &envs)? {
            0 => return Ok(()),
            4 => return Err(AppError::Storage("Existing SALES/MART objects are incomplete or user-owned; automatic setup refused to reset them.".into())),
            _ => emit_log(app, JOB_ID, "Persisted Semantic Views readiness is stale; reconciling the managed installation…", "info"),
        }
    }
    if run_streamed_env(
        app,
        JOB_ID,
        &python_s,
        &[&installer_s, "--skip-package"],
        &envs,
    )? != 0
    {
        return Err(AppError::Storage(
            "Semantic Views framework installation failed.".into(),
        ));
    }
    match run_streamed_env(app, JOB_ID, &python_s, &[&probe_s], &envs)? {
        0 => {}
        // Framework installed but no semantic model / demo data present. We do
        // NOT seed the MART example — a fresh database stays clean and the user
        // brings their own data. The semantic layer is ready to define models
        // against real tables whenever they exist.
        3 => emit_log(
            app,
            JOB_ID,
            "Semantic Views framework installed (clean — no example dataset).",
            "info",
        ),
        4 => return Err(AppError::Storage("Existing SALES/MART objects are incomplete or user-owned; automatic setup refused to reset them.".into())),
        code => return Err(AppError::Storage(format!("Semantic Views readiness probe exited with code {code}."))),
    }
    std::fs::write(marker, semantic_revision)?;
    Ok(())
}

/// Unified-credential model: the local database's SYS password is the Studio master
/// password. Applies ALTER USER against the running database, then persists
/// the credential in the deployment secrets and the vault profile. Returns
/// false when there is nothing to sync (no personal deployment).
pub(crate) fn sync_master_password(app: &AppHandle, master: &str) -> AppResult<bool> {
    if !crate::local_runtime::personal_deployment_exists(app) {
        return Ok(false);
    }
    let runtime = crate::local_runtime::current_personal_connection(app)?;
    if runtime.password == master {
        return Ok(true);
    }
    if !crate::local_runtime::personal_db_running(app) {
        // Applied on the next bootstrap instead — the DB must be up to ALTER.
        return Ok(false);
    }
    let data_dir = app.state::<AppState>().data_dir.clone();
    let python = venv_python(&data_dir);
    if !python.is_file() {
        return Err(AppError::Storage(
            "The managed Python stack is not installed yet.".into(),
        ));
    }
    const SCRIPT: &str = r#"import os, ssl, pyexasol
connection = pyexasol.connect(
    dsn=os.environ["EXA_DSN"],
    user=os.environ["EXA_USER"],
    password=os.environ["EXA_PASSWORD"],
    encryption=True,
    websocket_sslopt={"cert_reqs": ssl.CERT_NONE},
)
new_password = os.environ["STUDIO_NEW_SYS_PASSWORD"]
quoted = new_password.replace('"', '""')
connection.execute(f'ALTER USER SYS IDENTIFIED BY "{quoted}"')
connection.close()
print("SYS password now matches the Studio master password")
"#;
    let mut envs_owned: Vec<(String, String)> = runtime_env(&runtime).into_iter().collect();
    envs_owned.push(("STUDIO_NEW_SYS_PASSWORD".into(), master.to_string()));
    let envs: Vec<(&str, &str)> = envs_owned
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    let python_s = python.to_string_lossy().to_string();
    if run_streamed_env(app, JOB_ID, &python_s, &["-c", SCRIPT], &envs)? != 0 {
        return Err(AppError::Storage(
            "Could not apply the master password to the local database.".into(),
        ));
    }
    crate::local_runtime::persist_personal_password(app, master)?;
    profiles::ensure_personal_local_profile(
        &app.state::<AppState>(),
        &runtime.host,
        runtime.port,
        &runtime.user,
        master,
    )?;
    emit_log(
        app,
        JOB_ID,
        "Local Exasol now uses your master password (SYS).",
        "success",
    );
    Ok(true)
}

fn run_bootstrap(app: AppHandle) -> AppResult<()> {
    let lock = crate::component_lock::components();
    let data_dir = app.state::<AppState>().data_dir.clone();
    let mut status = read_status(&data_dir);
    status.state = "installing".into();
    status.step = "local-runtime".into();
    status.message = if cfg!(target_os = "macos") {
        "Installing or starting native Exasol Personal…".into()
    } else {
        "Pulling or starting Exasol Nano with Docker/Podman…".into()
    };
    status.local_ready = false;
    write_status(&app, &data_dir, status.clone())?;

    let runtime = crate::local_runtime::ensure_runtime(&app, JOB_ID)?;

    status.step = "pyexasol".into();
    status.message = "Installing the managed Python stack (PyExasol and MCP server)…".into();
    set_component(
        &mut status,
        "pyexasol",
        "installing",
        &lock.python_stack.pyexasol_version,
        None,
    );
    set_component(
        &mut status,
        "mcp-server",
        "installing",
        &lock.python_stack.mcp_server_version,
        None,
    );
    write_status(&app, &data_dir, status.clone())?;
    let python = ensure_python_stack(&app, &data_dir)?;
    let mut runtime = query_ready_runtime(&app, &python, &runtime)?;
    // Unified-credential model: keep the local SYS credential equal to the master
    // password whenever the vault is unlocked this session.
    let master = app.state::<AppState>().master_secret.read().unwrap().clone();
    if let Some(master) = master {
        if runtime.kind == "personal" && runtime.password != master {
            match sync_master_password(&app, &master) {
                Ok(true) => runtime.password = master,
                Ok(false) => {}
                Err(error) => emit_log(
                    &app,
                    JOB_ID,
                    format!("Master-password sync skipped: {error}"),
                    "info",
                ),
            }
        }
    }
    status.local_ready = true;
    set_component(
        &mut status,
        "pyexasol",
        "ready",
        &lock.python_stack.pyexasol_version,
        None,
    );

    status.step = "exapump".into();
    status.message = "Installing verified ExaPump…".into();
    set_component(
        &mut status,
        "exapump",
        "installing",
        &lock.exapump.version,
        None,
    );
    write_status(&app, &data_dir, status.clone())?;
    ensure_exapump(&app, &data_dir)?;
    set_component(&mut status, "exapump", "ready", &lock.exapump.version, None);

    status.step = "agent-skills".into();
    status.message = "Verifying bundled Exasol agent skills and Fable Method…".into();
    set_component(
        &mut status,
        "agent-skills",
        "installing",
        &lock.agent_skills.revision,
        None,
    );
    set_component(
        &mut status,
        "fable-method",
        "installing",
        &lock.fable_method.revision,
        None,
    );
    write_status(&app, &data_dir, status.clone())?;
    ensure_agent_skills(&app)?;
    set_component(
        &mut status,
        "agent-skills",
        "ready",
        &lock.agent_skills.revision,
        None,
    );
    set_component(
        &mut status,
        "fable-method",
        "ready",
        &lock.fable_method.revision,
        None,
    );

    status.step = "connection-profile".into();
    status.message = "Saving the built-in local connection in the Studio vault…".into();
    write_status(&app, &data_dir, status.clone())?;
    let profile = profiles::ensure_personal_local_profile(
        &app.state::<AppState>(),
        &runtime.host,
        runtime.port,
        &runtime.user,
        &runtime.password,
    )?;
    status.profile_id = Some(profile.id.clone());

    status.step = "mcp-server".into();
    status.message =
        "Provisioning a read-only identity and validating the Exasol MCP server…".into();
    write_status(&app, &data_dir, status.clone())?;
    let (mcp_runtime, mcp_profile) = provision_mcp_identity(&app, &python, &runtime)?;
    validate_and_configure_mcp(&app, &data_dir, &python, &mcp_runtime, &mcp_profile.id)?;
    set_component(
        &mut status,
        "mcp-server",
        "ready",
        &lock.python_stack.mcp_server_version,
        None,
    );

    // Semantic Views is OPT-IN — never installed by default. A previous
    // installation (marker present) keeps reporting ready; otherwise it stays
    // available for one-click install from the Marketplace.
    let semantic_marker = data_dir.join("personal-local/semantic-example.ready");
    if semantic_marker.is_file() {
        status.semantic_views = CapabilityState {
            state: "ready".into(),
            version: std::fs::read_to_string(&semantic_marker)
                .ok()
                .map(|version| version.trim().to_string()),
            error: None,
            connection_id: Some(profile.id),
        };
    }

    status.state = "ready".into();
    status.step = "complete".into();
    status.message = "Local Exasol and the complete AI/data stack are ready.".into();
    write_status(&app, &data_dir, status)?;
    emit_log(&app, JOB_ID, "✓ Local Exasol, PyExasol, agent skills, ExaPump, and MCP server are ready.", "success");
    Ok(())
}

fn record_failure(app: &AppHandle, error: &str) {
    let data_dir = app.state::<AppState>().data_dir.clone();
    let mut status = read_status(&data_dir);
    status.state = "failed".into();
    status.message = error.into();
    if status.step == "semantic-views" {
        status.semantic_views.state = "failed".into();
        status.semantic_views.error = Some(error.into());
    } else if status.step == "pyexasol" {
        for name in ["pyexasol", "mcp-server"] {
            if let Some(component) = status.components.get_mut(name) {
                component.state = "failed".into();
                component.error = Some(error.into());
            }
        }
    } else if status.components.contains_key(&status.step) {
        if let Some(component) = status.components.get_mut(&status.step) {
            component.state = "failed".into();
            component.error = Some(error.into());
        }
    }
    let _ = write_status(app, &data_dir, status);
    emit_log(app, JOB_ID, format!("✗ {error}"), "err");
}

fn fully_ready(status: &BootstrapStatus) -> bool {
    let lock = crate::component_lock::components();
    let component_at = |name: &str, version: &str| {
        status.components.get(name).is_some_and(|component| {
            component.state == "ready" && component.version.as_deref() == Some(version)
        })
    };
    status.state == "ready"
        && status.local_ready
        && component_at("pyexasol", &lock.python_stack.pyexasol_version)
        && component_at("mcp-server", &lock.python_stack.mcp_server_version)
        && component_at("exapump", &lock.exapump.version)
        && component_at("agent-skills", &lock.agent_skills.revision)
        && component_at("fable-method", &lock.fable_method.revision)
}

#[tauri::command]
pub fn personal_local_bootstrap(
    app: AppHandle,
    bootstrap: State<'_, LocalBootstrap>,
) -> AppResult<Value> {
    let existing = read_status(&app.state::<AppState>().data_dir);
    if fully_ready(&existing) && crate::local_runtime::runtime_installed(&app) {
        // Already installed and set up. If the database is actually running,
        // nothing to do. If it's installed-but-stopped (e.g. after a machine
        // restart), start it on launch — no reinstall — so it's ready to use.
        if crate::local_runtime::runtime_running(&app) {
            return Ok(json!({ "started": false, "reason": "already-running" }));
        }
        if bootstrap.running.swap(true, Ordering::SeqCst) {
            return Ok(json!({ "started": false, "reason": "already-running" }));
        }
        let app2 = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let data_dir = app2.state::<AppState>().data_dir.clone();
            let mut status = read_status(&data_dir);
            status.state = "installing".into();
            status.step = "local-runtime".into();
            status.message = "Starting your local Exasol database…".into();
            status.local_ready = false;
            let _ = write_status(&app2, &data_dir, status.clone());
            match crate::local_runtime::ensure_runtime(&app2, JOB_ID) {
                Ok(_) => {
                    status.state = "ready".into();
                    status.message = "Local Exasol is ready.".into();
                    status.local_ready = true;
                    let _ = write_status(&app2, &data_dir, status);
                    spawn_runtime_verification(&app2);
                }
                Err(error) => record_failure(&app2, &error.to_string()),
            }
            app2.state::<LocalBootstrap>().running.store(false, Ordering::SeqCst);
        });
        return Ok(json!({ "started": true, "reason": "starting" }));
    }
    if bootstrap.running.swap(true, Ordering::SeqCst) {
        return Ok(json!({ "started": false, "reason": "already-running" }));
    }
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = run_bootstrap(app2.clone()) {
            record_failure(&app2, &error.to_string());
        }
        app2.state::<LocalBootstrap>()
            .running
            .store(false, Ordering::SeqCst);
    });
    Ok(json!({ "started": true }))
}

#[tauri::command]
pub fn personal_local_status(state: State<'_, AppState>) -> BootstrapStatus {
    read_status(&state.data_dir)
}

/// Component is present and verified (ready) per the manifest.
pub fn component_ready(app: &AppHandle, name: &str) -> bool {
    read_status(&app.state::<AppState>().data_dir)
        .components
        .get(name)
        .is_some_and(|c| c.state == "ready")
}

/// The opt-in Semantic Views framework is installed (readiness marker present).
pub fn semantic_views_installed(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .data_dir
        .join("personal-local/semantic-example.ready")
        .is_file()
}

/// Opt-in install of the Exasol Semantic Views framework (Marketplace action).
#[tauri::command]
pub async fn personal_install_semantic_views(app: AppHandle) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let lock = crate::component_lock::components();
        let data_dir = app.state::<AppState>().data_dir.clone();
        let mut status = read_status(&data_dir);
        status.semantic_views = CapabilityState {
            state: "installing".into(),
            version: Some(lock.semantic_views.revision.clone()),
            error: None,
            connection_id: status.profile_id.clone(),
        };
        write_status(&app, &data_dir, status.clone())?;
        let result = (|| -> AppResult<()> {
            let runtime = crate::local_runtime::ensure_runtime(&app, JOB_ID)?;
            let python = venv_python(&data_dir);
            if !python.is_file() {
                return Err(AppError::Storage(
                    "Set up the local database first — the managed Python stack is not installed yet.".into(),
                ));
            }
            install_semantic_views(&app, &data_dir, &runtime, &python)
        })();
        match &result {
            Ok(()) => {
                status.semantic_views.state = "ready".into();
                status.semantic_views.error = None;
            }
            Err(error) => {
                status.semantic_views.state = "failed".into();
                status.semantic_views.error = Some(error.to_string());
            }
        }
        write_status(&app, &data_dir, status)?;
        result
    })
    .await
    .map_err(|error| AppError::Storage(error.to_string()))?
}

// ── Independent, isolated component updates ──────────────────────────────────
// Each component can be updated on its own, in its own environment, without a
// Studio release. Slice 2 wires the MCP server; the shared verified stack stays
// the fallback so nothing breaks when a component has no independent install.

use crate::components_update::{self, ComponentId, InstalledManifest};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentInfo {
    pub id: String,
    pub name: String,
    /// GitHub repo (owner/name) — the UI reads its latest release for "available".
    pub repo: String,
    /// Currently-running version (own-env install if present, else verified).
    pub installed: Option<String>,
    /// Studio's pinned, known-good baseline.
    pub verified: String,
    /// Whether an independent install currently overrides the verified stack.
    pub on_own_env: bool,
    /// Whether independent one-click update/revert is available for it yet.
    pub updatable: bool,
    /// pip/uv-managed (hashes verified by the index) → can move to any upstream
    /// version. False = binary (verify-or-refuse: only the SHA-pinned verified
    /// build; upstream is shown/linked, not installed).
    pub pip_managed: bool,
    /// The version is an opaque revision (e.g. a content hash), not an orderable
    /// semver — compare by inequality, and "update" means reconcile to the
    /// verified revision (Semantic Views).
    pub opaque_version: bool,
}

fn component_repo(id: ComponentId) -> String {
    let c = crate::component_lock::components();
    match id {
        ComponentId::Personal => c.personal.repository.clone(),
        ComponentId::ExaPump => c.exapump.repository.clone(),
        ComponentId::McpServer => "exasol/mcp-server".to_string(),
        ComponentId::SemanticViews => c.semantic_views.repository.clone(),
    }
}

/// The Python interpreter version a component's OWN env is provisioned with.
/// Per-component (not one shared interpreter): components can require different,
/// even conflicting versions — `uv --python <v>` downloads/uses that exact one,
/// so a future Python-3.11 component and a Python-3.13 component coexist. Add a
/// component here with its own version; nothing else changes.
fn component_python_version(id: ComponentId) -> String {
    let c = crate::component_lock::components();
    match id {
        // The MCP server currently tracks the verified stack's interpreter.
        ComponentId::McpServer => c.python_stack.python_version.clone(),
        // Non-Python components; value is unused (no venv) but kept total.
        _ => c.python_stack.python_version.clone(),
    }
}

fn verified_version(id: ComponentId) -> String {
    let c = crate::component_lock::components();
    match id {
        ComponentId::Personal => c.personal.version.clone(),
        ComponentId::ExaPump => c.exapump.version.clone(),
        ComponentId::McpServer => c.python_stack.mcp_server_version.clone(),
        ComponentId::SemanticViews => c.semantic_views.revision.clone(),
    }
}

/// The version actually in effect: the component's own-env manifest when it has
/// been independently installed, otherwise the verified baseline (the shared
/// stack is pinned to verified). Semantic Views is opt-in + DB-side, so its
/// installed version is the readiness marker's revision, or None when it hasn't
/// been installed at all.
fn installed_version(data_dir: &Path, id: ComponentId) -> Option<String> {
    if id == ComponentId::SemanticViews {
        return std::fs::read_to_string(data_dir.join("personal-local/semantic-example.ready"))
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
    }
    components_update::read_manifest(data_dir, id)
        .map(|m| m.version)
        .or_else(|| Some(verified_version(id)))
}

/// Enumerate managed components with their installed vs. verified versions —
/// the data the Marketplace → Updates section renders per component.
#[tauri::command]
pub fn list_components(app: AppHandle) -> AppResult<Vec<ComponentInfo>> {
    let data_dir = app.state::<AppState>().data_dir.clone();
    let ids = [
        ComponentId::Personal,
        ComponentId::ExaPump,
        ComponentId::McpServer,
        ComponentId::SemanticViews,
    ];
    Ok(ids
        .iter()
        .map(|&id| ComponentInfo {
            id: id.slug().into(),
            name: id.display().into(),
            repo: component_repo(id),
            installed: installed_version(&data_dir, id),
            verified: verified_version(id),
            on_own_env: components_update::read_manifest(&data_dir, id).is_some(),
            // MCP (pip), ExaPump (binary), Semantic Views (DB-side) support
            // independent update; Personal (DB engine) lands in a later slice.
            updatable: matches!(
                id,
                ComponentId::McpServer | ComponentId::ExaPump | ComponentId::SemanticViews
            ),
            pip_managed: matches!(id, ComponentId::McpServer),
            opaque_version: matches!(id, ComponentId::SemanticViews),
        })
        .collect())
}

/// Re-point the MCP client config (agent/mcp-server.json) at the binary that
/// mcp_server_command now resolves to. The config stores a concrete executable
/// path, so after an update (own env) or a revert (back to the shared verified
/// stack) it must be rewritten or clients keep launching the old/deleted binary.
/// No-op when MCP hasn't been configured yet.
fn repoint_mcp_command(data_dir: &Path) -> AppResult<()> {
    let config = data_dir.join("agent/mcp-server.json");
    let Ok(raw) = std::fs::read_to_string(&config) else {
        return Ok(());
    };
    let mut value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| AppError::Storage(e.to_string()))?;
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            "command".into(),
            json!(mcp_server_command(data_dir).to_string_lossy()),
        );
    }
    std::fs::write(
        &config,
        serde_json::to_vec_pretty(&value).map_err(|e| AppError::Storage(e.to_string()))?,
    )?;
    Ok(())
}

/// Install a specific MCP-server version into its OWN isolated venv, so it runs
/// from there instead of the shared verified stack (see mcp_server_command).
fn install_mcp_component(app: &AppHandle, data_dir: &Path, version: &str, channel: &str) -> AppResult<()> {
    let uv = ensure_uv(app, JOB_ID)?;
    let py_version = component_python_version(ComponentId::McpServer);
    let env = components_update::component_env(data_dir, ComponentId::McpServer);
    let env_s = env.to_string_lossy().to_string();
    // Fresh env each time so an update never inherits a broken partial state.
    let _ = std::fs::remove_dir_all(&env);
    let no_env: &[(&str, &str)] = &[];
    // uv provisions THIS component's own interpreter (downloading it if needed),
    // so components with different Python needs don't collide.
    if run_streamed_env(app, JOB_ID, &uv, &["venv", &env_s, "--python", &py_version], no_env)? != 0 {
        return Err(AppError::Storage("Could not create the MCP server's isolated environment.".into()));
    }
    let py = components_update::component_env_python(data_dir, ComponentId::McpServer);
    let py_s = py.to_string_lossy().to_string();
    let spec = format!("exasol-mcp-server=={version}");
    if run_streamed_env(app, JOB_ID, &uv, &["pip", "install", "--python", &py_s, &spec], no_env)? != 0 {
        return Err(AppError::Storage(format!(
            "Could not install exasol-mcp-server {version} into its own environment."
        )));
    }
    if !mcp_server_bin(&env).is_file() {
        return Err(AppError::Storage(
            "MCP server installed but its command is missing in the new environment.".into(),
        ));
    }
    components_update::write_manifest(
        data_dir,
        ComponentId::McpServer,
        &InstalledManifest {
            version: version.into(),
            installed_at: chrono::Utc::now().to_rfc3339(),
            channel: Some(channel.into()),
        },
    )
}

/// Install the verified ExaPump artifact into its OWN dir. Verify-or-refuse: the
/// SHA-pinned verified build only (obtain_artifact checks the hash), so this is
/// safe for a raw binary. exapump_path prefers it once the manifest is written;
/// revert drops the dir and falls back to the shared managed copy.
fn install_exapump_component(app: &AppHandle, data_dir: &Path) -> AppResult<()> {
    let component = &crate::component_lock::components().exapump;
    let artifact = exapump_platform()?;
    let name = if cfg!(windows) { "exapump.exe" } else { "exapump" };
    let dir = components_update::component_dir(data_dir, ComponentId::ExaPump);
    // Fresh dir each time: the manifest is written LAST (on success), so a
    // failed reinstall leaves no manifest — exapump_path then won't shadow the
    // working shared binary with a broken own-dir one.
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir)?;
    let target = dir.join(name);
    crate::local_runtime::obtain_artifact(app, JOB_ID, artifact, &target)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&target)?.permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&target, permissions)?;
    }
    if run_streamed(app, JOB_ID, target.to_string_lossy().as_ref(), &["--version"])? != 0 {
        return Err(AppError::Storage("ExaPump was installed but could not run.".into()));
    }
    components_update::write_manifest(
        data_dir,
        ComponentId::ExaPump,
        &InstalledManifest {
            version: component.version.clone(),
            installed_at: chrono::Utc::now().to_rfc3339(),
            channel: Some("verified".into()),
        },
    )
}

/// Reconcile Semantic Views (DB-side) to the effective verified revision by
/// re-running its installer. Requires the local runtime + managed Python; the
/// installer writes the readiness marker with the new revision on success.
fn reconcile_semantic(app: &AppHandle, data_dir: &Path) -> AppResult<()> {
    // Refuse an unconfigured setup BEFORE starting the runtime (no side effects).
    let python = venv_python(data_dir);
    if !python.is_file() {
        return Err(AppError::Storage(
            "Set up the local database first — the managed Python stack isn't installed yet.".into(),
        ));
    }
    let runtime = crate::local_runtime::ensure_runtime(app, JOB_ID)?;
    let runtime = query_ready_runtime(app, &python, &runtime)?;
    install_semantic_views(app, data_dir, &runtime, &python)
}

/// One-click independent update of a component. MCP (pip) can move to any
/// upstream version (uv verifies package hashes); binaries are verify-or-refuse
/// and always install the effective VERIFIED build (the `version` arg is ignored
/// for them). No Studio release, no touching other components.
#[tauri::command]
pub async fn update_component(app: AppHandle, id: String, version: Option<String>) -> AppResult<()> {
    let component = ComponentId::from_slug(&id)
        .ok_or_else(|| AppError::InvalidSettings(format!("unknown component `{id}`")))?;
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let data_dir = app.state::<AppState>().data_dir.clone();
        match component {
            ComponentId::McpServer => {
                let verified = verified_version(component);
                let target = version.unwrap_or_else(|| verified.clone());
                let channel = if target == verified { "verified" } else { "upstream" };
                install_mcp_component(&app, &data_dir, &target, channel)?;
                repoint_mcp_command(&data_dir)
            }
            ComponentId::ExaPump => install_exapump_component(&app, &data_dir),
            ComponentId::SemanticViews => reconcile_semantic(&app, &data_dir),
            ComponentId::Personal => Err(AppError::InvalidSettings(
                "Independent update of the database engine isn't available yet.".into(),
            )),
        }
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))?
}

/// Revert a component to the Studio-verified baseline by dropping its
/// independent install — it then falls back to the shared verified stack.
#[tauri::command]
pub async fn revert_component(app: AppHandle, id: String) -> AppResult<()> {
    let component = ComponentId::from_slug(&id)
        .ok_or_else(|| AppError::InvalidSettings(format!("unknown component `{id}`")))?;
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let data_dir = app.state::<AppState>().data_dir.clone();
        let dir = components_update::component_dir(&data_dir, component);
        // Report failure if the env couldn't actually be removed — otherwise we
        // would claim a revert while the (possibly broken) own env still shadows
        // the verified stack.
        match std::fs::remove_dir_all(&dir) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(AppError::Storage(format!("Could not remove {}: {e}", dir.display()))),
        }
        // Only the MCP server has a client config to re-point; don't let an
        // unrelated MCP-config problem fail an ExaPump revert that succeeded.
        if component == ComponentId::McpServer {
            repoint_mcp_command(&data_dir)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))?
}

pub fn ensure_lifecycle_idle(app: &AppHandle, action: &str) -> AppResult<()> {
    if matches!(action, "start" | "stop" | "destroy")
        && app
            .state::<LocalBootstrap>()
            .running
            .load(Ordering::SeqCst)
    {
        return Err(AppError::Storage(
            "Local runtime readiness verification is still in progress; wait for it to finish before starting, stopping, or destroying the deployment."
                .into(),
        ));
    }
    Ok(())
}

fn verify_started_runtime(app: &AppHandle) -> AppResult<()> {
    let runtime = crate::local_runtime::start_runtime(app, JOB_ID)?;
    let data_dir = app.state::<AppState>().data_dir.clone();
    let python = venv_python(&data_dir);
    let runtime = query_ready_runtime(app, &python, &runtime)?;

    // Semantic Views is OPT-IN. Only verify/reconcile it after a runtime start
    // when the user has ALREADY installed it (readiness marker present) — never
    // install it here on a plain start. Installing it unconditionally is what
    // made it appear "automatically installed".
    if semantic_views_installed(app) {
        let mut checking = read_status(&data_dir);
        checking.step = "semantic-views".into();
        checking.message = "Verifying Semantic Views after local runtime start…".into();
        checking.semantic_views.state = "installing".into();
        write_status(app, &data_dir, checking)?;
        install_semantic_views(app, &data_dir, &runtime, &python)?;
        let mut status = read_status(&data_dir);
        status.semantic_views.state = "ready".into();
        status.semantic_views.error = None;
        write_status(app, &data_dir, status)?;
    }

    let mut status = read_status(&data_dir);
    // Not opted in → report Semantic Views as not installed (self-heals a stale
    // "ready" left by a previous auto-install), leaving it available to install.
    if !semantic_views_installed(app) {
        status.semantic_views = CapabilityState {
            state: "unavailable".into(),
            version: None,
            error: None,
            connection_id: None,
        };
    }
    status.state = "ready".into();
    status.step = "complete".into();
    status.message = "Local Exasol and the AI/data stack are ready.".into();
    status.local_ready = true;
    write_status(app, &data_dir, status)
}

fn spawn_runtime_verification(app: &AppHandle) {
    let bootstrap = app.state::<LocalBootstrap>();
    if bootstrap.running.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = verify_started_runtime(&app) {
            record_failure(&app, &format!("Runtime start readiness check failed: {error}"));
        }
        app.state::<LocalBootstrap>()
            .running
            .store(false, Ordering::SeqCst);
    });
}

pub fn auto_start_if_installed(app: &AppHandle) {
    let data_dir = app.state::<AppState>().data_dir.clone();
    let mut status = read_status(&data_dir);
    if !fully_ready(&status) || !crate::local_runtime::runtime_installed(app) {
        return;
    }
    status.state = "installing".into();
    status.step = "local-runtime".into();
    status.message = "Starting the managed local Exasol runtime…".into();
    status.local_ready = false;
    let _ = write_status(app, &data_dir, status);
    spawn_runtime_verification(app);
}

pub fn record_lifecycle(app: &AppHandle, action: &str, ok: bool) -> AppResult<()> {
    if !ok || !matches!(action, "start" | "stop" | "destroy") {
        return Ok(());
    }
    let data_dir = app.state::<AppState>().data_dir.clone();
    let mut status = read_status(&data_dir);
    match action {
        "start" => {
            status.state = "installing".into();
            status.step = "local-runtime".into();
            status.message = "Verifying the local database and Semantic Views…".into();
            status.local_ready = false;
        }
        "stop" => {
            status.state = "stopped".into();
            status.step = "local-runtime".into();
            status.message = "Local Exasol is stopped.".into();
            status.local_ready = false;
        }
        "destroy" => {
            status = BootstrapStatus::default();
            status.message =
                "The managed local Exasol runtime and its database data were removed.".into();
        }
        _ => return Ok(()),
    }
    write_status(app, &data_dir, status)?;
    if action == "start" {
        let bootstrap = app.state::<LocalBootstrap>();
        if bootstrap.running.swap(true, Ordering::SeqCst) {
            return Err(AppError::Storage(
                "Local runtime verification is already in progress.".into(),
            ));
        }
        let result = verify_started_runtime(app);
        bootstrap.running.store(false, Ordering::SeqCst);
        if let Err(error) = &result {
            record_failure(
                app,
                &format!("Runtime start readiness check failed: {error}"),
            );
        }
        result?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_requires_every_pinned_component_and_semantic_version() {
        let lock = crate::component_lock::components();
        let mut status = BootstrapStatus::default();
        status.state = "ready".into();
        status.local_ready = true;
        status.semantic_views = CapabilityState {
            state: "ready".into(),
            version: Some(lock.semantic_views.revision.clone()),
            error: None,
            connection_id: Some("local".into()),
        };
        set_component(
            &mut status,
            "pyexasol",
            "ready",
            &lock.python_stack.pyexasol_version,
            None,
        );
        set_component(
            &mut status,
            "mcp-server",
            "ready",
            &lock.python_stack.mcp_server_version,
            None,
        );
        set_component(&mut status, "exapump", "ready", &lock.exapump.version, None);
        set_component(
            &mut status,
            "agent-skills",
            "ready",
            &lock.agent_skills.revision,
            None,
        );
        set_component(
            &mut status,
            "fable-method",
            "ready",
            &lock.fable_method.revision,
            None,
        );
        assert!(fully_ready(&status));

        status.components.get_mut("mcp-server").unwrap().version = Some("older".into());
        assert!(!fully_ready(&status));
    }
}
