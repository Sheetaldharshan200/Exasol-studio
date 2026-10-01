//! One database session per SQL tab.
//!
//! Every statement a tab runs — including OPEN SCHEMA, ALTER SESSION, COMMIT
//! and ROLLBACK — runs on that tab's own connection, taken from the pool and
//! detached from it for the tab's life. Before, each run took any free
//! connection of a pool of four, so session state landed on a random session
//! and the Commit button could commit a session that had done nothing.
//!
//! Manual commit (autocommit off) follows the practice in design.md: the
//! transaction belongs to the tab's session and ends only with it; Studio never
//! commits on its own; uncommitted work is counted and shown; a lost session
//! is reported as rolled back.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use sqlx_core::transaction::TransactionManager;
use sqlx_exasol::{AssertSqlSafe, ExaConnection, ExaTransactionManager, Executor, Row};
use tauri::State;
use tokio::sync::{Mutex, OwnedMutexGuard};

use crate::connection::require_pool;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub struct TabSession {
    pub profile_id: String,
    pub conn: ExaConnection,
    pub session_id: Option<String>,
    /// Manual commit: the tab's transaction stays open until Commit/Roll back.
    pub manual: bool,
    /// Statements since the last commit/rollback that changed something.
    pub changes: Vec<String>,
    pub last_used: Instant,
}

/// The tab sessions of the whole app: tab id → its session.
#[derive(Default)]
pub struct TabSessions(Mutex<HashMap<String, Arc<Mutex<TabSession>>>>);

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: Option<String>,
    pub schema: Option<String>,
    pub autocommit: bool,
    /// How many statements are uncommitted (manual mode only).
    pub changes: usize,
    /// The most recent of them, for "what would be lost".
    pub recent: Vec<String>,
    pub idle_seconds: u64,
}

const RECENT: usize = 10;

/// Whether a statement that ran leaves something to commit. Reads, session
/// settings and transaction control do not; everything else does — DDL in
/// Exasol is transactional too.
pub fn counts_as_change(statement: &str) -> bool {
    let head = crate::query::strip_leading_comments(statement).trim_start().to_ascii_uppercase();
    let first = head.split_whitespace().next().unwrap_or("");
    !matches!(
        first,
        "" | "SELECT" | "WITH" | "VALUES" | "EXPLAIN" | "DESCRIBE" | "DESC" | "SHOW" | "OPEN" | "CLOSE" | "COMMIT" | "ROLLBACK" | "PROFILE" | "FLUSH" | "KILL" | "RECOMPRESS" | "ANALYZE"
    ) && !(first == "ALTER" && head.split_whitespace().nth(1) == Some("SESSION"))
}

/// Whether an error means the connection itself is gone (not a SQL error).
pub fn is_connection_lost(error: &str) -> bool {
    let e = error.to_ascii_lowercase();
    ["connection closed", "connection reset", "broken pipe", "websocket", "connection refused", "timed out while", "os error 54", "os error 32", "unexpected eof", "session does not exist", "session has been killed"]
        .iter()
        .any(|p| e.contains(p))
}

/// `OPEN SCHEMA` for a catalog name, quoted exactly.
pub fn open_schema_sql(schema: &str) -> String {
    format!("OPEN SCHEMA \"{}\"", schema.replace('"', "\"\""))
}

fn info_of(s: &mut TabSession) -> SessionInfo {
    SessionInfo {
        session_id: s.session_id.clone(),
        schema: s.conn.attributes().current_schema().map(str::to_string),
        autocommit: !s.manual,
        changes: if s.manual { s.changes.len() } else { 0 },
        recent: s.changes.iter().rev().take(RECENT).cloned().collect(),
        idle_seconds: s.last_used.elapsed().as_secs(),
    }
}

