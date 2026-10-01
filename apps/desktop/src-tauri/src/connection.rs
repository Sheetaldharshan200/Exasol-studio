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
pub async fn ping_server(state: State<'_, AppState>, host: String, port: u16) -> AppResult<PingResult> {
    let timeout = connect_timeout(&state);
    let target = format!("{}:{}", host.trim(), port);
    let started = Instant::now();

    let outcome = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut addrs = target
            .to_socket_addrs()
            .map_err(|e| format!("failed to lookup host: {e}"))?;
        let addr = addrs
            .next()
            .ok_or_else(|| "could not resolve host".to_string())?;
        std::net::TcpStream::connect_timeout(&addr, timeout)
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
    ExaConnectOptions::from_str(&connect_url(profile)).map_err(|err| AppError::InvalidSettings(err.to_string()))
}

/// The driver URL for a profile (password included — never shown or logged).
/// With a token sign-in no user or password is sent: the token goes as
/// `access-token` / `refresh-token`.
pub(crate) fn connect_url(profile: &ConnectionProfile) -> String {
    let token = matches!(profile.auth_method.as_str(), "access_token" | "refresh_token");
    let mut url = if token {
        format!("exa://{}:{}", profile.host.trim(), profile.port)
    } else {
        format!(
            "exa://{}:{}@{}:{}",
            percent_encode(&profile.username),
            percent_encode(&profile.password),
            profile.host.trim(),
            profile.port
        )
    };

    let mut params: Vec<String> = Vec::new();
    let ssl_mode = crate::tls_trust::effective_ssl_mode(&profile.ssl_mode, profile.fingerprint.is_some());
    if ssl_mode != "preferred" {
        params.push(format!("ssl-mode={ssl_mode}"));
    }
    if let Some(ca) = profile.ssl_ca.as_deref().filter(|_| profile.fingerprint.is_none()) {
        params.push(format!("ssl-ca={}", percent_encode(ca)));
    }
    match profile.auth_method.as_str() {
        "access_token" => params.push(format!("access-token={}", percent_encode(&profile.password))),
        "refresh_token" => params.push(format!("refresh-token={}", percent_encode(&profile.password))),
        _ => {}
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
    url
}

pub(crate) async fn open_pool(profile: &ConnectionProfile) -> AppResult<ExaPool> {
    open_pool_sized(profile, 4, Vec::new(), connect_timeout_from(None)).await
}

/// Settings → Database → Connect timeout: how long reaching the server and
/// logging in may take. 15 s unless set; kept within 1–120 s.
pub(crate) fn connect_timeout_from(ms: Option<serde_json::Value>) -> Duration {
    let ms = ms.and_then(|v| v.as_f64()).filter(|n| n.is_finite()).unwrap_or(15_000.0);
    Duration::from_millis(ms.clamp(1_000.0, 120_000.0) as u64)
}

pub(crate) fn connect_timeout(state: &AppState) -> Duration {
    connect_timeout_from(crate::settings::app_setting(state, "connectTimeoutMs"))
}

async fn open_pool_sized(
    profile: &ConnectionProfile,
    max_connections: u32,
    connect_hooks: Vec<String>,
    timeout: Duration,
) -> AppResult<ExaPool> {
    let options = build_connect_options(profile)?;
    let mut opts = sqlx_exasol::pool::PoolOptions::<Exasol>::new()
        .min_connections(0)
        .max_connections(max_connections.clamp(1, 16))
        .acquire_timeout(timeout);
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

const SESSION_SQL: &str = "SELECT CURRENT_USER, CURRENT_SCHEMA, TO_CHAR(CURRENT_SESSION) FROM SYS.DUAL";
const META_SQL: &str = "SELECT PARAM_NAME, PARAM_VALUE FROM SYS.EXA_METADATA \
     WHERE PARAM_NAME IN ('databaseName', 'databaseProductVersion', 'nodeCount')";

async fn read_server_info(pool: &ExaPool) -> AppResult<ServerInfo> {
    let session = fetch_all_rows(pool, SESSION_SQL).await?;
    let meta = fetch_all_rows(pool, META_SQL).await.unwrap_or_default();
    Ok(server_info_from(&session, &meta))
}

/// ServerInfo from the rows of SESSION_SQL and META_SQL, whichever driver ran them.
fn server_info_from(session: &[Vec<serde_json::Value>], meta: &[Vec<serde_json::Value>]) -> ServerInfo {
    let mut database_name = None;
    let mut version = None;
    let mut nodes = None;
    for row in meta {
        let name = row.first().and_then(|v| v.as_str()).unwrap_or_default();
        let value = row.get(1).map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()));
        match name {
            "databaseName" => database_name = value,
            "databaseProductVersion" => version = value,
            "nodeCount" => nodes = value.and_then(|v| v.parse().ok()),
            _ => {}
        }
    }
    let cell = |i: usize| session.first().and_then(|r| r.get(i)).map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()));
    ServerInfo {
        database_name,
        version,
        current_user: cell(0).unwrap_or_else(|| "?".into()),
        current_schema: cell(1).filter(|s| s != "null"),
        session_id: cell(2).unwrap_or_default(),
        nodes,
    }
}

