//! Saving staged grid edits: every statement in one transaction on one
//! connection, each required to touch exactly the one row it names.
//!
//! The grid builds one UPDATE / DELETE / INSERT per staged row. Run one by one
//! under autocommit, a failure halfway left the earlier ones committed while
//! the grid still showed them staged — saving again applied them twice — and a
//! statement that matched no row (or several) passed as a success.

use serde::Serialize;
use sqlx_exasol::{AssertSqlSafe, Executor};
use tauri::State;

use crate::connection::require_pool;
use sqlx_exasol::ExaPool;
use crate::error::{AppError, AppResult};
use crate::history::{self, HistoryEntry};
use crate::state::AppState;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EditOutcome {
    pub ok: bool,
    /// The statement that stopped the batch (0-based), when one did.
    pub failed_index: Option<usize>,
    pub error: Option<String>,
}

/// Why a statement's effect is not acceptable, or None when it touched exactly one row.
pub fn affected_problem(index: usize, affected: u64) -> Option<String> {
    match affected {
        1 => None,
        0 => Some(format!(
            "Change {} matched no row — the row was changed or removed since it was read. Nothing was saved.",
            index + 1
        )),
        n => Some(format!(
            "Change {} would affect {n} rows, not one — the row has no unique key. Nothing was saved.",
            index + 1
        )),
    }
}

/// Apply the batch atomically: all of it, or none.
#[tauri::command]
pub async fn apply_row_edits(
    state: State<'_, AppState>,
    profile_id: String,
    connection_name: String,
    statements: Vec<String>,
    tab_id: Option<String>,
) -> AppResult<EditOutcome> {
    if statements.is_empty() {
        return Ok(EditOutcome { ok: true, failed_index: None, error: None });
    }
    if crate::safety::read_only(&state, &profile_id) {
        return Err(crate::error::AppError::InvalidSettings(format!("\"{connection_name}\" is read-only: its data cannot be edited.")));
    }
    let started = std::time::Instant::now();
    // A tab in manual-commit mode: the edits join ITS open transaction and
    // show as uncommitted, instead of committing on their own.
    let tab = tab_id.as_deref().filter(|t| !t.is_empty());
    let manual_tab = match tab {
        Some(t) => {
            let guard = state.sessions.checkout(&state, &profile_id, t).await?;
            if guard.manual { Some(guard) } else { None }
        }
        None => None,
    };
    let outcome = match manual_tab {
        Some(mut s) => {
            let (outcome, lost) = apply_in_open_transaction(&mut s, &statements).await;
            // A dead session is forgotten, so the next action opens a fresh one.
            if let (true, Some(t)) = (lost, tab) {
                state.sessions.forget_lost(t, s).await;
            }
            outcome
        }
        None => {
            let pool = require_pool(&state, &profile_id).await?;
            apply_batch(&pool, &statements).await?
        }
    };
    let _ = history::append_history(
        &state,
        HistoryEntry {
            id: format!("h-{}-edits", chrono::Utc::now().timestamp_millis()),
            executed_at: chrono::Utc::now().to_rfc3339(),
            profile_id,
            connection_name,
            sql: statements.join("\n"),
            statement_count: statements.len(),
            elapsed_ms: started.elapsed().as_millis() as u64,
            exec_ms: None,
            fetch_ms: None,
            truncated: None,
            success: outcome.ok,
            error: outcome.error.clone(),
            row_count: if outcome.ok { statements.len() as u64 } else { 0 },
        },
    );
    Ok(outcome)
}

/// Edits inside a manual-commit tab's open transaction. Exasol has no
/// savepoints, so a change that fails or touches the wrong number of rows
/// stops the batch and the changes before it stay in the open transaction —
/// the message says so, and Roll back undoes all of it.
/// The flag says whether the connection was lost.
async fn apply_in_open_transaction(s: &mut crate::session::TabSession, statements: &[String]) -> (EditOutcome, bool) {
    let mut ran = Vec::new();
    for (i, sql) in statements.iter().enumerate() {
        let problem = match s.conn.execute(AssertSqlSafe(sql.as_str())).await {
            Ok(done) => affected_problem(i, done.rows_affected()),
            Err(e) if crate::session::is_connection_lost(&e.to_string()) => {
                // The connection died: the server rolled the whole open
                // transaction back — earlier changes and these edits alike.
                let lost = s.changes.len() + i;
                s.changes.clear();
                let outcome = EditOutcome {
                    ok: false,
                    failed_index: Some(i),
                    error: Some(format!(
                        "The connection was lost ({e}). The server rolled back this tab's open transaction{} — nothing from it was saved.",
                        if lost > 0 { format!(", including {lost} uncommitted change{}", if lost == 1 { "" } else { "s" }) } else { String::new() }
                    )),
                };
                return (outcome, true);
            }
            Err(e) => Some(format!("Change {} failed: {e}.", i + 1)),
        };
        if let Some(error) = problem {
            crate::session::after_run(s, &ran);
            let note = if i > 0 {
                format!(" The {i} change{} before it are in this tab's open transaction — Roll back undoes them.", if i == 1 { "" } else { "s" })
            } else {
                String::new()
            };
            let error = error.replace(" Nothing was saved.", "");
            return (EditOutcome { ok: false, failed_index: Some(i), error: Some(format!("{error}{note}")) }, false);
        }
        ran.push((sql.clone(), true));
    }
    crate::session::after_run(s, &ran);
    (EditOutcome { ok: true, failed_index: None, error: None }, false)
}