impl TabSessions {
    /// The tab's session, opened on first use. A tab that moved to another
    /// connection gets a fresh session (the old one is rolled back and closed).
    pub async fn checkout(&self, state: &AppState, profile_id: &str, tab_id: &str) -> AppResult<OwnedMutexGuard<TabSession>> {
        let existing = self.0.lock().await.get(tab_id).cloned();
        if let Some(slot) = existing {
            let guard = slot.lock_owned().await;
            if guard.profile_id == profile_id {
                return Ok(guard);
            }
            drop(guard);
            self.close(tab_id, false).await;
        }
        let pool = require_pool(state, profile_id).await?;
        let mut conn = pool.acquire().await.map_err(|e| AppError::Storage(e.to_string()))?.detach();
        if let Some(secs) = query_timeout_seconds(state, profile_id) {
            let _ = conn.attributes_mut().set_query_timeout(secs);
        }
        let session_id = sqlx_exasol::query("SELECT TO_CHAR(CURRENT_SESSION)")
            .fetch_one(&mut conn)
            .await
            .ok()
            .and_then(|r| r.try_get::<String, _>(0).ok());
        // The connection's own default decides how a new tab starts.
        let manual = !autocommit_default(state, profile_id);
        if manual {
            ExaTransactionManager::begin(&mut conn, None).await.map_err(|e| AppError::Storage(e.to_string()))?;
        }
        let slot = Arc::new(Mutex::new(TabSession {
            profile_id: profile_id.to_string(),
            conn,
            session_id,
            manual,
            changes: Vec::new(),
            last_used: Instant::now(),
        }));
        self.0.lock().await.insert(tab_id.to_string(), slot.clone());
        Ok(slot.lock_owned().await)
    }

    /// End a tab's session: commit or roll back what is open, then close.
    pub async fn close(&self, tab_id: &str, commit: bool) {
        let slot = self.0.lock().await.remove(tab_id);
        if let Some(slot) = slot {
            let mut s = slot.lock().await;
            if s.manual {
                let _ = if commit { ExaTransactionManager::commit(&mut s.conn).await } else { ExaTransactionManager::rollback(&mut s.conn).await };
            }
        }
    }

    /// Forget a session whose connection is gone; the server rolled it back.
    pub async fn drop_lost(&self, tab_id: &str) {
        self.0.lock().await.remove(tab_id);
    }

    /// Every session of a profile that holds uncommitted changes.
    pub async fn with_changes(&self, profile_id: Option<&str>) -> Vec<(String, usize)> {
        let slots: Vec<(String, Arc<Mutex<TabSession>>)> = self.0.lock().await.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        let mut out = Vec::new();
        for (tab, slot) in slots {
            let s = slot.lock().await;
            if s.manual && !s.changes.is_empty() && profile_id.is_none_or(|p| s.profile_id == p) {
                out.push((tab, s.changes.len()));
            }
        }
        out
    }

    /// Whether quitting might end uncommitted work — without waiting. A session
    /// busy with a running statement cannot be inspected, so it counts as yes:
    /// asking once too often is fine, losing work silently is not.
    pub fn might_have_changes_now(&self) -> bool {
        let Ok(map) = self.0.try_lock() else { return true };
        map.values().any(|slot| match slot.try_lock() {
            Ok(s) => s.manual && !s.changes.is_empty(),
            Err(_) => true,
        })
    }

    /// Close every session of a profile (disconnect), rolling back what is open.
    pub async fn close_profile(&self, profile_id: &str) {
        let tabs: Vec<String> = {
            let map = self.0.lock().await;
            let mut tabs = Vec::new();
            for (k, v) in map.iter() {
                if v.lock().await.profile_id == profile_id {
                    tabs.push(k.clone());
                }
            }
            tabs
        };
        for t in tabs {
            self.close(&t, false).await;
        }
    }
}

