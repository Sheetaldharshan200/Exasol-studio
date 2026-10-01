//! The Tauri commands over a SQL tab's session (session.rs), and quitting
//! with open transactions: Rust holds the window, the page asks, a native
//! dialog answers if the page does not.

use std::time::Instant;

use serde::Serialize;
use sqlx_core::transaction::TransactionManager;
use sqlx_exasol::{AssertSqlSafe, ExaTransactionManager, Executor};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::session::{info_of, open_schema_sql, SessionInfo};
use crate::state::AppState;


#[tauri::command]
pub async fn session_info(state: State<'_, AppState>, tab_id: String) -> AppResult<SessionInfo> {
    // Never opens a session: looking at a tab must not move it anywhere.
    Ok(state.sessions.peek(&tab_id).await)
}

/// Switch a tab between autocommit and manual commit. Leaving manual mode
/// with uncommitted changes is refused: the person decides first.
#[tauri::command]
pub async fn session_set_autocommit(state: State<'_, AppState>, profile_id: String, tab_id: String, on: bool) -> AppResult<SessionInfo> {
    let mut s = state.sessions.checkout(&state, &profile_id, &tab_id).await?;
    if on == !s.manual {
        return Ok(info_of(&s));
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
    Ok(info_of(&s))
}

#[tauri::command]
pub async fn session_commit(state: State<'_, AppState>, profile_id: String, tab_id: String) -> AppResult<SessionInfo> {
    let mut s = state.sessions.checkout(&state, &profile_id, &tab_id).await?;
    if s.manual {
        ExaTransactionManager::commit(&mut s.conn).await.map_err(|e| AppError::Storage(format!("Commit failed: {e}")))?;
        s.changes.clear();
        ExaTransactionManager::begin(&mut s.conn, None).await.map_err(|e| AppError::Storage(e.to_string()))?;
    }
    Ok(info_of(&s))
}

#[tauri::command]
pub async fn session_rollback(state: State<'_, AppState>, profile_id: String, tab_id: String) -> AppResult<SessionInfo> {
    let mut s = state.sessions.checkout(&state, &profile_id, &tab_id).await?;
    if s.manual {
        ExaTransactionManager::rollback(&mut s.conn).await.map_err(|e| AppError::Storage(format!("Rollback failed: {e}")))?;
        s.changes.clear();
        ExaTransactionManager::begin(&mut s.conn, None).await.map_err(|e| AppError::Storage(e.to_string()))?;
    }
    Ok(info_of(&s))
}

/// The schema selector: OPEN SCHEMA on the tab's own session.
#[tauri::command]
pub async fn session_set_schema(state: State<'_, AppState>, profile_id: String, tab_id: String, schema: String) -> AppResult<SessionInfo> {
    let mut s = state.sessions.checkout(&state, &profile_id, &tab_id).await?;
    s.conn.execute(AssertSqlSafe(open_schema_sql(&schema))).await.map_err(|e| AppError::Storage(e.to_string()))?;
    s.last_used = Instant::now();
    Ok(info_of(&s))
}

/// Close a tab's session; `commit` decides what happens to open changes.
#[tauri::command]
pub async fn session_close(state: State<'_, AppState>, tab_id: String, commit: bool, seen: Option<usize>) -> AppResult<()> {
    state.sessions.close(&tab_id, commit, seen).await
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

/// Roll back every tab's open work and quit — the native fallback dialog's
/// choice when the page cannot answer.
pub fn rollback_all_and_quit(app: &tauri::AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        use tauri::Manager;
        handle.state::<AppState>().sessions.close_all().await;
        QUIT_CONFIRMED.store(true, std::sync::atomic::Ordering::SeqCst);
        handle.exit(0);
    });
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
    pub recent: Vec<String>,
}

/// Tabs with uncommitted changes — for disconnect and quit.
#[tauri::command]
pub async fn sessions_with_changes(state: State<'_, AppState>, profile_id: Option<String>) -> AppResult<Vec<PendingTab>> {
    Ok(state
        .sessions
        .with_changes(profile_id.as_deref())
        .await
        .into_iter()
        .map(|(tab_id, changes, recent)| PendingTab { tab_id, changes, recent })
        .collect())
}
