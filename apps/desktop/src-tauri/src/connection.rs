use std::net::ToSocketAddrs;
use std::str::FromStr;
use std::time::{Duration, Instant};

use serde::Serialize;
use sqlx_exasol::{ExaConnectOptions, ExaPool, Exasol};
use tauri::State;

use crate::error::{humanize_db_error, AppError, AppResult};
use crate::profiles::{find_profile, touch_profile, ConnectionProfile};
use crate::query::fetch_all_rows;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub reachable: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
}

/// TCP-level reachability check: can we open a socket to host:port?
/// This is the first step Test/Connect run so we can tell "server unreachable"
/// apart from "credentials rejected".
#[tauri::command]
pub async fn ping_server(host: String, port: u16) -> AppResult<PingResult> {
    let target = format!("{}:{}", host.trim(), port);
    let started = Instant::now();

    let outcome = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut addrs = target
            .to_socket_addrs()
            .map_err(|e| format!("failed to lookup host: {e}"))?;
        let addr = addrs
            .next()
            .ok_or_else(|| "could not resolve host".to_string())?;
        std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(6))
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(match outcome {
        Ok(()) => PingResult {
            reachable: true,
            latency_ms: started.elapsed().as_millis() as u64,
            error: None,
        },
        Err(raw) => PingResult {
            reachable: false,
            latency_ms: 0,
            error: Some(humanize_db_error(&raw)),
        },
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub database_name: Option<String>,
    pub version: Option<String>,
    pub current_user: String,
    pub current_schema: Option<String>,
    pub session_id: String,
    pub nodes: Option<i64>,
}

fn percent_encode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

pub fn build_connect_options(profile: &ConnectionProfile) -> AppResult<ExaConnectOptions> {
    let mut url = format!(
        "exa://{}:{}@{}:{}",
        percent_encode(&profile.username),
        percent_encode(&profile.password),
        profile.host.trim(),
        profile.port
    );

    let mut params: Vec<String> = Vec::new();
    if profile.ssl_mode != "preferred" {
        params.push(format!("ssl-mode={}", profile.ssl_mode));
    }
    if profile.compression {
        params.push("compression=enabled".to_string());
    }
    if let Some(schema) = profile.schema.as_deref().filter(|s| !s.trim().is_empty()) {
        params.push(format!("schema={}", percent_encode(schema.trim())));
    }
    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }

    ExaConnectOptions::from_str(&url)
        .map_err(|err| AppError::InvalidSettings(err.to_string()))
}

async fn open_pool(profile: &ConnectionProfile) -> AppResult<ExaPool> {
    let options = build_connect_options(profile)?;
    let pool = sqlx_exasol::pool::PoolOptions::<Exasol>::new()
        .min_connections(0)
        .max_connections(4)
        .acquire_timeout(std::time::Duration::from_secs(20))
        .connect_with(options)
        .await?;
    Ok(pool)
}

async fn read_server_info(pool: &ExaPool) -> AppResult<ServerInfo> {
    let session = fetch_all_rows(
        pool,
        "SELECT CURRENT_USER, CURRENT_SCHEMA, TO_CHAR(CURRENT_SESSION) FROM SYS.DUAL",
    )
    .await?;
    let meta = fetch_all_rows(
        pool,
        "SELECT PARAM_NAME, PARAM_VALUE FROM SYS.EXA_METADATA \
         WHERE PARAM_NAME IN ('databaseName', 'databaseProductVersion', 'nodeCount')",
    )
    .await
    .unwrap_or_default();

    let mut database_name = None;
    let mut version = None;
    let mut nodes = None;
    for row in &meta {
        let name = row.first().and_then(|v| v.as_str()).unwrap_or_default();
        let value = row.get(1).and_then(|v| v.as_str()).map(str::to_string);
        match name {
            "databaseName" => database_name = value,
            "databaseProductVersion" => version = value,
            "nodeCount" => nodes = value.and_then(|v| v.parse().ok()),
            _ => {}
        }
    }

    let first = session.first();
    Ok(ServerInfo {
        database_name,
        version,
        current_user: first
            .and_then(|r| r.first())
            .and_then(|v| v.as_str())
            .unwrap_or("?")
            .to_string(),
        current_schema: first
            .and_then(|r| r.get(1))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        session_id: first
            .and_then(|r| r.get(2))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        nodes,
    })
}

/// Validate settings by opening a short-lived connection and reading server metadata.
#[tauri::command]
pub async fn test_connection(profile: ConnectionProfile) -> AppResult<ServerInfo> {
    let pool = open_pool(&profile).await?;
    let info = read_server_info(&pool).await;
    pool.close().await;
    info
}

/// Open (or reuse) a pool for a saved profile and return server info.
#[tauri::command]
pub async fn connect(state: State<'_, AppState>, profile_id: String) -> AppResult<ServerInfo> {
    let profile = find_profile(&state, &profile_id)?;

    {
        let pools = state.pools.read().await;
        if let Some(pool) = pools.get(&profile_id) {
            return read_server_info(pool).await;
        }
    }

    let pool = open_pool(&profile).await?;
    let info = read_server_info(&pool).await?;
    state.pools.write().await.insert(profile_id.clone(), pool);
    touch_profile(&state, &profile_id)?;
    Ok(info)
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>, profile_id: String) -> AppResult<()> {
    if let Some(pool) = state.pools.write().await.remove(&profile_id) {
        pool.close().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_open_connections(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    Ok(state.pools.read().await.keys().cloned().collect())
}

/// Fetch the pool for a connected profile, or a typed error if not connected.
pub async fn require_pool(state: &AppState, profile_id: &str) -> AppResult<ExaPool> {
    state
        .pools
        .read()
        .await
        .get(profile_id)
        .cloned()
        .ok_or_else(|| AppError::NotConnected(profile_id.to_string()))
}
