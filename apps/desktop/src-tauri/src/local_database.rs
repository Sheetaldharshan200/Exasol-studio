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
            let recovered = crate::local_runtime::restart_personal_runtime(app, JOB_ID)?;
            validate_pyexasol_connection(app, python, &recovered)?;
            Ok(recovered)
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
                        compression: true,
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
            compression: true,
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
    let command = venv_mcp_server(data_dir);
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
        format!("Downloading verified ExaPump {}…", component.version),
        "info",
    );
    crate::local_runtime::download_verified(&artifact.url, &target, &artifact.sha256)?;
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
    status.semantic_views.state = "waiting".into();
    status.semantic_views.error = None;
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
    let runtime = query_ready_runtime(&app, &python, &runtime)?;
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

    status.step = "semantic-views".into();
    status.message = "Loading and verifying Exasol Semantic Views in the background…".into();
    status.semantic_views = CapabilityState {
        state: "installing".into(),
        version: Some(lock.semantic_views.revision.clone()),
        error: None,
        connection_id: Some(profile.id),
    };
    write_status(&app, &data_dir, status.clone())?;
    install_semantic_views(&app, &data_dir, &runtime, &python)?;

    status.state = "ready".into();
    status.step = "complete".into();
    status.message = "Local Exasol and the complete AI/data stack are ready.".into();
    status.semantic_views.state = "ready".into();
    write_status(&app, &data_dir, status)?;
    emit_log(&app, JOB_ID, "✓ Local Exasol, PyExasol, Semantic Views, agent skills, ExaPump, and MCP server are ready.", "success");
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
        && status.semantic_views.state == "ready"
        && status.semantic_views.version.as_deref() == Some(&lock.semantic_views.revision)
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
    let mut checking = read_status(&data_dir);
    checking.step = "semantic-views".into();
    checking.message = "Verifying Semantic Views after local runtime start…".into();
    checking.semantic_views.state = "installing".into();
    write_status(app, &data_dir, checking)?;
    install_semantic_views(app, &data_dir, &runtime, &python)?;
    let mut status = read_status(&data_dir);
    status.state = "ready".into();
    status.step = "complete".into();
    status.message = "Local Exasol and the complete AI/data stack are ready.".into();
    status.local_ready = true;
    status.semantic_views.state = "ready".into();
    status.semantic_views.error = None;
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
