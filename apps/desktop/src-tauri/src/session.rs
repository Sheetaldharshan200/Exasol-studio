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
    /// Bumped by every run that changed or settled something — never reset,
    /// so "what the person was shown" is a version, not just a count.
    pub change_seq: u64,
    pub last_used: Instant,
}

/// A tab's slot. `None` until its session opens, and again once closed — a
/// handle cloned before a close sees `None` (or a newer slot in the map) and
/// never runs on the closed session.
pub type Slot = Arc<Mutex<Option<TabSession>>>;

/// The tab sessions of the whole app: tab id → its slot.
#[derive(Default)]
pub struct TabSessions(Mutex<HashMap<String, Slot>>);

/// A locked, open session that is still the tab's current one.
pub struct Checkout(OwnedMutexGuard<Option<TabSession>>, Slot);

impl std::ops::Deref for Checkout {
    type Target = TabSession;
    fn deref(&self) -> &TabSession {
        self.0.as_ref().expect("a checkout always holds an open session")
    }
}

impl std::ops::DerefMut for Checkout {
    fn deref_mut(&mut self) -> &mut TabSession {
        self.0.as_mut().expect("a checkout always holds an open session")
    }
}

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
    /// Whether the tab has a session at all yet.
    pub open: bool,
    /// The version of `changes`; a close names the one it was shown.
    pub change_seq: u64,
}

/// A tab with uncommitted changes — for disconnect and quit.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingTab {
    pub tab_id: String,
    pub changes: usize,
    pub recent: Vec<String>,
    pub change_seq: u64,
}

/// A tab session found dead by the keep-alive ping.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LostSession {
    pub tab_id: String,
    pub profile_id: String,
    /// Uncommitted changes the server rolled back with it.
    pub changes: usize,
}

/// How long a keep-alive ping may wait before giving up on this round (the
/// slot lock must not stay held by a hung socket).
const PING_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// What a keep-alive ping got back.
pub enum Ping {
    Answered,
    Failed(String),
    TimedOut,
}

/// Whether a ping proves the session is gone. Only a closed connection does:
/// dropping a session closes its socket and the server rolls its open
/// transaction back, so a slow answer (a timeout) or a SQL error keeps it —
/// a dead one shows on the next ping or run.
pub fn ping_means_lost(outcome: &Ping) -> bool {
    matches!(outcome, Ping::Failed(e) if is_connection_lost(e))
}

/// What a close checks before it commits or rolls back.
pub enum Fence {
    /// Nobody is asked (quit fallback, disconnect cleanup): just end it.
    Force,
    /// The `change_seq` the person was shown, or None if shown nothing.
    Shown(Option<u64>),
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
    LOST_CONNECTION_PATTERNS.iter().any(|p| e.contains(p))
}

/// Lower-case fragments of an error that means the connection is gone. Sent
/// to the driver bridges too, so every driver ends a script on the same ones.
pub const LOST_CONNECTION_PATTERNS: &[&str] = &[
    "connection closed", "connection reset", "broken pipe", "websocket", "connection refused", "timed out while",
    "os error 54", "os error 32", "unexpected eof", "peer closed connection", "error communicating with database",
    "session does not exist", "session has been killed",
];

/// `OPEN SCHEMA` for a catalog name, quoted exactly.
pub fn open_schema_sql(schema: &str) -> String {
    format!("OPEN SCHEMA \"{}\"", schema.replace('"', "\"\""))
}

pub(crate) fn info_of(s: &TabSession) -> SessionInfo {
    SessionInfo {
        session_id: s.session_id.clone(),
        schema: s.conn.attributes().current_schema().map(str::to_string),
        autocommit: !s.manual,
        changes: if s.manual { s.changes.len() } else { 0 },
        recent: s.changes.iter().rev().take(RECENT).cloned().collect(),
        idle_seconds: s.last_used.elapsed().as_secs(),
        open: true,
        change_seq: s.change_seq,
    }
}

fn closed_info() -> SessionInfo {
    SessionInfo { session_id: None, schema: None, autocommit: true, changes: 0, recent: Vec::new(), idle_seconds: 0, open: false, change_seq: 0 }
}

