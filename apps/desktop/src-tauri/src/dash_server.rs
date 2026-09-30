//! dash-server — the ecosystem's dashboard host — run by Studio for one of
//! the person's connections and rendered inside a Studio tab. Studio starts
//! the Marketplace-installed command with the connection bootstrapped
//! through the process environment (the password never touches a file),
//! adopts a server already answering like dash-server, lists its hosted apps
//! through its own MCP inventory, and stops what it started on exit.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const PORT: u16 = 5100;

/// The child Studio started and the profile it was started for.
#[derive(Default)]
pub struct DashServer {
    child: Mutex<Option<(Child, String, String)>>,
}

impl DashServer {
    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some((mut child, _, _)) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    /// A child that has exited is forgotten first, so a listener that later
    /// takes the port is never mistaken for the one Studio started.
    fn started_for(&self) -> Option<(String, String)> {
        let mut guard = self.child.lock().ok()?;
        if let Some((child, _, _)) = guard.as_mut() {
            if matches!(child.try_wait(), Ok(Some(_)) | Err(_)) {
                *guard = None;
            }
        }
        guard.as_ref().map(|(_, id, name)| (id.clone(), name.clone()))
    }
}

/// Whether a connection's TLS mode verifies the server certificate — the
/// `verify_ca` and `verify_identity` modes do; `preferred`, `required` and
/// `disabled` encrypt without verifying.
pub fn verifies_certificate(ssl_mode: &str) -> bool {
    ssl_mode.starts_with("verify")
}

/// The dash-server profile name for a connection: readable, and unique per
/// connection id so two connections named alike never share one.
pub fn server_profile_name(name: &str, id: &str) -> String {
    let tail: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect::<String>().to_ascii_lowercase();
    let slug = profile_slug(name);
    if tail.is_empty() {
        slug
    } else {
        format!("{}-{tail}", slug.chars().take(38).collect::<String>().trim_end_matches('-'))
    }
}

/// A hosted app's route must stay on the server: `/apps/…` or `/preview/…`,
/// one path, nothing that could re-point the frame elsewhere.
pub fn valid_route(route: &str) -> bool {
    (route.starts_with("/apps/") || route.starts_with("/preview/"))
        && !route.contains("//")
        && !route.contains("..")
        && route.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '_' | '.'))
}

fn base() -> String {
    format!("http://127.0.0.1:{PORT}")
}

/// A profile name as dash-server accepts a profile name: lowercase, dashes.
pub fn profile_slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "studio".into()
    } else {
        trimmed.chars().take(48).collect()
    }
}

/// The environment the server starts with for a connection: its own port and
/// instance directory, and the connection as its bootstrapped profile. The
/// password goes only here, into the child's environment.
pub fn bootstrap_env(
    instance_dir: &str,
    profile_name: &str,
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    verify_tls: bool,
) -> Vec<(String, String)> {
    let mut env = vec![
        ("DASH_SERVER_HOST".into(), "127.0.0.1".into()),
        ("DASH_SERVER_PORT".into(), PORT.to_string()),
        ("DASH_SERVER_INSTANCE_PATH".into(), instance_dir.into()),
        ("DASH_SERVER_EXASOL_PROFILE_NAME".into(), profile_name.into()),
        ("DASH_SERVER_EXASOL_DESCRIPTION".into(), format!("{profile_name} (Exasol Studio connection)")),
        ("DASH_SERVER_EXASOL_DSN".into(), format!("{host}:{port}")),
        ("DASH_SERVER_EXASOL_USER".into(), user.into()),
        ("DASH_SERVER_EXASOL_SECRET_ENV_VAR".into(), "EXA_PASSWORD".into()),
        ("DASH_SERVER_EXASOL_CREDENTIAL_MODE".into(), "password".into()),
        // A changed connection applies; the server only creates otherwise.
        ("DASH_SERVER_EXASOL_OVERWRITE".into(), "true".into()),
        ("EXA_PASSWORD".into(), password.into()),
    ];
    if !verify_tls {
        env.push(("DASH_SERVER_EXASOL_TLS_VERIFY".into(), "false".into()));
    }
    env
}