/// Choose a CA certificate file (PEM) in the system dialog; its full path.
#[tauri::command]
pub async fn pick_ca_file(app: tauri::AppHandle) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title("CA certificate").add_filter("Certificate", &["pem", "crt", "cer"]).blocking_pick_file()
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(picked.and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().into_owned()))
}

/// The SHA-256 fingerprint of the certificate a server presents now — for the
/// form's "Read from server", and to compare with what an administrator says.
#[tauri::command]
pub async fn server_certificate(state: State<'_, AppState>, host: String, port: u16) -> AppResult<String> {
    let host = crate::tls_trust::first_host(host.trim().split('/').next().unwrap_or_default());
    crate::tls_trust::server_fingerprint(&host, port, connect_timeout(&state)).await.map_err(AppError::Database)
}

/// Open a pool and read the server's info, with the TLS trust rules: a pinned
/// certificate is checked first; a certificate that fails verification while
/// nothing is pinned comes back as `UntrustedCertificate` with its
/// fingerprint, so the person can choose to trust it.
async fn open_checked(profile: &ConnectionProfile, size: u32, hooks: Vec<String>, timeout: Duration) -> AppResult<(ExaPool, ServerInfo)> {
    crate::tls_trust::check_pin(&profile.host, profile.port, profile.fingerprint.as_deref(), timeout).await?;
    let opened = match open_pool_sized(profile, size, hooks, timeout).await {
        Ok(pool) => match read_server_info(&pool).await {
            Ok(info) => Ok((pool, info)),
            Err(e) => {
                pool.close().await;
                Err(e)
            }
        },
        Err(e) => Err(e),
    };
    match opened {
        Err(e) if profile.fingerprint.is_none() && crate::tls_trust::is_untrusted_certificate(&e.to_string()) => {
            let host = crate::tls_trust::first_host(&profile.host);
            match crate::tls_trust::server_fingerprint(&host, profile.port, timeout).await {
                Ok(fingerprint) => Err(AppError::UntrustedCertificate { fingerprint }),
                Err(_) => Err(e),
            }
        }
        Err(AppError::Database(m)) => Err(AppError::Database(crate::error::with_saas_hint(&profile.host, m))),
        other => other,
    }
}

/// Validate settings by opening a short-lived connection and reading server metadata.
#[tauri::command]
pub async fn test_connection(app: tauri::AppHandle, state: State<'_, AppState>, mut profile: ConnectionProfile) -> AppResult<ServerInfo> {
    // Editing a saved connection leaves the secret blank (the stored one is
    // kept on save); test with the stored one too.
    if profile.password.is_empty() && !profile.id.is_empty() {
        if let Ok(saved) = find_profile(&state, &profile.id) {
            profile.password = saved.password;
        }
    }
    crate::profile_check::validate_profile(&mut profile)?;
    if crate::exarrow_exec::is_exarrow(&profile.driver_id) || crate::driver_exec::is_bridge_driver(&profile.driver_id) {
        return test_with_driver(app, &state, profile).await;
    }
    let (pool, info) = open_checked(&profile, 4, Vec::new(), connect_timeout(&state)).await?;
    pool.close().await;
    Ok(info)
}