impl TabSessions {
    /// The tab's slot, created (empty) atomically if it has none.
    async fn slot(&self, tab_id: &str) -> Slot {
        self.0.lock().await.entry(tab_id.to_string()).or_insert_with(|| Arc::new(Mutex::new(None))).clone()
    }

    async fn is_current(&self, tab_id: &str, slot: &Slot) -> bool {
        self.0.lock().await.get(tab_id).is_some_and(|cur| Arc::ptr_eq(cur, slot))
    }

    /// The tab's session, opened on first use. Get-or-create is atomic per tab
    /// (the slot's lock), and a handle whose slot was closed and replaced
    /// meanwhile retries on the current one. A tab whose session belongs to
    /// another connection is refused while it holds uncommitted changes.
    pub async fn checkout(&self, state: &AppState, profile_id: &str, tab_id: &str) -> AppResult<Checkout> {
        loop {
            let slot = self.slot(tab_id).await;
            let mut guard = slot.clone().lock_owned().await;
            if !self.is_current(tab_id, &slot).await {
                continue; // closed and replaced while we waited
            }
            if let Some(s) = guard.as_mut() {
                if s.profile_id == profile_id {
                    return Ok(Checkout(guard, slot));
                }
                if s.manual && !s.changes.is_empty() {
                    return Err(AppError::InvalidSettings(format!(
                        "This tab has {} uncommitted change{} on another connection — commit or roll back there first.",
                        s.changes.len(),
                        if s.changes.len() == 1 { "" } else { "s" }
                    )));
                }
                // Nothing to lose: the old session goes, a new one opens below.
                *guard = None;
            }
            *guard = Some(open_session(state, profile_id).await?);
            return Ok(Checkout(guard, slot));
        }
    }

    /// The tab's session state without opening one.
    pub async fn peek(&self, tab_id: &str) -> SessionInfo {
        let slot = self.0.lock().await.get(tab_id).cloned();
        match slot {
            Some(slot) => slot.lock().await.as_ref().map(info_of).unwrap_or_else(closed_info),
            None => closed_info(),
        }
    }

    /// End a tab's session: commit or roll back what is open, then close.
    /// With `Fence::Shown`, uncommitted changes the person was not shown (a
    /// different `change_seq`) stop the close and the session stays. A commit
    /// that fails keeps the session too: the person chose Commit and must
    /// hear that it may not have happened. The slot lock waits for a statement
    /// still running, and is held until the map entry is gone, so a checkout
    /// waiting on it opens a fresh slot instead of reusing this one.
    pub async fn close(&self, tab_id: &str, commit: bool, fence: Fence) -> AppResult<()> {
        let slot = self.0.lock().await.get(tab_id).cloned();
        let Some(slot) = slot else { return Ok(()) };
        let mut guard = slot.lock().await;
        if let Some(s) = guard.as_mut().filter(|s| s.manual) {
            if let Fence::Shown(seen) = fence {
                if let Some(why) = close_refusal(s.changes.len(), s.change_seq, seen) {
                    return Err(AppError::InvalidSettings(why));
                }
            }
            if commit {
                if let Err(e) = ExaTransactionManager::commit(&mut s.conn).await {
                    return Err(AppError::Storage(format!(
                        "The commit could not be confirmed ({e}). The changes may or may not have been committed — check before redoing them."
                    )));
                }
            } else {
                let _ = ExaTransactionManager::rollback(&mut s.conn).await;
            }
        }
        *guard = None;
        let mut map = self.0.lock().await;
        if map.get(tab_id).is_some_and(|cur| Arc::ptr_eq(cur, &slot)) {
            map.remove(tab_id);
        }
        drop(map);
        drop(guard);
        Ok(())
    }

    /// Forget a session whose connection is gone; the server rolled it back.
    /// Only this slot is removed — never a newer session of the same tab.
    pub async fn forget_lost(&self, tab_id: &str, mut co: Checkout) {
        *co.0 = None;
        let slot = co.1.clone();
        drop(co);
        let mut map = self.0.lock().await;
        if map.get(tab_id).is_some_and(|cur| Arc::ptr_eq(cur, &slot)) {
            map.remove(tab_id);
        }
    }