/// The hosted apps in dash-server's `dash://apps` inventory.
pub fn apps_from(inventory: &Value) -> Vec<DashApp> {
    inventory
        .get("apps")
        .and_then(Value::as_array)
        .map(|apps| {
            apps.iter()
                .filter_map(|a| {
                    let name = a.get("name")?.as_str()?.to_string();
                    let route = a.get("route").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("/apps/{name}"));
                    if !valid_route(&route) {
                        return None;
                    }
                    Some(DashApp {
                        route,
                        title: a.get("title").and_then(Value::as_str).unwrap_or(&name).to_string(),
                        status: a.get("status").and_then(Value::as_str).unwrap_or("unknown").to_string(),
                        published: a.get("published").and_then(Value::as_bool).unwrap_or(false),
                        name,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashApp {
    pub name: String,
    pub title: String,
    pub route: String,
    pub status: String,
    pub published: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashServerStatus {
    pub installed: bool,
    pub serving: bool,
    pub url: String,
    pub profile_id: Option<String>,
    pub profile_name: Option<String>,
    /// False when something else serves the port: Studio uses it but did not
    /// start it and will not stop it.
    pub started_by_studio: bool,
}

/// The dash-server command — only the Marketplace install's own environment.
/// The process receives a connection's password, so a `dash-server` that
/// merely sits on PATH (which anything can shadow) is never the one started.
fn dash_server_bin(app: &AppHandle) -> Option<PathBuf> {
    let venv = crate::market::market_dir(app).ok()?.join("dash-server").join("venv");
    let ours = if cfg!(windows) { venv.join("Scripts").join("dash-server.exe") } else { venv.join("bin").join("dash-server") };
    ours.is_file().then_some(ours)
}

/// One JSON-RPC call to the server's MCP endpoint.
async fn mcp_call(client: &reqwest::Client, method: &str, params: Value) -> Option<Value> {
    client
        .post(format!("{}/mcp", base()))
        .header("content-type", "application/json")
        .header("accept", "application/json, text/event-stream")
        .json(&json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }))
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .ok()?
        .json::<Value>()
        .await
        .ok()
}

/// The inventory when something on the port answers like dash-server.
async fn inventory(client: &reqwest::Client) -> Option<Value> {
    let reply = mcp_call(client, "resources/read", json!({ "uri": "dash://apps" })).await?;
    let text = reply.get("result")?.get("contents")?.as_array()?.first()?.get("text")?.as_str()?;
    let parsed: Value = serde_json::from_str(text).ok()?;
    parsed.get("apps").is_some_and(Value::is_array).then_some(parsed)
}

#[tauri::command]
pub async fn dash_server_status(app: AppHandle) -> AppResult<DashServerStatus> {
    let installed = dash_server_bin(&app).is_some();
    let serving = inventory(&reqwest::Client::new()).await.is_some();
    let started = app.state::<DashServer>().started_for();
    Ok(DashServerStatus {
        installed,
        serving,
        url: base(),
        started_by_studio: started.is_some(),
        profile_id: started.as_ref().map(|(id, _)| id.clone()),
        profile_name: started.map(|(_, name)| name),
    })
}

/// Tell the agent sidecar the server is (re)started, so its own MCP
/// connector and the engine's remote server reconnect and the tools appear.
/// Best effort: the agent may not be running yet.
async fn notify_agent(app: &AppHandle) {
    let _ = crate::agent::agent_api(app.clone(), "/mcp/dash-server/reconnect".into(), "POST".into(), None).await;
    let _ = crate::agent::agent_api(app.clone(), "/engine/mcp/dash-server/connect".into(), "POST".into(), Some(json!({}))).await;
}

/// Start dash-server for a connection. A server Studio started for another
/// connection is stopped first; one already answering that Studio did not
/// start is adopted as it is.
#[tauri::command]
pub async fn dash_server_start(app: AppHandle, profile_id: String) -> AppResult<DashServerStatus> {
    let bin = dash_server_bin(&app).ok_or_else(|| AppError::Storage("dash-server is not installed. Install it from the Marketplace first.".into()))?;
    let state = app.state::<crate::state::AppState>();
    let profile = crate::profiles::find_profile(&state, &profile_id)?;
    let password = if profile.password.is_empty() { crate::shared_registry::read_credential(&profile.id).unwrap_or_default() } else { profile.password.clone() };
    if password.is_empty() {
        return Err(AppError::Storage(format!("No stored password for \"{}\" — open the connection once so its credential is saved.", profile.name)));
    }
    let client = reqwest::Client::new();
    let engine = app.state::<DashServer>();
    match engine.started_for() {
        Some((id, _)) if id == profile_id && inventory(&client).await.is_some() => return dash_server_status(app.clone()).await,
        Some(_) => engine.kill(),
        None if inventory(&client).await.is_some() => return dash_server_status(app.clone()).await,
        None => {}
    }
    let instance = state.data_dir.join("dash-server");
    std::fs::create_dir_all(&instance)?;
    let verify_tls = verifies_certificate(&profile.ssl_mode);
    let env = bootstrap_env(
        &instance.to_string_lossy(),
        &server_profile_name(&profile.name, &profile.id),
        &profile.host,
        profile.port,
        &profile.username,
        &password,
        verify_tls,
    );
    let mut cmd = crate::process::command(&bin);
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
    for (k, v) in &env {
        cmd.env(k, v);
    }
    let child = cmd.spawn().map_err(|e| AppError::Storage(format!("Could not start dash-server: {e}")))?;
    {
        let mut guard = engine.child.lock().map_err(|_| AppError::Storage("dash-server state poisoned".into()))?;
        *guard = Some((child, profile.id.clone(), profile.name.clone()));
    }
    let deadline = Instant::now() + Duration::from_secs(40);
    while Instant::now() < deadline {
        if inventory(&client).await.is_some() {
            notify_agent(&app).await;
            return dash_server_status(app.clone()).await;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    engine.kill();
    Err(AppError::Storage("dash-server did not answer within 40 seconds.".into()))
}

/// Stop the server Studio started; one it adopted is left alone.
#[tauri::command]
pub async fn dash_server_stop(app: AppHandle) -> AppResult<()> {
    app.state::<DashServer>().kill();
    Ok(())
}

/// The hosted apps, from the server's own inventory.
#[tauri::command]
pub async fn dash_server_apps() -> AppResult<Vec<DashApp>> {
    let inv = inventory(&reqwest::Client::new())
        .await
        .ok_or_else(|| AppError::Storage("dash-server is not answering. Start it for a connection first.".into()))?;
    Ok(apps_from(&inv))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_names_become_slugs() {
        assert_eq!(profile_slug("Prod warehouse (EU)"), "prod-warehouse-eu");
        assert_eq!(profile_slug("Exasol Personal (local)"), "exasol-personal-local");
        assert_eq!(profile_slug("***"), "studio");
        assert!(profile_slug(&"x".repeat(100)).len() <= 48);
    }

    #[test]
    fn the_bootstrap_environment_carries_the_connection_and_only_there_the_password() {
        let env = bootstrap_env("/data/dash", "Prod warehouse", "db.internal", 8563, "analyst", "s3cret", true);
        let get = |k: &str| env.iter().find(|(kk, _)| kk == k).map(|(_, v)| v.as_str());
        assert_eq!(get("DASH_SERVER_PORT"), Some("5100"));
        assert_eq!(get("DASH_SERVER_INSTANCE_PATH"), Some("/data/dash"));
        assert_eq!(get("DASH_SERVER_EXASOL_PROFILE_NAME"), Some("Prod warehouse"), "the caller passes the server profile name it derived");
        assert_eq!(get("DASH_SERVER_EXASOL_DSN"), Some("db.internal:8563"));
        assert_eq!(get("DASH_SERVER_EXASOL_USER"), Some("analyst"));
        assert_eq!(get("DASH_SERVER_EXASOL_SECRET_ENV_VAR"), Some("EXA_PASSWORD"));
        assert_eq!(get("EXA_PASSWORD"), Some("s3cret"));
        assert_eq!(get("DASH_SERVER_EXASOL_OVERWRITE"), Some("true"));
        assert_eq!(get("DASH_SERVER_EXASOL_TLS_VERIFY"), None, "verification stays on when the profile verifies");
        let relaxed = bootstrap_env("/d", "p", "h", 1, "u", "pw", false);
        assert_eq!(relaxed.iter().find(|(k, _)| k == "DASH_SERVER_EXASOL_TLS_VERIFY").map(|(_, v)| v.as_str()), Some("false"));
    }

    #[test]
    fn tls_modes_that_verify_are_the_verify_ones() {
        for m in ["verify_ca", "verify_identity", "verify-full"] {
            assert!(verifies_certificate(m), "{m}");
        }
        for m in ["preferred", "required", "disabled", ""] {
            assert!(!verifies_certificate(m), "{m}");
        }
    }

    #[test]
    fn server_profile_names_are_readable_and_unique_per_connection() {
        assert_eq!(server_profile_name("Prod warehouse", "ab12cd34-ef56"), "prod-warehouse-ab12cd34");
        assert_ne!(server_profile_name("Prod", "id-one"), server_profile_name("Prod", "id-two"));
        assert_eq!(server_profile_name("Prod", ""), "prod");
        assert!(server_profile_name(&"x".repeat(80), "12345678").len() <= 48);
    }

    #[test]
    fn routes_stay_on_the_server() {
        for ok in ["/apps/demo", "/apps/sales_2026", "/preview/demo/3"] {
            assert!(valid_route(ok), "{ok}");
        }
        for bad in ["//attacker.example/apps/x", "/apps/../mcp", "http://x/apps/demo", "/mcp", "/apps/a b", "@evil/apps/x"] {
            assert!(!valid_route(bad), "{bad:?} must be refused");
        }
        let inv = json!({"apps": [{"name": "evil", "route": "//attacker.example/apps/evil"}, {"name": "ok", "route": "/apps/ok"}]});
        assert_eq!(apps_from(&inv).iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), vec!["ok"]);
    }

    #[test]
    fn apps_are_read_from_the_inventory() {
        let inv = json!({"apps": [
            {"name": "demo", "title": "Demo Dashboard", "route": "/apps/demo", "status": "running", "published": true},
            {"name": "sales", "status": "stopped"},
            {"title": "nameless"}
        ]});
        let apps = apps_from(&inv);
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0], DashApp { name: "demo".into(), title: "Demo Dashboard".into(), route: "/apps/demo".into(), status: "running".into(), published: true });
        assert_eq!(apps[1].route, "/apps/sales");
        assert_eq!(apps[1].title, "sales");
        assert!(apps_from(&json!({})).is_empty());
    }
}