/// Test with the connection's own driver (exarrow, or a bridge runtime): the
/// same two reads the native path does, through that driver.
async fn test_with_driver(app: tauri::AppHandle, state: &AppState, profile: ConnectionProfile) -> AppResult<ServerInfo> {
    if let Some(why) = crate::tls_trust::bridge_unsupported(profile.ssl_ca.as_deref(), &profile.auth_method) {
        return Err(AppError::InvalidSettings(why));
    }
    crate::tls_trust::check_pin(&profile.host, profile.port, profile.fingerprint.as_deref(), connect_timeout(state)).await?;
    let stmts = vec![SESSION_SQL.to_string(), META_SQL.to_string()];
    let stop = crate::query::StopPolicy::default();
    let resp = if crate::exarrow_exec::is_exarrow(&profile.driver_id) {
        crate::exarrow_exec::execute_exarrow(&profile, &stmts, 10, stop).await?
    } else {
        tokio::task::spawn_blocking(move || crate::driver_exec::execute_via_driver(&app, &profile, &stmts, 10, stop))
            .await
            .map_err(|e| AppError::Storage(e.to_string()))??
    };
    if let Some(err) = resp.results.iter().find_map(|r| r.error.as_deref()) {
        return Err(AppError::Database(humanize_db_error(err)));
    }
    let rows = |i: usize| resp.results.get(i).map(|r| r.rows.clone()).unwrap_or_default();
    Ok(server_info_from(&rows(0), &rows(1)))
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

    let (pool, info) = open_checked(&profile, pool_size, connect_hooks, connect_timeout(&state)).await?;

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

    // Two connects can race (a double click, a reload re-adopting while the
    // person clicks). The first pool in wins; a later one is closed rather
    // than overwriting it and leaking its connections and keep-alive task.
    {
        let mut pools = state.pools.write().await;
        if let Some(existing) = pools.get(&profile_id).cloned() {
            drop(pools);
            pool.close().await;
            return read_server_info(&existing).await;
        }
        pools.insert(profile_id.clone(), pool.clone());
    }
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
    // The tabs' own sessions go first. The UI has already asked Commit / Roll
    // back for any with uncommitted changes; what is still open rolls back.
    state.sessions.close_profile(&profile_id).await;
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
/// Whether a connected profile's database still answers a query — more
/// than "the port is open": the session logs in and runs `SELECT 1`. A pool
/// whose connections are all busy (a long query) counts as alive.
#[tauri::command]
pub async fn connection_alive(state: State<'_, AppState>, profile_id: String) -> AppResult<bool> {
    let pool = require_pool(&state, &profile_id).await?;
    let wait = std::time::Duration::from_secs(5);
    let probe = match tokio::time::timeout(wait, pool.acquire()).await {
        Err(_) => Probe::Busy,
        Ok(Err(_)) => Probe::CannotConnect,
        Ok(Ok(mut conn)) => match tokio::time::timeout(wait, sqlx_exasol::query("SELECT 1").execute(&mut *conn)).await {
            Ok(Ok(_)) => Probe::Answered,
            _ => Probe::NoAnswer,
        },
    };
    Ok(probe_alive(probe))
}

/// What the health probe found.
#[derive(Debug, Clone, Copy)]
pub enum Probe {
    /// Every pooled connection is in use (a long query): the database is working.
    Busy,
    CannotConnect,
    Answered,
    /// Connected, but `SELECT 1` failed or did not answer in time.
    NoAnswer,
}

pub fn probe_alive(probe: Probe) -> bool {
    matches!(probe, Probe::Busy | Probe::Answered)
}

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
    fn draft(auth: &str, ssl: &str) -> crate::profiles::ConnectionProfile {
        crate::profiles::ConnectionProfile {
            id: "p".into(),
            name: "p".into(),
            host: "db.example.com".into(),
            port: 8563,
            username: "sys".into(),
            password: "p@ss/word".into(),
            schema: None,
            notes: None,
            ssl_mode: ssl.into(),
            compression: false,
            driver_id: "sqlx-exasol".into(),
            created_at: None,
            last_used_at: None,
            fingerprint: None,
            ssl_ca: None,
            auth_method: auth.into(),
        }
    }

    #[test]
    fn server_info_reads_the_same_rows_from_any_driver() {
        use serde_json::json;
        let session = vec![vec![json!("SYS"), json!(null), json!("1234567890123")]];
        let meta = vec![
            vec![json!("databaseName"), json!("exa_db")],
            vec![json!("databaseProductVersion"), json!("8.34.0")],
            vec![json!("nodeCount"), json!(4)],
        ];
        let info = super::server_info_from(&session, &meta);
        assert_eq!(info.current_user, "SYS");
        assert_eq!(info.current_schema, None);
        assert_eq!(info.session_id, "1234567890123");
        assert_eq!(info.database_name.as_deref(), Some("exa_db"));
        assert_eq!(info.version.as_deref(), Some("8.34.0"));
        assert_eq!(info.nodes, Some(4), "a number from a bridge, not only a string");
        let empty = super::server_info_from(&[], &[]);
        assert_eq!((empty.current_user.as_str(), empty.session_id.as_str()), ("?", ""));
    }

    #[test]
    fn the_driver_url_carries_the_sign_in_and_the_trust_settings() {
        let p = draft("password", "verify_identity");
        assert_eq!(super::connect_url(&p), "exa://sys:p%40ss%2Fword@db.example.com:8563?ssl-mode=verify_identity&compression=disabled");
        let mut t = draft("access_token", "verify_identity");
        t.password = "tok.en".into();
        let u = super::connect_url(&t);
        assert!(u.starts_with("exa://db.example.com:8563?"), "no user or password with a token: {u}");
        assert!(u.contains("access-token=tok.en"));
        let mut r = draft("refresh_token", "required");
        r.password = "r1".into();
        assert!(super::connect_url(&r).contains("refresh-token=r1"));
        let mut ca = draft("password", "verify_ca");
        ca.ssl_ca = Some("/etc/ssl/exa ca.pem".into());
        assert!(super::connect_url(&ca).contains("ssl-ca=%2Fetc%2Fssl%2Fexa%20ca.pem"));
        let mut pinned = ca.clone();
        pinned.fingerprint = Some("AB".repeat(32));
        let u = super::connect_url(&pinned);
        assert!(u.contains("ssl-mode=required") && !u.contains("ssl-ca"), "the pin replaces the CA check: {u}");
        assert!(super::build_connect_options(&pinned).is_ok());
        assert!(super::build_connect_options(&t).is_ok());
    }

    #[test]
    fn the_connect_timeout_setting_is_used_within_bounds() {
        use serde_json::json;
        use std::time::Duration;
        assert_eq!(super::connect_timeout_from(None), Duration::from_secs(15));
        assert_eq!(super::connect_timeout_from(Some(json!(5000))), Duration::from_secs(5));
        assert_eq!(super::connect_timeout_from(Some(json!(10))), Duration::from_secs(1), "clamped up");
        assert_eq!(super::connect_timeout_from(Some(json!(9_999_999))), Duration::from_secs(120), "clamped down");
        assert_eq!(super::connect_timeout_from(Some(json!("fast"))), Duration::from_secs(15));
    }

    #[test]
    fn the_health_dot_is_green_only_for_a_database_that_works() {
        use super::{probe_alive, Probe};
        assert!(probe_alive(Probe::Answered));
        assert!(probe_alive(Probe::Busy), "all connections busy with a long query is alive");
        assert!(!probe_alive(Probe::CannotConnect));
        assert!(!probe_alive(Probe::NoAnswer));
    }

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
            fingerprint: None,
            ssl_ca: None,
            auth_method: "password".into(),
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

#[cfg(test)]
mod live_trust {
    //! EXASOL_LIVE_PORT=8565 EXASOL_LIVE_PASSWORD=… cargo test --lib connection::live_trust -- --ignored
    use crate::error::AppError;
    use std::time::Duration;

    #[tokio::test]
    #[ignore = "needs a live database (EXASOL_LIVE_* env)"]
    async fn a_self_signed_server_is_offered_for_trust_then_pinned() {
        let port: u16 = std::env::var("EXASOL_LIVE_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8563);
        let mut p = crate::profiles::ConnectionProfile {
            id: "live".into(),
            name: "live".into(),
            host: "127.0.0.1".into(),
            port,
            username: "sys".into(),
            password: std::env::var("EXASOL_LIVE_PASSWORD").expect("EXASOL_LIVE_PASSWORD"),
            schema: None,
            notes: None,
            ssl_mode: "verify_identity".into(),
            compression: false,
            driver_id: "sqlx-exasol".into(),
            created_at: None,
            last_used_at: None,
            fingerprint: None,
            ssl_ca: None,
            auth_method: "password".into(),
        };
        let t = Duration::from_secs(15);
        // Verify, nothing pinned: a self-signed local database is offered for trust.
        let fp = match super::open_checked(&p, 1, Vec::new(), t).await {
            Err(AppError::UntrustedCertificate { fingerprint }) => fingerprint,
            other => panic!("expected an untrusted certificate, got {:?}", other.map(|_| ())),
        };
        assert_eq!(fp.len(), 64);
        assert_eq!(crate::tls_trust::server_fingerprint("127.0.0.1", port, t).await.unwrap(), fp, "stable");
        // Trusted: pinned, it connects.
        p.fingerprint = Some(fp.clone());
        let (pool, info) = super::open_checked(&p, 1, Vec::new(), t).await.expect("pinned connect");
        assert!(info.version.is_some());
        pool.close().await;
        // A different pin: the change is reported, nothing connects.
        p.fingerprint = Some("00".repeat(32));
        match super::open_checked(&p, 1, Vec::new(), t).await {
            Err(AppError::CertificateChanged { actual, .. }) => assert_eq!(actual, fp),
            other => panic!("expected a changed certificate, got {:?}", other.map(|_| ())),
        }
    }
}