    /// Every session (optionally of one profile) with uncommitted changes —
    /// read from the sessions themselves, never a cache. Waits for a session
    /// that is busy running.
    pub async fn with_changes(&self, profile_id: Option<&str>) -> Vec<PendingTab> {
        let slots: Vec<(String, Slot)> = self.0.lock().await.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        let mut out = Vec::new();
        for (tab, slot) in slots {
            if let Some(s) = slot.lock().await.as_ref() {
                if s.manual && !s.changes.is_empty() && profile_id.is_none_or(|p| s.profile_id == p) {
                    out.push(PendingTab { tab_id: tab, changes: s.changes.len(), recent: s.changes.iter().rev().take(RECENT).cloned().collect(), change_seq: s.change_seq });
                }
            }
        }
        out
    }

    /// Ping every tab session idle for at least `idle_for`, so a dropped
    /// connection is found while nobody is using the tab, not on the next run.
    /// A session busy with a statement is skipped (its run reports for
    /// itself), and the ping never counts as use: the idle-transaction
    /// warning still sees the tab as idle. Dead sessions are removed and
    /// returned, with the changes the server rolled back.
    pub async fn ping_idle(&self, idle_for: std::time::Duration) -> Vec<LostSession> {
        let slots: Vec<(String, Slot)> = self.0.lock().await.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        let mut lost = Vec::new();
        for (tab, slot) in slots {
            let Ok(mut guard) = slot.clone().try_lock_owned() else { continue };
            let Some(s) = guard.as_mut() else { continue };
            if s.last_used.elapsed() < idle_for {
                continue;
            }
            let outcome = match tokio::time::timeout(PING_TIMEOUT, s.conn.execute("SELECT 1")).await {
                Ok(Ok(_)) => Ping::Answered,
                Ok(Err(e)) => Ping::Failed(e.to_string()),
                Err(_) => Ping::TimedOut,
            };
            if !ping_means_lost(&outcome) {
                continue;
            }
            lost.push(LostSession { tab_id: tab.clone(), profile_id: s.profile_id.clone(), changes: if s.manual { s.changes.len() } else { 0 } });
            *guard = None;
            let mut map = self.0.lock().await;
            if map.get(&tab).is_some_and(|cur| Arc::ptr_eq(cur, &slot)) {
                map.remove(&tab);
            }
        }
        lost
    }

    /// Whether quitting might end uncommitted work — without waiting. A session
    /// busy with a running statement cannot be inspected, so it counts as yes:
    /// asking once too often is fine, losing work silently is not.
    pub fn might_have_changes_now(&self) -> bool {
        let Ok(map) = self.0.try_lock() else { return true };
        map.values().any(|slot| match slot.try_lock() {
            Ok(s) => s.as_ref().is_some_and(|s| s.manual && !s.changes.is_empty()),
            Err(_) => true,
        })
    }

    /// Close every session of a profile (disconnect), rolling back what is
    /// open. The map lock is released before any session is waited on.
    pub async fn close_profile(&self, profile_id: &str) {
        let slots: Vec<(String, Slot)> = self.0.lock().await.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        for (tab, slot) in slots {
            let belongs = slot.lock().await.as_ref().is_some_and(|s| s.profile_id == profile_id);
            if belongs {
                let _ = self.close(&tab, false, Fence::Force).await;
            }
        }
    }

    /// Roll back and close everything (quit after the person chose so).
    pub async fn close_all(&self) {
        let tabs: Vec<String> = self.0.lock().await.keys().cloned().collect();
        for t in tabs {
            let _ = self.close(&t, false, Fence::Force).await;
        }
    }
}

