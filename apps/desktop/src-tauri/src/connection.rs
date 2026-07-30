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
    // The sqlx-exasol driver accepts only disabled | preferred | required for
    // the `compression` parameter (NOT "enabled" — that raised "invalid
    // connection parameter: compression"). Map our boolean explicitly so OFF is
    // truly off: omitting it would fall back to the driver default `preferred`,
    // which still compresses when the feature is compiled in.
    params.push(format!(
        "compression={}",
        if profile.compression { "required" } else { "disabled" }
    ));
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
    open_pool_sized(profile, 4, Vec::new()).await
}

async fn open_pool_sized(
    profile: &ConnectionProfile,
    max_connections: u32,
    connect_hooks: Vec<String>,
) -> AppResult<ExaPool> {
    let options = build_connect_options(profile)?;
    let mut opts = sqlx_exasol::pool::PoolOptions::<Exasol>::new()
        .min_connections(0)
        .max_connections(max_connections.clamp(1, 16))
        .acquire_timeout(std::time::Duration::from_secs(20));
    // Turn query profiling ON for every pooled session so a query the user runs
    // is profiled DURING its normal execution — the Query Performance view then
    // just flushes + reads that profile instead of re-running the query (which
    // is why the plan appears instantly, like the VS Code extension). Prepended
    // so it runs before any user-configured hooks.
    let mut hooks = vec!["ALTER SESSION SET PROFILE = 'ON'".to_string()];
    hooks.extend(connect_hooks);
    // Run-SQL-at-Connect hooks must apply to EVERY physical session, not a
    // one-shot connection that's returned to the pool — otherwise a session
    // setting like ALTER SESSION never reaches the connection a later query
    // acquires. after_connect fires as each pooled connection is established,
    // best-effort (a bad hook logs, never fails the connection).
    {
        opts = opts.after_connect(move |conn, _meta| {
            let hooks = hooks.clone();
            Box::pin(async move {
                for stmt in &hooks {
                    if let Err(e) = sqlx_exasol::query(sqlx_exasol::AssertSqlSafe(stmt.clone()))
                        .execute(&mut *conn)
                        .await
                    {
                        eprintln!("connection hook statement failed: {e}");
                    }
                }
                Ok(())
            })
        });
    }
    let pool = opts.connect_with(options).await?;
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
/// Honors the Connection Properties: pool size (single shared physical
/// connection), Run-SQL-at-Connect hooks, and the keep-alive loop.
#[tauri::command]
pub async fn connect(state: State<'_, AppState>, profile_id: String) -> AppResult<ServerInfo> {
    let profile = find_profile(&state, &profile_id)?;

    {
        let pools = state.pools.read().await;
        if let Some(pool) = pools.get(&profile_id) {
            return read_server_info(pool).await;
        }
    }

    let settings = crate::connection_settings::read_settings(&state, &profile_id);
    let single = crate::connection_settings::bool_at(&settings, &["physical", "singleConnection"]).unwrap_or(false);
    let pool_size = if single {
        1
    } else {
        crate::connection_settings::num_at(&settings, &["driver", "connectionPoolSize"]).unwrap_or(4) as u32
    };

    // Run SQL at Connect (Connection Hooks): applied to every pooled session
    // via after_connect (see open_pool_sized) so it actually reaches the
    // connections that later queries acquire.
    let connect_hooks: Vec<String> =
        if crate::connection_settings::bool_at(&settings, &["hooks", "connectEnabled"]).unwrap_or(false) {
            crate::connection_settings::str_at(&settings, &["hooks", "connectSql"])
                .map(|sql| sql.split(';').map(str::trim).filter(|s| !s.is_empty()).map(String::from).collect())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

    let pool = open_pool_sized(&profile, pool_size, connect_hooks).await?;
    let info = read_server_info(&pool).await?;

    // Connection Keep-Alive: validate on an interval while the pool lives.
    // The task holds only a pool clone; pool.close() (disconnect) ends it.
    if crate::connection_settings::bool_at(&settings, &["physical", "keepAlive"]).unwrap_or(false) {
        let idle = crate::connection_settings::num_at(&settings, &["physical", "idleSeconds"])
            .unwrap_or(120)
            .max(10);
        let validation = crate::connection_settings::str_at(&settings, &["physical", "validationSql"])
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("SELECT 1")
            .to_string();
        let ka_pool = pool.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(idle)).await;
                if ka_pool.is_closed() {
                    break;
                }
                let _ = fetch_all_rows(&ka_pool, &validation).await;
            }
        });
    }

    state.pools.write().await.insert(profile_id.clone(), pool);
    touch_profile(&state, &profile_id)?;
    Ok(info)
}

/// Run hook SQL (one or more ;-separated statements) best-effort.
async fn run_hook_sql(pool: &ExaPool, sql: &str) {
    for stmt in sql.split(';').map(str::trim).filter(|s| !s.is_empty()) {
        if let Err(e) = sqlx_exasol::query(sqlx_exasol::AssertSqlSafe(stmt.to_string()))
            .execute(pool)
            .await
        {
            eprintln!("connection hook statement failed: {e}");
        }
    }
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>, profile_id: String) -> AppResult<()> {
    if let Some(pool) = state.pools.write().await.remove(&profile_id) {
        let settings = crate::connection_settings::read_settings(&state, &profile_id);
        // Run SQL at Disconnect (Connection Hooks) while the pool still lives.
        if crate::connection_settings::bool_at(&settings, &["hooks", "disconnectEnabled"]).unwrap_or(false) {
            if let Some(sql) = crate::connection_settings::str_at(&settings, &["hooks", "disconnectSql"]) {
                run_hook_sql(&pool, sql).await;
            }
        }
        pool.close().await;
        // Password policy "Clear at Disconnect": blank the stored password so
        // the next connect prompts for it.
        if crate::connection_settings::str_at(&settings, &["auth", "passwordPolicy"]) == Some("clear") {
            let _ = crate::profiles::clear_profile_password(&state, &profile_id);
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(compression: bool) -> ConnectionProfile {
        ConnectionProfile {
            id: "t".into(),
            name: "t".into(),
            host: "127.0.0.1".into(),
            port: 8565,
            username: "sys".into(),
            password: "exasol".into(),
            schema: None,
            notes: None,
            ssl_mode: "preferred".into(),
            compression,
            driver_id: "sqlx-exasol".into(),
            created_at: None,
            last_used_at: None,
        }
    }

    // Regression: the driver accepts only disabled|preferred|required for the
    // `compression` param. We once sent `compression=enabled`, which made
    // ExaConnectOptions::from_str fail with "invalid connection parameter:
    // compression". Both boolean states must now parse cleanly.
    #[test]
    fn compression_maps_to_a_valid_driver_value() {
        assert!(build_connect_options(&profile(true)).is_ok(), "compression=true must parse");
        assert!(build_connect_options(&profile(false)).is_ok(), "compression=false must parse");
    }
}