/// After a run on the session: count what changed, keep manual mode open.
pub async fn after_run(s: &mut TabSession, ran: &[(String, bool)]) {
    s.last_used = Instant::now();
    if !s.manual {
        return;
    }
    for (stmt, ok) in ran {
        if *ok && counts_as_change(stmt) {
            s.changes.push(stmt.chars().take(300).collect());
        }
    }
    // A COMMIT or ROLLBACK typed as SQL ends the transaction on the server;
    // start the next one so the tab stays in manual mode.
    if ran.iter().any(|(st, ok)| *ok && is_txn_end(st)) {
        s.changes.clear();
        let _ = ExaTransactionManager::begin(&mut s.conn, None).await;
    }
}

fn is_txn_end(statement: &str) -> bool {
    let head = crate::query::strip_leading_comments(statement).trim_start().to_ascii_uppercase();
    head.starts_with("COMMIT") || head.starts_with("ROLLBACK")
}

fn autocommit_default(state: &AppState, profile_id: &str) -> bool {
    let settings = crate::connection_settings::read_settings(state, profile_id);
    crate::connection_settings::bool_at(&settings, &["transaction", "autoCommit"]).unwrap_or(true)
}

fn query_timeout_seconds(state: &AppState, profile_id: &str) -> Option<u64> {
    let settings = crate::connection_settings::read_settings(state, profile_id);
    crate::connection_settings::num_at(&settings, &["driver", "queryTimeoutSeconds"]).filter(|n| *n > 0)
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn session_info(state: State<'_, AppState>, profile_id: String, tab_id: String) -> AppResult<SessionInfo> {
    let mut s = state.sessions.checkout(&state, &profile_id, &tab_id).await?;
    Ok(info_of(&mut s))
}

/// Switch a tab between autocommit and manual commit. Leaving manual mode
/// with uncommitted changes is refused: the person decides first.
#[tauri::command]
pub async fn session_set_autocommit(state: State<'_, AppState>, profile_id: String, tab_id: String, on: bool) -> AppResult<SessionInfo> {
    let mut s = state.sessions.checkout(&state, &profile_id, &tab_id).await?;
    if on == !s.manual {
        return Ok(info_of(&mut s));
    }
    if on {
        if !s.changes.is_empty() {
            return Err(AppError::InvalidSettings(format!(
                "{} uncommitted change{} — commit or roll back before switching autocommit on.",
                s.changes.len(),
                if s.changes.len() == 1 { "" } else { "s" }
            )));
        }
        ExaTransactionManager::rollback(&mut s.conn).await.map_err(|e| AppError::Storage(e.to_string()))?;
        s.manual = false;
    } else {
        ExaTransactionManager::begin(&mut s.conn, None).await.map_err(|e| AppError::Storage(e.to_string()))?;
        s.manual = true;
        s.changes.clear();
    }
    Ok(info_of(&mut s))
}

#[tauri::command]
pub async fn session_commit(state: State<'_, AppState>, profile_id: String, tab_id: String) -> AppResult<SessionInfo> {
    let mut s = state.sessions.checkout(&state, &profile_id, &tab_id).await?;
    if s.manual {
        ExaTransactionManager::commit(&mut s.conn).await.map_err(|e| AppError::Storage(format!("Commit failed: {e}")))?;
        s.changes.clear();
        ExaTransactionManager::begin(&mut s.conn, None).await.map_err(|e| AppError::Storage(e.to_string()))?;
    }
    Ok(info_of(&mut s))
}

#[tauri::command]
pub async fn session_rollback(state: State<'_, AppState>, profile_id: String, tab_id: String) -> AppResult<SessionInfo> {
    let mut s = state.sessions.checkout(&state, &profile_id, &tab_id).await?;
    if s.manual {
        ExaTransactionManager::rollback(&mut s.conn).await.map_err(|e| AppError::Storage(format!("Rollback failed: {e}")))?;
        s.changes.clear();
        ExaTransactionManager::begin(&mut s.conn, None).await.map_err(|e| AppError::Storage(e.to_string()))?;
    }
    Ok(info_of(&mut s))
}

/// The schema selector: OPEN SCHEMA on the tab's own session.
#[tauri::command]
pub async fn session_set_schema(state: State<'_, AppState>, profile_id: String, tab_id: String, schema: String) -> AppResult<SessionInfo> {
    let mut s = state.sessions.checkout(&state, &profile_id, &tab_id).await?;
    s.conn.execute(AssertSqlSafe(open_schema_sql(&schema))).await.map_err(|e| AppError::Storage(e.to_string()))?;
    s.last_used = Instant::now();
    Ok(info_of(&mut s))
}

/// Close a tab's session; `commit` decides what happens to open changes.
#[tauri::command]
pub async fn session_close(state: State<'_, AppState>, tab_id: String, commit: bool) -> AppResult<()> {
    state.sessions.close(&tab_id, commit).await;
    Ok(())
}

/// Set once the person has settled open transactions and asked to quit.
pub static QUIT_CONFIRMED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// Set when the page has picked up a quit request (it shows the dialog).
pub static QUIT_ACKED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// The page has the quit request and is asking the person.
#[tauri::command]
pub fn quit_ack() {
    QUIT_ACKED.store(true, std::sync::atomic::Ordering::SeqCst);
}

/// Quit for real: open transactions were committed or rolled back.
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    QUIT_CONFIRMED.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingTab {
    pub tab_id: String,
    pub changes: usize,
}

/// Tabs with uncommitted changes — for disconnect and quit.
#[tauri::command]
pub async fn sessions_with_changes(state: State<'_, AppState>, profile_id: Option<String>) -> AppResult<Vec<PendingTab>> {
    Ok(state
        .sessions
        .with_changes(profile_id.as_deref())
        .await
        .into_iter()
        .map(|(tab_id, changes)| PendingTab { tab_id, changes })
        .collect())
}

#[cfg(test)]
mod live {
    //! EXASOL_LIVE_PORT=8565 EXASOL_LIVE_PASSWORD=… cargo test --lib session::live -- --ignored
    use super::*;
    use sqlx_exasol::Executor;

    async fn scalar(s: &mut TabSession, sql: &str) -> String {
        sqlx_exasol::query(AssertSqlSafe(sql.to_string())).fetch_one(&mut s.conn).await.unwrap().try_get::<String, _>(0).unwrap()
    }

    #[tokio::test]
    #[ignore = "needs a live database (EXASOL_LIVE_* env)"]
    async fn a_tab_keeps_its_session_and_manual_mode_rolls_back_and_commits() {
        let dir = std::env::temp_dir().join(format!("studio-session-live-{}", std::process::id()));
        let state = AppState::new(dir.clone());
        let profile = crate::profiles::ConnectionProfile {
            id: "live".into(),
            name: "live".into(),
            host: "127.0.0.1".into(),
            port: std::env::var("EXASOL_LIVE_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8563),
            username: "sys".into(),
            password: std::env::var("EXASOL_LIVE_PASSWORD").expect("EXASOL_LIVE_PASSWORD"),
            schema: None,
            notes: None,
            ssl_mode: "preferred".into(),
            compression: false,
            driver_id: "sqlx-exasol".into(),
            created_at: None,
            last_used_at: None,
        };
        let pool = crate::connection::open_pool(&profile).await.unwrap();
        pool.execute("CREATE SCHEMA IF NOT EXISTS STUDIO_SESSION_PROBE").await.ok();
        pool.execute("CREATE OR REPLACE TABLE STUDIO_SESSION_PROBE.T (N DECIMAL(9,0))").await.unwrap();
        state.pools.write().await.insert("live".into(), pool.clone());

        // OPEN SCHEMA on the tab's session is there for its next statement.
        {
            let mut s = state.sessions.checkout(&state, "live", "tab-1").await.unwrap();
            s.conn.execute(AssertSqlSafe(open_schema_sql("STUDIO_SESSION_PROBE"))).await.unwrap();
        }
        {
            let mut s = state.sessions.checkout(&state, "live", "tab-1").await.unwrap();
            assert_eq!(scalar(&mut s, "SELECT CURRENT_SCHEMA").await, "STUDIO_SESSION_PROBE");
        }

        // Manual mode: an insert, then rollback → gone; insert, commit → kept.
        {
            let mut s = state.sessions.checkout(&state, "live", "tab-1").await.unwrap();
            ExaTransactionManager::begin(&mut s.conn, None).await.unwrap();
            s.manual = true;
            s.conn.execute("INSERT INTO T VALUES (1)").await.unwrap();
            after_run(&mut s, &[("INSERT INTO T VALUES (1)".into(), true)]).await;
            assert_eq!(info_of(&mut s).changes, 1);
            ExaTransactionManager::rollback(&mut s.conn).await.unwrap();
            ExaTransactionManager::begin(&mut s.conn, None).await.unwrap();
            s.changes.clear();
        }
        assert_eq!(crate::query::fetch_all_rows(&pool, "SELECT COUNT(*) FROM STUDIO_SESSION_PROBE.T").await.unwrap()[0][0], serde_json::json!(0));
        {
            let mut s = state.sessions.checkout(&state, "live", "tab-1").await.unwrap();
            s.conn.execute("INSERT INTO T VALUES (2)").await.unwrap();
            // Another session does not see it before the commit.
            assert_eq!(crate::query::fetch_all_rows(&pool, "SELECT COUNT(*) FROM STUDIO_SESSION_PROBE.T").await.unwrap()[0][0], serde_json::json!(0));
            ExaTransactionManager::commit(&mut s.conn).await.unwrap();
            ExaTransactionManager::begin(&mut s.conn, None).await.unwrap();
        }
        assert_eq!(crate::query::fetch_all_rows(&pool, "SELECT COUNT(*) FROM STUDIO_SESSION_PROBE.T").await.unwrap()[0][0], serde_json::json!(1));

        state.sessions.close("tab-1", false).await;
        pool.execute("DROP SCHEMA STUDIO_SESSION_PROBE CASCADE").await.ok();
        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_statements_that_change_something_count() {
        for s in ["INSERT INTO t VALUES (1)", "update t set a = 1", "DELETE FROM t", "MERGE INTO t USING s ON TRUE WHEN MATCHED THEN DELETE", "CREATE TABLE x (a INT)", "DROP TABLE x", "ALTER TABLE t ADD c INT", "TRUNCATE TABLE t", "-- note\nINSERT INTO t VALUES (2)", "GRANT SELECT ON t TO u"] {
            assert!(counts_as_change(s), "{s}");
        }
        for s in ["SELECT 1", "with x as (select 1) select * from x", "OPEN SCHEMA s", "ALTER SESSION SET QUERY_TIMEOUT = 5", "COMMIT", "rollback", "EXPLAIN VIRTUAL SELECT 1", "", "  /* c */ SELECT 1", "DESCRIBE t"] {
            assert!(!counts_as_change(s), "{s}");
        }
    }

    #[test]
    fn a_lost_connection_is_told_apart_from_a_sql_error() {
        assert!(is_connection_lost("error communicating with database: Connection reset by peer (os error 54)"));
        assert!(is_connection_lost("WebSocket protocol error: Connection closed normally"));
        assert!(!is_connection_lost("[42000] object TABLE_X not found [line 1, column 15]"));
        assert!(!is_connection_lost("[22002] data exception - numeric value out of range"));
    }

    #[test]
    fn open_schema_quotes_the_name_exactly() {
        assert_eq!(open_schema_sql("RETAIL"), "OPEN SCHEMA \"RETAIL\"");
        assert_eq!(open_schema_sql("mixed Case"), "OPEN SCHEMA \"mixed Case\"");
        assert_eq!(open_schema_sql("we\"ird"), "OPEN SCHEMA \"we\"\"ird\"");
    }
}