async fn open_session(state: &AppState, profile_id: &str) -> AppResult<TabSession> {
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
    // Properties → SQL Editor → Initial schema: a pooled connection may carry
    // another schema from earlier work, so the start is set explicitly.
    let settings = crate::connection_settings::read_settings(state, profile_id);
    let mode = crate::connection_settings::str_at(&settings, &["sqlEditor", "initialSchema"]).unwrap_or("default");
    let profile_schema = crate::profiles::find_profile(state, profile_id).ok().and_then(|p| p.schema);
    let recent = state.recent_schemas.lock().ok().and_then(|m| m.get(profile_id).cloned());
    if let Some(sql) = initial_schema_sql(mode, profile_schema.as_deref(), recent.as_deref()) {
        // A schema that no longer exists leaves the tab without one.
        let _ = conn.execute(AssertSqlSafe(sql)).await;
    }
    // The connection's own default decides how a new tab starts.
    let manual = !autocommit_default(state, profile_id);
    if manual {
        ExaTransactionManager::begin(&mut conn, None).await.map_err(|e| AppError::Storage(e.to_string()))?;
    }
    Ok(TabSession { profile_id: profile_id.to_string(), conn, session_id, manual, changes: Vec::new(), change_seq: 0, last_used: Instant::now() })
}

/// The statement that gives a new tab session its starting schema:
/// "default" the connection's schema, "none" no schema, "recent" the schema
/// last used on this connection (else the default).
pub fn initial_schema_sql(mode: &str, profile_schema: Option<&str>, recent: Option<&str>) -> Option<String> {
    let pick = |s: Option<&str>| s.map(str::trim).filter(|s| !s.is_empty()).map(open_schema_sql);
    match mode {
        "none" => Some("CLOSE SCHEMA".to_string()),
        "recent" => pick(recent).or_else(|| pick(profile_schema)),
        _ => pick(profile_schema),
    }
}

/// Remember the schema a tab of this connection now uses ("recent").
pub fn note_schema(state: &AppState, s: &TabSession) {
    if let (Some(schema), Ok(mut m)) = (s.conn.attributes().current_schema(), state.recent_schemas.lock()) {
        m.insert(s.profile_id.clone(), schema.to_string());
    }
}

/// After a run on the session: count what changed, keep manual mode open.
pub fn after_run(s: &mut TabSession, ran: &[(String, bool)]) {
    s.last_used = Instant::now();
    if !s.manual {
        return;
    }
    if ran.iter().any(|(st, ok)| *ok && (is_txn_end(st) || counts_as_change(st))) {
        s.change_seq += 1;
    }
    record_changes(&mut s.changes, ran);
}

/// Count a run's changes in order: a COMMIT or ROLLBACK typed as SQL settles
/// everything before it (the next transaction was started by the run itself).
pub fn record_changes(changes: &mut Vec<String>, ran: &[(String, bool)]) {
    for (stmt, _) in ran.iter().filter(|(_, ok)| *ok) {
        if is_txn_end(stmt) {
            changes.clear();
        } else if counts_as_change(stmt) {
            changes.push(stmt.chars().take(300).collect());
        }
    }
}

/// Make sure the tab is still in manual mode after a COMMIT or ROLLBACK typed
/// as SQL. Those leave the session's autocommit off, so the server already
/// runs the next statement in a new transaction (the driver tracks that as
/// "open"); only if autocommit was somehow switched on is a new one begun.
pub async fn restart_manual(conn: &mut ExaConnection) -> Result<(), String> {
    if conn.attributes().open_transaction() {
        return Ok(());
    }
    ExaTransactionManager::begin(conn, None).await.map_err(|e| e.to_string())
}

/// Why a close must not go ahead: uncommitted changes other than the ones
/// the person was shown (`seen` is the version they saw, None for nothing).
pub fn close_refusal(changes: usize, change_seq: u64, seen: Option<u64>) -> Option<String> {
    (changes > 0 && seen != Some(change_seq)).then(|| {
        format!(
            "Uncommitted changes changed after you were asked ({changes} now). Nothing was committed or rolled back — review the tab and choose again."
        )
    })
}

pub fn is_txn_end(statement: &str) -> bool {
    let head = crate::query::strip_leading_comments(statement).trim_start().to_ascii_uppercase();
    head.starts_with("COMMIT") || head.starts_with("ROLLBACK")
}

pub(crate) fn autocommit_default(state: &AppState, profile_id: &str) -> bool {
    let settings = crate::connection_settings::read_settings(state, profile_id);
    crate::connection_settings::bool_at(&settings, &["transaction", "autoCommit"]).unwrap_or(true)
}

fn query_timeout_seconds(state: &AppState, profile_id: &str) -> Option<u64> {
    let settings = crate::connection_settings::read_settings(state, profile_id);
    crate::connection_settings::num_at(&settings, &["driver", "queryTimeoutSeconds"]).filter(|n| *n > 0)
}

