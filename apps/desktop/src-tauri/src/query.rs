use futures_util::TryStreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use sqlx_exasol::{AssertSqlSafe, Column, ExaPool, ExaRow, Row, TypeInfo, ValueRef};
use tauri::{Emitter, State};

use crate::connection::require_pool;
use crate::error::AppResult;
use crate::history::{self, HistoryEntry};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnMeta {
    pub name: String,
    pub type_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementResult {
    pub statement: String,
    pub kind: String, // "resultSet" | "rowCount"
    pub columns: Vec<ColumnMeta>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: u64,
    pub truncated: bool,
    pub elapsed_ms: u64,
    /// Time until the server answered (first row / completion) — the query's
    /// own execution cost.
    pub exec_ms: u64,
    /// Time spent streaming the rows over the wire after execution.
    pub fetch_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResponse {
    pub results: Vec<StatementResult>,
    pub total_elapsed_ms: u64,
    pub success: bool,
    /// Session that ran this batch, and the statement id observed just BEFORE
    /// it — the profiled query is the first statement after this baseline on
    /// this session. Lets Query Performance read the profile of the ORIGINAL
    /// run (profiling is on per session) without re-executing. None for
    /// bridge-driver connections, which native profiling doesn't cover.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_session: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_base_stmt: Option<String>,
}

/// Decode one cell into JSON, trying types from most to least specific.
///
/// NULL is resolved FIRST, from the raw value, so a genuine NULL is never
/// confused with "no branch below matched". Everything after that point is a
/// non-NULL value we are obliged to render as something truthful.
///
/// The typed ladder below goes through `try_get`, which gates on the column's
/// DECLARED type before decoding. That gate is why the exotic Exasol types
/// (INTERVAL, GEOMETRY, HASHTYPE, …) used to fall through every branch and
/// land on `Value::Null` — silently rendering real data as NULL in the grid.
/// The `try_get_unchecked` fallback skips the gate and decodes the raw wire
/// value; Exasol's protocol is JSON, so those types arrive as JSON strings and
/// round-trip correctly.
fn decode_cell(row: &ExaRow, idx: usize) -> Value {
    // Authoritative NULL check — independent of any type compatibility.
    match row.try_get_raw(idx) {
        Ok(raw) if raw.is_null() => return Value::Null,
        Err(_) => return Value::Null, // index out of range: nothing to decode
        Ok(_) => {}
    }

    if let Ok(Some(v)) = row.try_get::<Option<bool>, _>(idx) {
        return Value::from(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(idx) {
        return Value::from(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<f64>, _>(idx) {
        return json!(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<rust_decimal::Decimal>, _>(idx) {
        return Value::String(v.to_string());
    }
    if let Ok(Some(v)) = row.try_get::<Option<String>, _>(idx) {
        return Value::String(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<chrono::NaiveDate>, _>(idx) {
        return Value::String(v.to_string());
    }
    if let Ok(Some(v)) = row.try_get::<Option<chrono::NaiveDateTime>, _>(idx) {
        return Value::String(v.format("%Y-%m-%d %H:%M:%S%.3f").to_string());
    }

    // Not NULL, but no declared-type branch matched. Decode the raw wire value
    // without the compatibility gate rather than lying with NULL.
    if let Ok(Some(v)) = row.try_get_unchecked::<Option<String>, _>(idx) {
        return Value::String(v);
    }
    if let Ok(Some(v)) = row.try_get_unchecked::<Option<f64>, _>(idx) {
        return json!(v);
    }

    // Genuinely undecodable and genuinely not NULL. Say so rather than render
    // it as NULL — a visible marker is a bug report, a silent NULL is data loss.
    Value::String(format!(
        "<unreadable {}>",
        row.columns()
            .get(idx)
            .map(|c| c.type_info().name().to_string())
            .unwrap_or_else(|| "value".into())
    ))
}

pub fn row_to_json(row: &ExaRow) -> Vec<Value> {
    (0..row.columns().len())
        .map(|idx| decode_cell(row, idx))
        .collect()
}

pub fn row_columns(row: &ExaRow) -> Vec<ColumnMeta> {
    row.columns()
        .iter()
        .map(|col| ColumnMeta {
            name: col.name().to_string(),
            type_name: col.type_info().name().to_string(),
        })
        .collect()
}

/// Convenience used by metadata queries: fetch every row as JSON cells.
pub async fn fetch_all_rows(pool: &ExaPool, sql: &str) -> AppResult<Vec<Vec<Value>>> {
    let rows = sqlx_exasol::query(AssertSqlSafe(sql.to_string()))
        .fetch_all(pool)
        .await?;
    Ok(rows.iter().map(row_to_json).collect())
}

/// Split a script into statements, respecting quotes, line and block
/// comments. An exaplus-style script block — a line starting with `--/`
/// through a line holding only `/` — is ONE statement (a CREATE SCRIPT body
/// may contain semicolons), sent without the marker lines. Mirrors the
/// frontend splitter (lib/sql-text.ts::splitStatements) so "Run" sends
/// exactly what the editor shows.
pub fn split_statements(sql: &str) -> Vec<String> {
    let chars: Vec<char> = sql.chars().collect();
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut i = 0usize;

    while i < chars.len() {
        let ch = chars[i];
        let next = chars.get(i + 1).copied();
        if in_line_comment {
            current.push(ch);
            if ch == '\n' {
                in_line_comment = false;
            }
            i += 1;
            continue;
        }
        if in_block_comment {
            current.push(ch);
            if ch == '*' && next == Some('/') {
                current.push('/');
                i += 1;
                in_block_comment = false;
            }
            i += 1;
            continue;
        }
        match ch {
            '\'' if !in_double => {
                in_single = !in_single;
                current.push(ch);
            }
            '"' if !in_single => {
                in_double = !in_double;
                current.push(ch);
            }
            '-' if !in_single && !in_double && next == Some('-') => {
                // `--/` at the start of a line with no statement pending opens
                // a script block ending at a line holding only `/`.
                let at_line_start = i == 0 || chars[i - 1] == '\n';
                if at_line_start && chars.get(i + 2) == Some(&'/') && current.trim().is_empty() {
                    // Skip the marker line.
                    let mut j = i;
                    while j < chars.len() && chars[j] != '\n' {
                        j += 1;
                    }
                    if j >= chars.len() {
                        current.clear();
                        i = chars.len();
                        break;
                    }
                    j += 1; // past the marker's newline
                    let body_start = j;
                    // Find the line that is exactly "/" (or run to EOF).
                    let mut body_end = chars.len();
                    loop {
                        let line_start = j;
                        while j < chars.len() && chars[j] != '\n' {
                            j += 1;
                        }
                        let line: String = chars[line_start..j].iter().collect();
                        if line.trim() == "/" {
                            body_end = line_start;
                            j = if j < chars.len() { j + 1 } else { j };
                            break;
                        }
                        if j >= chars.len() {
                            break;
                        }
                        j += 1;
                    }
                    let body: String = chars[body_start..body_end.min(chars.len())].iter().collect();
                    let trimmed = body.trim();
                    if !trimmed.is_empty() {
                        statements.push(trimmed.to_string());
                    }
                    current.clear();
                    i = j;
                    continue;
                }
                in_line_comment = true;
                current.push(ch);
            }
            '/' if !in_single && !in_double && next == Some('*') => {
                in_block_comment = true;
                current.push(ch);
            }
            ';' if !in_single && !in_double => {
                let trimmed = current.trim();
                if !trimmed.is_empty() {
                    statements.push(trimmed.to_string());
                }
                current.clear();
            }
            _ => current.push(ch),
        }
        i += 1;
    }
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        statements.push(trimmed.to_string());
    }
    statements
}

/// Parse a percentage out of an Exasol session ACTIVITY string like
/// "MERGE (37%)" → Some(37). Uses the LAST parenthesis so nested labels
/// (e.g. "COMMIT (WAIT) (5%)") read the trailing progress group. Returns
/// None when there is no "(NN%)" group.
fn parse_activity_percent(a: &str) -> Option<u8> {
    let open = a.rfind('(')?;
    let rest = &a[open + 1..];
    let close = rest.find('%')?;
    rest[..close].trim().parse::<u8>().ok()
}

fn is_result_set_statement(statement: &str) -> bool {
    let first_word = statement
        .trim_start_matches(|c: char| c.is_whitespace())
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    // Comments before the keyword: strip crude leading comments.
    let lowered = statement.trim_start();
    let effective = if lowered.starts_with("--") || lowered.starts_with("/*") {
        // Fall back to scanning for the first keyword after comments.
        statement
            .lines()
            .map(str::trim)
            .find(|l| !l.is_empty() && !l.starts_with("--"))
            .unwrap_or("")
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_ascii_uppercase()
    } else {
        first_word
    };
    matches!(
        effective.as_str(),
        "SELECT" | "WITH" | "VALUES" | "DESCRIBE" | "DESC" | "EXPLAIN"
    )
}

/// Column metadata for a statement without reading any rows (used when a query
/// returns zero rows, so the results grid can still show the header).
async fn describe_columns(pool: &ExaPool, statement: &str) -> Vec<ColumnMeta> {
    use sqlx_exasol::{Executor, SqlSafeStr};
    match pool.describe(AssertSqlSafe(statement.to_string()).into_sql_str()).await {
        Ok(desc) => desc
            .columns()
            .iter()
            .map(|c| ColumnMeta {
                name: c.name().to_string(),
                type_name: c.type_info().name().to_string(),
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}

async fn run_statement(
    pool: &ExaPool,
    conn: &mut sqlx_exasol::ExaConnection,
    statement: &str,
    max_rows: usize,
) -> StatementResult {
    let started = std::time::Instant::now();

    if is_result_set_statement(statement) {
        let mut stream = sqlx_exasol::query(AssertSqlSafe(statement.to_string())).fetch(&mut *conn);
        let mut columns: Vec<ColumnMeta> = Vec::new();
        let mut rows: Vec<Vec<Value>> = Vec::new();
        let mut truncated = false;
        let mut error = None;
        // Exec = until the server's first answer arrives (the query has run by
        // then); everything after is fetch (streaming rows to the client).
        let mut exec_ms: Option<u64> = None;

        loop {
            let item = stream.try_next().await;
            if exec_ms.is_none() {
                exec_ms = Some(started.elapsed().as_millis() as u64);
            }
            match item {
                Ok(Some(row)) => {
                    if columns.is_empty() {
                        columns = row_columns(&row);
                    }
                    if rows.len() >= max_rows {
                        truncated = true;
                        break;
                    }
                    rows.push(row_to_json(&row));
                }
                Ok(None) => break,
                Err(err) => {
                    error = Some(err.to_string());
                    break;
                }
            }
        }

        // A result set with zero rows has no row to read column metadata from —
        // ask the server to describe the statement so the header still shows.
        if columns.is_empty() && error.is_none() {
            columns = describe_columns(pool, statement).await;
        }

        let row_count = rows.len() as u64;
        let elapsed_ms = started.elapsed().as_millis() as u64;
        let exec_ms = exec_ms.unwrap_or(elapsed_ms);
        StatementResult {
            statement: statement.to_string(),
            kind: "resultSet".to_string(),
            columns,
            rows,
            row_count,
            truncated,
            elapsed_ms,
            exec_ms,
            fetch_ms: elapsed_ms.saturating_sub(exec_ms),
            error,
        }
    } else {
        match sqlx_exasol::query(AssertSqlSafe(statement.to_string()))
            .execute(&mut *conn)
            .await
        {
            Ok(done) => StatementResult {
                statement: statement.to_string(),
                kind: "rowCount".to_string(),
                columns: Vec::new(),
                rows: Vec::new(),
                row_count: done.rows_affected(),
                truncated: false,
                elapsed_ms: started.elapsed().as_millis() as u64,
                exec_ms: started.elapsed().as_millis() as u64,
                fetch_ms: 0,
                error: None,
            },
            Err(err) => StatementResult {
                statement: statement.to_string(),
                kind: "rowCount".to_string(),
                columns: Vec::new(),
                rows: Vec::new(),
                row_count: 0,
                truncated: false,
                elapsed_ms: started.elapsed().as_millis() as u64,
                exec_ms: started.elapsed().as_millis() as u64,
                fetch_ms: 0,
                error: Some(err.to_string()),
            },
        }
    }
}

#[tauri::command]
pub async fn execute_sql(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
    connection_name: String,
    sql: String,
    max_rows: Option<usize>,
    split: Option<bool>,
    add_history: Option<bool>,
    progress_id: Option<String>,
) -> AppResult<ExecuteResponse> {
    let max_rows = max_rows.unwrap_or(1000).clamp(1, 100_000);
    // `split` false runs the whole buffer as a single statement.
    let statements = if split.unwrap_or(true) {
        split_statements(&sql)
    } else {
        let trimmed = sql.trim().trim_end_matches(';').trim().to_string();
        if trimmed.is_empty() {
            Vec::new()
        } else {
            vec![trimmed]
        }
    };

    let started = std::time::Instant::now();

    // If this connection's driver is a non-native one (PyExasol, JDBC, …), run
    // the statements through that driver's runtime instead of native sqlx.
    let profile = crate::profiles::find_profile(&state, &profile_id)?;
    let (results, success, profile_session, profile_base_stmt) = if crate::driver_exec::is_bridge_driver(&profile.driver_id) {
        let stmts = statements.clone();
        let resp = tokio::task::spawn_blocking(move || {
            crate::driver_exec::execute_via_driver(&app, &profile, &stmts, max_rows)
        })
        .await
        .map_err(|e| crate::error::AppError::Storage(e.to_string()))??;
        (resp.results, resp.success, None, None)
    } else {
        let pool = require_pool(&state, &profile_id).await?;
        // ONE connection for the whole batch: statements from a script share a
        // session, so ALTER SESSION (e.g. PROFILE), transactions, and session
        // functions like CURRENT_SESSION behave like they do in any SQL client.
        // Round-robining the pool per statement broke the query profiler.
        let mut conn = pool
            .acquire()
            .await
            .map_err(|e| crate::error::AppError::Storage(e.to_string()))?;

        // Baseline for the Query Performance view: the session + the statement
        // id BEFORE the user's statements run. Since profiling is on per session
        // (see connection.rs), the user's query is profiled during this run, and
        // the profiled statement is the first one after this baseline. Reading it
        // here is one cheap scalar query and lets the plan be fetched later
        // without re-executing. Best-effort — profiling still works if it fails.
        let (profile_session, profile_base_stmt): (Option<String>, Option<String>) =
            match sqlx_exasol::query("SELECT TO_CHAR(CURRENT_SESSION), TO_CHAR(CURRENT_STATEMENT)")
                .fetch_one(&mut *conn)
                .await
            {
                Ok(row) => (
                    row.try_get::<String, _>(0).ok(),
                    row.try_get::<String, _>(1).ok(),
                ),
                Err(_) => (None, None),
            };

        // Register this run as cancellable (Stop → KILL STATEMENT) now that the
        // executing session id is known; removed the moment the batch finishes.
        if let (Some(pid), Some(sid)) = (
            progress_id.as_ref().filter(|p| !p.is_empty()),
            profile_session.as_ref(),
        ) {
            if let Ok(mut m) = state.running_queries.lock() {
                m.insert(pid.clone(), (profile_id.clone(), sid.clone()));
            }
        }

        // Live progress (issues #19/#20): a side task polls the EXECUTING
        // session's ACTIVITY from EXA_ALL_SESSIONS (Exasol reports "SELECT
        // (42%)" style percentages there) and streams it to the frontend as
        // `query-progress:<id>` events. try_acquire keeps it from queuing
        // behind the batch when the pool is size 1.
        let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stmt_idx = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        if let Some(pid) = progress_id.as_ref().filter(|p| !p.is_empty()) {
            // Reuse the session captured above — do NOT run another statement
            // here. A separate SELECT would land BETWEEN the baseline and the
            // user's query, and the plan's "first statement after baseline"
            // would then resolve to that throwaway select (only a COMPILE part)
            // instead of the real query.
            let session_id: Option<String> = profile_session.clone();
            let event = format!("query-progress:{pid}");
            let poll_pool = pool.clone();
            let poll_done = done.clone();
            let poll_idx = stmt_idx.clone();
            let total = statements.len();
            let app2 = app.clone();
            let started2 = started;
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
                    if poll_done.load(std::sync::atomic::Ordering::Relaxed) {
                        break;
                    }
                    let mut activity: Option<String> = None;
                    if let Some(sid) = session_id.as_deref() {
                        if let Some(mut c) = poll_pool.try_acquire() {
                            let sql = format!(
                                "SELECT ACTIVITY FROM SYS.EXA_ALL_SESSIONS WHERE TO_CHAR(SESSION_ID) = '{}'",
                                sid.replace('\'', "''")
                            );
                            if let Ok(row) = sqlx_exasol::query(AssertSqlSafe(sql)).fetch_one(&mut *c).await {
                                activity = row.try_get::<String, _>(0).ok();
                            }
                        }
                    }
                    let percent = activity.as_deref().and_then(parse_activity_percent);
                    let _ = app2.emit(
                        &event,
                        json!({
                            "statement": poll_idx.load(std::sync::atomic::Ordering::Relaxed) + 1,
                            "total": total,
                            "activity": activity,
                            "percent": percent,
                            "elapsedMs": started2.elapsed().as_millis() as u64,
                            "finished": false,
                        }),
                    );
                }
            });
        }

        let mut results = Vec::with_capacity(statements.len());
        let mut success = true;
        for (i, statement) in statements.iter().enumerate() {
            stmt_idx.store(i, std::sync::atomic::Ordering::Relaxed);
            let result = run_statement(&pool, &mut conn, statement, max_rows).await;
            let failed = result.error.is_some();
            results.push(result);
            if failed {
                success = false;
                break; // stop the script at the first failing statement
            }
        }
        done.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(pid) = progress_id.as_ref().filter(|p| !p.is_empty()) {
            // No longer cancellable — the batch has finished.
            if let Ok(mut m) = state.running_queries.lock() {
                m.remove(pid);
            }
            let _ = app.emit(
                &format!("query-progress:{pid}"),
                json!({ "finished": true, "elapsedMs": started.elapsed().as_millis() as u64 }),
            );
        }
        (results, success, profile_session, profile_base_stmt)
    };

    let total_elapsed_ms = started.elapsed().as_millis() as u64;
    let row_total: u64 = results
        .iter()
        .filter(|r| r.kind == "resultSet")
        .map(|r| r.row_count)
        .sum();

    let entry = HistoryEntry {
        id: format!("h-{}", chrono::Utc::now().timestamp_millis()),
        executed_at: chrono::Utc::now().to_rfc3339(),
        profile_id: profile_id.clone(),
        connection_name,
        sql: sql.clone(),
        statement_count: statements.len(),
        elapsed_ms: total_elapsed_ms,
        exec_ms: Some(results.iter().map(|r| r.exec_ms).sum()),
        fetch_ms: Some(results.iter().map(|r| r.fetch_ms).sum()),
        truncated: Some(results.iter().any(|r| r.truncated)),
        success,
        error: results.iter().find_map(|r| r.error.clone()),
        row_count: row_total,
    };
    // Background page prefetches pass add_history=false so the execution log
    // only records what the user actually ran.
    if add_history.unwrap_or(true) {
        history::append_history(&state, entry)?;
    }

    Ok(ExecuteResponse {
        results,
        total_elapsed_ms,
        success,
        profile_session,
        profile_base_stmt,
    })
}

/// Cancel a running query (the Stop button). Looks up the run registered by
/// execute_sql under `progress_id`, then cancels its CURRENT statement via
/// `KILL STATEMENT IN SESSION <id>` on a spare pool connection — the session
/// (and its connection) survives, matching a SQL client's "Stop". Returns true
/// when a kill was issued, false when nothing was running under that id.
#[tauri::command]
pub async fn cancel_query(state: State<'_, AppState>, progress_id: String) -> AppResult<bool> {
    let target = state
        .running_queries
        .lock()
        .ok()
        .and_then(|m| m.get(&progress_id).cloned());
    let (profile_id, session_id) = match target {
        Some(t) => t,
        None => return Ok(false),
    };
    // The session id is interpolated into SQL — it must be a plain number.
    if session_id.is_empty() || !session_id.bytes().all(|b| b.is_ascii_digit()) {
        return Ok(false);
    }
    let pool = require_pool(&state, &profile_id).await?;
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| crate::error::AppError::Storage(e.to_string()))?;
    let kill = format!("KILL STATEMENT IN SESSION {session_id}");
    sqlx_exasol::query(AssertSqlSafe(kill))
        .execute(&mut *conn)
        .await
        .map_err(|e| crate::error::AppError::Storage(e.to_string()))?;
    Ok(true)
}


#[cfg(test)]
mod tests {
    use super::{is_result_set_statement, parse_activity_percent, split_statements};

    #[test]
    fn parses_simple_percent() {
        assert_eq!(parse_activity_percent("MERGE (37%)"), Some(37));
        assert_eq!(parse_activity_percent("SELECT (0%)"), Some(0));
        assert_eq!(parse_activity_percent("(100%)"), Some(100));
    }

    #[test]
    fn tolerates_whitespace_inside_group() {
        assert_eq!(parse_activity_percent("SCAN ( 42 %)"), Some(42));
    }

    #[test]
    fn uses_last_parenthesis_group() {
        assert_eq!(parse_activity_percent("COMMIT (WAIT) (5%)"), Some(5));
    }

    #[test]
    fn none_when_no_percent_group() {
        assert_eq!(parse_activity_percent(""), None);
        assert_eq!(parse_activity_percent("EXECUTE SQL"), None);
        assert_eq!(parse_activity_percent("(no digits%)"), None);
        assert_eq!(parse_activity_percent("(37)"), None); // paren but no %
        assert_eq!(parse_activity_percent("37%"), None); // % but no paren
    }

    #[test]
    fn out_of_u8_range_is_none() {
        // Exasol never emits >100, but a 3-digit value must not panic.
        assert_eq!(parse_activity_percent("(999%)"), None);
    }

    // ── split_statements ───────────────────────────────────────────────────
    // A naive split(';') would shred string literals and comments, so every
    // case below is a way that shredding shows up as a user-visible bug.

    #[test]
    fn splits_plain_statements() {
        assert_eq!(
            split_statements("SELECT 1; SELECT 2"),
            vec!["SELECT 1", "SELECT 2"]
        );
    }

    #[test]
    fn empty_and_whitespace_input_yields_nothing() {
        assert!(split_statements("").is_empty());
        assert!(split_statements("   \n\t  ").is_empty());
        assert!(split_statements(";;;").is_empty());
    }

    #[test]
    fn trailing_semicolon_does_not_add_an_empty_statement() {
        assert_eq!(split_statements("SELECT 1;"), vec!["SELECT 1"]);
        assert_eq!(split_statements("SELECT 1;  \n "), vec!["SELECT 1"]);
    }

    #[test]
    fn statement_without_trailing_semicolon_is_kept() {
        assert_eq!(split_statements("SELECT 1"), vec!["SELECT 1"]);
    }

    #[test]
    fn semicolon_inside_a_single_quoted_literal_is_not_a_split() {
        assert_eq!(
            split_statements("SELECT 'a;b' FROM t"),
            vec!["SELECT 'a;b' FROM t"]
        );
    }

    #[test]
    fn semicolon_inside_a_quoted_identifier_is_not_a_split() {
        assert_eq!(
            split_statements("SELECT \"we;ird\" FROM t"),
            vec!["SELECT \"we;ird\" FROM t"]
        );
    }

    #[test]
    fn a_quote_inside_the_other_quote_style_is_literal_text() {
        // The double quote here is data, so it must not open an identifier.
        assert_eq!(
            split_statements("SELECT 'it\"s'; SELECT 2"),
            vec!["SELECT 'it\"s'", "SELECT 2"]
        );
        // ...and vice versa.
        assert_eq!(
            split_statements("SELECT \"it's\"; SELECT 2"),
            vec!["SELECT \"it's\"", "SELECT 2"]
        );
    }

    #[test]
    fn semicolon_inside_a_line_comment_is_not_a_split() {
        assert_eq!(
            split_statements("SELECT 1 -- a; b\n; SELECT 2"),
            vec!["SELECT 1 -- a; b", "SELECT 2"]
        );
    }

    #[test]
    fn semicolon_inside_a_block_comment_is_not_a_split() {
        assert_eq!(
            split_statements("SELECT /* a; b */ 1; SELECT 2"),
            vec!["SELECT /* a; b */ 1", "SELECT 2"]
        );
    }

    #[test]
    fn comments_are_preserved_in_the_statement_text() {
        // Exasol hint comments are semantically meaningful — never strip them.
        let out = split_statements("/*+ some_hint */ SELECT 1");
        assert_eq!(out, vec!["/*+ some_hint */ SELECT 1"]);
    }

    #[test]
    fn multiline_script_splits_and_trims() {
        let sql = "\n  SELECT 1;\n\n  SELECT 2;\n\n";
        assert_eq!(split_statements(sql), vec!["SELECT 1", "SELECT 2"]);
    }

    #[test]
    fn unterminated_literal_swallows_the_rest_rather_than_mis_splitting() {
        // Better one bad statement the server rejects than two wrong ones.
        assert_eq!(
            split_statements("SELECT 'oops; SELECT 2"),
            vec!["SELECT 'oops; SELECT 2"]
        );
    }

    #[test]
    fn unterminated_block_comment_swallows_the_rest() {
        assert_eq!(
            split_statements("SELECT 1 /* nope; SELECT 2"),
            vec!["SELECT 1 /* nope; SELECT 2"]
        );
    }

    #[test]
    fn handles_non_ascii_without_slicing_mid_character() {
        assert_eq!(
            split_statements("SELECT 'Grüße'; SELECT 'naïve'"),
            vec!["SELECT 'Grüße'", "SELECT 'naïve'"]
        );
    }

    // ── is_result_set_statement ────────────────────────────────────────────

    #[test]
    fn recognizes_result_set_statements() {
        assert!(is_result_set_statement("SELECT 1"));
        assert!(is_result_set_statement("  select 1"));
        assert!(is_result_set_statement("WITH x AS (SELECT 1) SELECT * FROM x"));
    }

    #[test]
    fn does_not_treat_writes_as_result_sets() {
        assert!(!is_result_set_statement("INSERT INTO t VALUES (1)"));
        assert!(!is_result_set_statement("UPDATE t SET a = 1"));
        assert!(!is_result_set_statement("CREATE TABLE t (a INT)"));
    }

    #[test]
    fn empty_statement_is_not_a_result_set() {
        assert!(!is_result_set_statement(""));
        assert!(!is_result_set_statement("   "));
    }

    #[test]
    fn script_block_is_one_statement_despite_semicolons() {
        let sql = "--/\nCREATE LUA SCALAR SCRIPT m (a DOUBLE)\nRETURNS DOUBLE AS\nfunction run(ctx)\n return ctx.a; \nend\n/\nSELECT m(x) FROM t;";
        let out = split_statements(sql);
        assert_eq!(out.len(), 2);
        assert!(out[0].starts_with("CREATE LUA SCALAR SCRIPT"));
        assert!(out[0].contains("return ctx.a;"));
        assert!(!out[0].contains("--/"));
        assert_eq!(out[1], "SELECT m(x) FROM t");
    }

    #[test]
    fn unterminated_script_block_runs_to_eof() {
        let out = split_statements("--/\nCREATE LUA SCALAR SCRIPT m (a DOUBLE)\nRETURNS DOUBLE AS\nfunction run(ctx) end");
        assert_eq!(out.len(), 1);
        assert!(out[0].starts_with("CREATE LUA SCALAR SCRIPT"));
    }

    #[test]
    fn double_dash_slash_mid_line_stays_a_comment() {
        let out = split_statements("SELECT 1; --/ not a block\nSELECT 2;");
        assert_eq!(out.len(), 2);
        // Comment text is preserved inside the statement (existing behavior);
        // the point is that no script block opened mid-line.
        assert!(out[1].starts_with("--/ not a block"));
        assert!(out[1].ends_with("SELECT 2"));
    }

    #[test]
    fn script_block_between_statements() {
        let sql = "SELECT 1;\n--/\nCREATE PYTHON3 SCALAR SCRIPT p (a INT)\nRETURNS INT AS\ndef run(ctx):\n    return ctx.a\n/\nSELECT 2;";
        let out = split_statements(sql);
        assert_eq!(out.len(), 3);
        assert!(out[1].starts_with("CREATE PYTHON3"));
    }
}