/// The batch in one transaction on one connection; rolled back unless every
/// statement touched exactly one row.
pub async fn apply_batch(pool: &ExaPool, statements: &[String]) -> AppResult<EditOutcome> {
    let mut tx = pool.begin().await.map_err(|e| AppError::Storage(e.to_string()))?;
    for (i, sql) in statements.iter().enumerate() {
        let problem = match (&mut *tx).execute(AssertSqlSafe(sql.as_str())).await {
            Ok(done) => affected_problem(i, done.rows_affected()),
            Err(e) => Some(format!("Change {} failed: {e}. Nothing was saved.", i + 1)),
        };
        if let Some(error) = problem {
            let _ = tx.rollback().await;
            return Ok(EditOutcome { ok: false, failed_index: Some(i), error: Some(error) });
        }
    }
    if let Err(e) = tx.commit().await {
        // The server may have committed before the reply was lost, so this is
        // NOT "nothing was saved" — saving again could apply the edits twice.
        return Ok(EditOutcome {
            ok: false,
            failed_index: None,
            error: Some(format!(
                "The commit could not be confirmed ({e}). The changes may or may not have been saved — refresh the result to check before saving again."
            )),
        });
    }
    Ok(EditOutcome { ok: true, failed_index: None, error: None })
}

#[cfg(test)]
mod live {
    //! EXASOL_LIVE_PORT=8565 EXASOL_LIVE_PASSWORD=… cargo test --lib grid_edits::live -- --ignored
    use super::apply_batch;

    #[tokio::test]
    #[ignore = "needs a live database (EXASOL_LIVE_* env)"]
    async fn a_batch_with_one_bad_change_commits_nothing() {
        let profile = crate::profiles::ConnectionProfile {
            id: "live".into(),
            name: "live".into(),
            host: std::env::var("EXASOL_LIVE_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            port: std::env::var("EXASOL_LIVE_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8563),
            username: std::env::var("EXASOL_LIVE_USER").unwrap_or_else(|_| "sys".into()),
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
        let q = |s: &str| s.to_string();
        let setup = [
            "CREATE SCHEMA IF NOT EXISTS STUDIO_EDIT_PROBE",
            "CREATE OR REPLACE TABLE STUDIO_EDIT_PROBE.T (ID DECIMAL(9,0), NAME VARCHAR(20))",
            "INSERT INTO STUDIO_EDIT_PROBE.T VALUES (1, 'a'), (2, 'b')",
        ];
        for s in setup {
            crate::query::fetch_all_rows(&pool, s).await.ok();
        }
        let out = apply_batch(
            &pool,
            &[q("UPDATE STUDIO_EDIT_PROBE.T SET NAME = 'changed' WHERE ID = 1"), q("UPDATE STUDIO_EDIT_PROBE.T SET NAME = 'x' WHERE ID = 99")],
        )
        .await
        .unwrap();
        assert!(!out.ok);
        assert_eq!(out.failed_index, Some(1));
        let rows = crate::query::fetch_all_rows(&pool, "SELECT NAME FROM STUDIO_EDIT_PROBE.T WHERE ID = 1").await.unwrap();
        assert_eq!(rows[0][0], serde_json::json!("a"), "the first change was rolled back with the batch");
        let good = apply_batch(&pool, &[q("UPDATE STUDIO_EDIT_PROBE.T SET NAME = 'ok' WHERE ID = 2")]).await.unwrap();
        assert!(good.ok);
        let rows = crate::query::fetch_all_rows(&pool, "SELECT NAME FROM STUDIO_EDIT_PROBE.T WHERE ID = 2").await.unwrap();
        assert_eq!(rows[0][0], serde_json::json!("ok"));
        crate::query::fetch_all_rows(&pool, "DROP SCHEMA STUDIO_EDIT_PROBE CASCADE").await.ok();
        pool.close().await;
    }
}

#[cfg(test)]
mod tests {
    use super::affected_problem;

    #[test]
    fn each_change_must_touch_exactly_one_row() {
        assert_eq!(affected_problem(0, 1), None);
        let none = affected_problem(2, 0).unwrap();
        assert!(none.starts_with("Change 3 matched no row"), "{none}");
        assert!(none.ends_with("Nothing was saved."));
        let many = affected_problem(0, 4).unwrap();
        assert!(many.contains("4 rows, not one"), "{many}");
    }
}