#[cfg(test)]
mod live {
    //! EXASOL_LIVE_PORT=8565 EXASOL_LIVE_PASSWORD=… cargo test --lib session::live -- --ignored
    use super::*;


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
            fingerprint: None,
            ssl_ca: None,
            auth_method: "password".into(),
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
            after_run(&mut s, &[("INSERT INTO T VALUES (1)".into(), true)]);
            assert_eq!(info_of(&s).changes, 1);
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

        // A COMMIT typed as SQL: the next transaction starts before the next
        // statement, so that statement stays uncommitted.
        {
            let mut s = state.sessions.checkout(&state, "live", "tab-1").await.unwrap();
            s.conn.execute("INSERT INTO T VALUES (3)").await.unwrap();
            s.conn.execute("COMMIT").await.unwrap();
            restart_manual(&mut s.conn).await.unwrap();
            s.conn.execute("INSERT INTO T VALUES (4)").await.unwrap();
            let ran = [("INSERT INTO T VALUES (3)".to_string(), true), ("COMMIT".into(), true), ("INSERT INTO T VALUES (4)".into(), true)];
            after_run(&mut s, &ran);
            assert_eq!(s.changes.len(), 1);
        }
        assert_eq!(crate::query::fetch_all_rows(&pool, "SELECT COUNT(*) FROM STUDIO_SESSION_PROBE.T").await.unwrap()[0][0], serde_json::json!(2));

        // Closing after being shown fewer changes than there are is refused
        // and the session stays; with the right count it rolls back.
        let seq = state.sessions.peek("tab-1").await.change_seq;
        assert!(state.sessions.close("tab-1", false, Fence::Shown(None)).await.is_err());
        assert!(state.sessions.close("tab-1", false, Fence::Shown(Some(seq - 1))).await.is_err());
        assert!(state.sessions.peek("tab-1").await.open);
        state.sessions.close("tab-1", false, Fence::Shown(Some(seq))).await.unwrap();
        assert!(!state.sessions.peek("tab-1").await.open);
        assert_eq!(crate::query::fetch_all_rows(&pool, "SELECT COUNT(*) FROM STUDIO_SESSION_PROBE.T").await.unwrap()[0][0], serde_json::json!(2));

        // Keep-alive: a healthy idle session survives the ping; one killed on
        // the server is found, removed, and reported with its lost changes.
        let sid = {
            let mut s = state.sessions.checkout(&state, "live", "tab-2").await.unwrap();
            s.manual = true;
            s.changes.push("INSERT …".into());
            s.session_id.clone().unwrap()
        };
        assert!(state.sessions.ping_idle(std::time::Duration::ZERO).await.is_empty());
        assert!(state.sessions.peek("tab-2").await.open);
        pool.execute(AssertSqlSafe(format!("KILL SESSION {sid}"))).await.unwrap();
        let lost = state.sessions.ping_idle(std::time::Duration::ZERO).await;
        assert_eq!(lost.len(), 1, "killed session not detected");
        assert_eq!((lost[0].tab_id.as_str(), lost[0].changes), ("tab-2", 1));
        assert!(!state.sessions.peek("tab-2").await.open);

        state.sessions.close("tab-1", false, Fence::Force).await.unwrap();
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
        // What sqlx-exasol reports for a session killed on the server (TLS).
        assert!(is_connection_lost("error communicating with database: peer closed connection without sending TLS close_notify: https://docs.rs/rustls/latest/rustls/manual/_03_howto/index.html#unexpected-eof"));
        assert!(is_connection_lost("error communicating with database: Connection reset by peer (os error 54)"));
        assert!(is_connection_lost("WebSocket protocol error: Connection closed normally"));
        assert!(!is_connection_lost("[42000] object TABLE_X not found [line 1, column 15]"));
        assert!(!is_connection_lost("[22002] data exception - numeric value out of range"));
        assert!(LOST_CONNECTION_PATTERNS.iter().all(|p| *p == p.to_ascii_lowercase()), "bridges match lower-cased errors");
    }

    #[test]
    fn a_commit_in_the_script_settles_only_what_came_before_it() {
        let ran = |v: &[(&str, bool)]| v.iter().map(|(s, ok)| (s.to_string(), *ok)).collect::<Vec<_>>();
        let mut changes = vec!["UPDATE OLD".to_string()];
        record_changes(&mut changes, &ran(&[("INSERT INTO T VALUES (1)", true), ("COMMIT", true), ("INSERT INTO T VALUES (2)", true)]));
        assert_eq!(changes, vec!["INSERT INTO T VALUES (2)"]);
        // A ROLLBACK, in lower case after a comment, settles too.
        record_changes(&mut changes, &ran(&[("-- undo\nrollback", true)]));
        assert!(changes.is_empty());
        // A failed COMMIT settles nothing; a failed change is not counted.
        let mut changes = vec!["DELETE FROM T".to_string()];
        record_changes(&mut changes, &ran(&[("COMMIT", false), ("INSERT INTO T VALUES (3)", false), ("SELECT 1", true)]));
        assert_eq!(changes, vec!["DELETE FROM T"]);
        record_changes(&mut changes, &[]);
        assert_eq!(changes.len(), 1);
    }

    #[test]
    fn a_close_is_refused_unless_the_person_saw_this_version_of_the_changes() {
        assert!(close_refusal(0, 0, None).is_none(), "nothing open, nothing to lose");
        assert!(close_refusal(0, 7, Some(3)).is_none(), "settled meanwhile: nothing to lose");
        assert!(close_refusal(2, 5, Some(5)).is_none());
        assert!(close_refusal(1, 1, None).is_some(), "shown nothing, but changes exist");
        // Same count, different changes (COMMIT; INSERT C ran meanwhile).
        assert!(close_refusal(2, 6, Some(5)).unwrap().contains("2 now"));
    }

    #[test]
    fn transaction_ends_are_recognised() {
        assert!(is_txn_end("COMMIT"));
        assert!(is_txn_end("  rollback work"));
        assert!(is_txn_end("/* x */ COMMIT"));
        assert!(!is_txn_end("SELECT 'COMMIT'"));
        assert!(!is_txn_end(""));
    }

    #[test]
    fn only_a_closed_connection_makes_a_ping_drop_the_session() {
        assert!(!ping_means_lost(&Ping::Answered));
        assert!(!ping_means_lost(&Ping::TimedOut), "slow is not dead: dropping would roll back live work");
        assert!(!ping_means_lost(&Ping::Failed("[42000] insufficient privileges".into())));
        assert!(ping_means_lost(&Ping::Failed("error communicating with database: peer closed connection without sending TLS close_notify".into())));
        assert!(ping_means_lost(&Ping::Failed("WebSocket protocol error: Connection closed normally".into())));
    }

    #[test]
    fn a_new_tab_starts_in_the_schema_the_setting_names() {
        assert_eq!(initial_schema_sql("default", Some("RETAIL"), Some("HR")), Some("OPEN SCHEMA \"RETAIL\"".into()));
        assert_eq!(initial_schema_sql("default", None, Some("HR")), None, "no default: leave it");
        assert_eq!(initial_schema_sql("none", Some("RETAIL"), None), Some("CLOSE SCHEMA".into()));
        assert_eq!(initial_schema_sql("recent", Some("RETAIL"), Some("HR")), Some("OPEN SCHEMA \"HR\"".into()));
        assert_eq!(initial_schema_sql("recent", Some("RETAIL"), None), Some("OPEN SCHEMA \"RETAIL\"".into()), "nothing recent yet");
        assert_eq!(initial_schema_sql("recent", None, Some("  ")), None);
        assert_eq!(initial_schema_sql("bogus", Some("RETAIL"), None), Some("OPEN SCHEMA \"RETAIL\"".into()), "unknown = default");
    }

    #[test]
    fn open_schema_quotes_the_name_exactly() {
        assert_eq!(open_schema_sql("RETAIL"), "OPEN SCHEMA \"RETAIL\"");
        assert_eq!(open_schema_sql("mixed Case"), "OPEN SCHEMA \"mixed Case\"");
        assert_eq!(open_schema_sql("we\"ird"), "OPEN SCHEMA \"we\"\"ird\"");
    }
}
