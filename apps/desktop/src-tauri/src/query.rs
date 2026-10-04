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
    /// "resultSet" — rows follow. "rowCount" — a write, and `row_count` is the
    /// number it affected. "executed" — it ran, but this driver cannot say how
    /// many rows it touched (r-exasol reports no count for writes), so the UI
    /// must not print one.
    pub kind: String,
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

    // Exact first: DECIMAL and TIMESTAMP take the text Exasol sent, as sent.
    // Through f64 or rust_decimal a DECIMAL(36,15) loses digits, and chrono
    // formatting cut TIMESTAMP(6)/(9) to milliseconds, so an edit keyed on it
    // matched no row.
    let declared = row.columns().get(idx).map(|c| c.type_info().name().to_ascii_uppercase()).unwrap_or_default();
    if exact_text_type(&declared) {
        if let Ok(Some(v)) = row.try_get_unchecked::<Option<String>, _>(idx) {
            return Value::String(v);
        }
    }

    if let Ok(Some(v)) = row.try_get::<Option<bool>, _>(idx) {
        return Value::from(v);
    }
    if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(idx) {
        return integer_json(v);
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

/// Rows a run touched, for its history entry: rows returned plus rows a write
/// affected. A driver that cannot count ("executed") adds nothing.
pub(crate) fn history_row_total<'a>(results: impl Iterator<Item = (&'a str, u64)>) -> u64 {
    results.filter(|(kind, _)| *kind == "resultSet" || *kind == "rowCount").map(|(_, n)| n).sum()
}

/// Types whose wire text is the exact value and must not pass through a
/// lossy native type on the way to the grid.
pub(crate) fn exact_text_type(declared_upper: &str) -> bool {
    declared_upper.starts_with("DECIMAL") || declared_upper.starts_with("TIMESTAMP")
}

/// The largest integer a JavaScript number holds exactly.
const JS_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

/// An integer as JSON: a number while the page can hold it exactly, else its
/// digits as a string — `JSON.parse` would round 9007199254740993 to …992.
pub(crate) fn integer_json(v: i64) -> Value {
    if (-JS_SAFE_INTEGER..=JS_SAFE_INTEGER).contains(&v) {
        Value::from(v)
    } else {
        Value::String(v.to_string())
    }
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

/// The statement with leading whitespace, `--` line comments, and `/* */`
/// block comments removed — classification must see the real first token.
/// Shared with the semantic-sync statement classifiers.
pub(crate) fn strip_leading_comments(statement: &str) -> &str {
    let mut s = statement;
    loop {
        let trimmed = s.trim_start();
        if let Some(rest) = trimmed.strip_prefix("--") {
            s = rest.split_once('\n').map(|(_, tail)| tail).unwrap_or("");
        } else if let Some(rest) = trimmed.strip_prefix("/*") {
            s = rest.split_once("*/").map(|(_, tail)| tail).unwrap_or("");
        } else {
            return trimmed;
        }
    }
}

/// Does this statement produce a RESULT SET (vs a row count)?
///
/// Why a keyword list at all: the driver's only both-kinds API re-splits the
/// SQL on semicolons (ExecuteBatch), which would shred `CREATE SCRIPT` bodies
/// — so statements must be routed up front. The set below is CLOSED under
/// Exasol's grammar: result sets come only from queries (SELECT / WITH /
/// VALUES / a parenthesized query), DESCRIBE, and EXECUTE SCRIPT (whose
/// RETURNS TABLE output the rowcount path would silently discard; the fetch
/// path streams a plain script's rowcount result as zero rows, so it is safe
/// for both script shapes).
pub(crate) fn is_result_set_statement(statement: &str) -> bool {
    let body = strip_leading_comments(statement);
    // A parenthesized query — `(SELECT …) UNION …` — has no leading keyword.
    if body.starts_with('(') {
        return true;
    }
    let first_word = body.split_whitespace().next().unwrap_or("").to_ascii_uppercase();
    matches!(
        first_word.as_str(),
        "SELECT" | "WITH" | "VALUES" | "DESCRIBE" | "DESC" | "EXPLAIN" | "EXECUTE"
    )
}

/// Column metadata for a statement without reading any rows (used when a query
/// returns zero rows, so the results grid can still show the header).
async fn describe_columns(conn: &mut sqlx_exasol::ExaConnection, statement: &str) -> Vec<ColumnMeta> {
    use sqlx_exasol::{Executor, SqlSafeStr};
    match conn.describe(AssertSqlSafe(statement.to_string()).into_sql_str()).await {
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
        // On the same connection: a table this session created but has not
        // committed is invisible to any other.
        drop(stream);
        if columns.is_empty() && error.is_none() {
            columns = describe_columns(conn, statement).await;
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

/// When a script stops early (the run's execution options).
#[derive(Clone, Copy, Debug)]
pub struct StopPolicy {
    pub on_error: bool,
    /// After a query that returns no rows, or a DML statement that touches none.
    pub on_no_rows: bool,
}

impl Default for StopPolicy {
    fn default() -> Self {
        Self { on_error: true, on_no_rows: false }
    }
}

impl StopPolicy {
    pub fn halts_after(&self, r: &StatementResult) -> bool {
        if r.error.is_some() {
            // A lost connection ends the script whatever the setting says.
            return self.on_error || r.error.as_deref().is_some_and(crate::session::is_connection_lost);
        }
        r.row_count == 0 && (r.kind == "resultSet" || r.kind == "rowCount") && self.empty_halts(&r.statement)
    }

    /// Whether an empty result of this statement ends the script — a query,
    /// or a DML statement (DDL touches no rows by nature).
    pub fn empty_halts(&self, statement: &str) -> bool {
        self.on_no_rows && (is_result_set_statement(statement) || is_dml(statement))
    }

    /// The same rule, per statement, for a bridge driver's own loop.
    pub fn stop_if_empty(&self, statements: &[String]) -> Vec<bool> {
        statements.iter().map(|s| self.empty_halts(s)).collect()
    }
}

fn is_dml(statement: &str) -> bool {
    let head = strip_leading_comments(statement).trim_start().to_ascii_uppercase();
    matches!(head.split_whitespace().next(), Some("INSERT" | "UPDATE" | "DELETE" | "MERGE"))
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
    tab_id: Option<String>,
    stop_on_error: Option<bool>,
    stop_on_no_rows: Option<bool>,
) -> AppResult<ExecuteResponse> {
    let stop = StopPolicy { on_error: stop_on_error.unwrap_or(true), on_no_rows: stop_on_no_rows.unwrap_or(false) };
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
    // A read-only connection runs only statements that change nothing — on
    // every path that runs SQL here, before anything reaches the server.
    if crate::safety::read_only(&state, &profile_id) {
        if let Some(why) = crate::safety::read_only_refusal(&statements, &connection_name) {
            return Err(crate::error::AppError::InvalidSettings(why));
        }
    }

    let started = std::time::Instant::now();

    // If this connection's driver is a non-native one (PyExasol, JDBC, …), run
    // the statements through that driver's runtime instead of native sqlx.
    let profile = crate::profiles::find_profile(&state, &profile_id)?;
    let native = !crate::exarrow_exec::is_exarrow(&profile.driver_id) && !crate::driver_exec::is_bridge_driver(&profile.driver_id);
    if !native {
        // These drivers connect on their own for each run: what only the
        // native driver applies (pin, CA file, tokens) is refused plainly.
        if let Some(why) = crate::tls_trust::bridge_unsupported(profile.ssl_ca.as_deref(), &profile.auth_method, profile.fingerprint.is_some(), profile.network.is_some()) {
            return Err(crate::error::AppError::InvalidSettings(why));
        }
    }
    // exarrow and bridge runs have no session to KILL a statement in: Stop
    // raises this flag, and the run ends its own connection or process.
    let cancel = CancelFlag::new();
    let _registered = (!native).then(|| RunRegistration::new(&state, progress_id.as_deref(), RunningQuery::Flag(cancel.clone())));
    let (results, success, profile_session, profile_base_stmt) = if crate::exarrow_exec::is_exarrow(&profile.driver_id) {
        // exarrow is compiled in, so it runs on this runtime — no child
        // process, no spawn_blocking, and no sqlx pool standing in for it.
        // Stopped, the run is dropped with its connection: the server ends
        // the session and its statement.
        let resp = tokio::select! {
            r = crate::exarrow_exec::execute_exarrow(&profile, &statements, max_rows, stop) => r?,
            _ = cancel.cancelled() => return Err(crate::error::AppError::Storage(STOPPED.into())),
        };
        (resp.results, resp.success, None, None)
    } else if crate::driver_exec::is_bridge_driver(&profile.driver_id) {
        let stmts = statements.clone();
        let app_for_driver = app.clone();
        let flag = cancel.clone();
        let resp = tokio::task::spawn_blocking(move || {
            crate::driver_exec::execute_via_driver(&app_for_driver, &profile, &stmts, max_rows, stop, &flag)
        })
        .await
        .map_err(|e| crate::error::AppError::Storage(e.to_string()))??;
        (resp.results, resp.success, None, None)
    } else {
        let pool = require_pool(&state, &profile_id).await?;
        // ONE connection for the whole batch: statements from a script share a
        // session, so ALTER SESSION (e.g. PROFILE), transactions, and session
        // functions like CURRENT_SESSION behave like they do in any SQL client.
        // A SQL tab runs on ITS OWN session (session.rs), so state set by one
        // run — OPEN SCHEMA, ALTER SESSION, an open transaction — is there for
        // the next; other callers borrow a pooled connection for the batch.
        let tab = tab_id.as_deref().filter(|t| !t.is_empty());
        let mut session_guard = match tab {
            Some(t) => Some(state.sessions.checkout(&state, &profile_id, t).await?),
            None => None,
        };
        let manual = session_guard.as_ref().is_some_and(|g| g.manual);
        let mut pooled = match session_guard {
            Some(_) => None,
            None => Some(pool.acquire().await.map_err(|e| crate::error::AppError::Storage(e.to_string()))?),
        };
        let conn: &mut sqlx_exasol::ExaConnection = match (session_guard.as_mut(), pooled.as_mut()) {
            (Some(g), _) => &mut g.conn,
            (None, Some(p)) => &mut **p,
            (None, None) => unreachable!("one of the two connections is always set"),
        };

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
                m.insert(pid.clone(), RunningQuery::Session { profile_id: profile_id.clone(), session_id: sid.clone() });
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
            let mut result = run_statement(conn, statement, max_rows).await;
            // A COMMIT or ROLLBACK typed in a manual-commit tab ends the
            // transaction; the next one starts before the next statement runs,
            // or that statement would commit on its own.
            if manual && result.error.is_none() && crate::session::is_txn_end(statement) {
                if let Err(e) = crate::session::restart_manual(conn).await {
                    result.error = Some(format!("Could not restart manual commit ({e}); the remaining statements were not run."));
                }
            }
            if result.error.is_some() {
                success = false;
            }
            let halt = stop.halts_after(&result);
            results.push(result);
            if halt {
                break;
            }
        }
        done.store(true, std::sync::atomic::Ordering::Relaxed);
        // The tab's session: count what is now uncommitted; a session whose
        // connection died is forgotten — the server rolled its work back.
        if let (Some(g), Some(t)) = (session_guard.as_mut(), tab) {
            let lost = results.iter().filter_map(|r| r.error.as_deref()).any(crate::session::is_connection_lost);
            if lost {
                // What the server rolled back: earlier uncommitted changes AND
                // the ones this script made before the connection died.
                let had = if g.manual {
                    let mut lost_changes = g.changes.clone();
                    let ran: Vec<(String, bool)> = results.iter().map(|r| (r.statement.clone(), r.error.is_none())).collect();
                    crate::session::record_changes(&mut lost_changes, &ran);
                    lost_changes.len()
                } else {
                    0
                };
                if let Some(co) = session_guard.take() {
                    state.sessions.forget_lost(t, co).await;
                }
                if let Some(r) = results.iter_mut().rev().find(|r| r.error.is_some()) {
                    let note = if had > 0 {
                        format!(" The session was lost; its {had} uncommitted change{} were rolled back by the server. The next run opens a new session.", if had == 1 { "" } else { "s" })
                    } else {
                        " The session was lost; the next run opens a new session.".to_string()
                    };
                    r.error = r.error.take().map(|e| format!("{e}{note}"));
                }
            } else {
                let ran: Vec<(String, bool)> = results.iter().map(|r| (r.statement.clone(), r.error.is_none())).collect();
                crate::session::after_run(g, &ran);
                crate::session::note_schema(&state, g);
            }
        }
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
    let row_total = history_row_total(results.iter().map(|r| (r.kind.as_str(), r.row_count)));

    // Millis alone collide when runs land in the same millisecond (notebook
    // Run-All, fast statements) — duplicate ids duplicate React rows on sort.
    static HISTORY_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = HISTORY_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let entry = HistoryEntry {
        id: format!("h-{}-{}", chrono::Utc::now().timestamp_millis(), seq),
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

    // A statement that changed the schema may have invalidated a semantic
    // model bound to it. Revalidate in the background — never on the query's
    // own latency — and only for statements that actually succeeded: failed
    // DDL changed nothing.
    let schema_changed = results.iter().any(|r| {
        r.error.is_none()
            && (crate::semantic_sync::is_schema_change(&r.statement)
                || crate::semantic_sync::is_semantic_impacting_script(&r.statement))
    });
    let data_changed = results
        .iter()
        .any(|r| r.error.is_none() && crate::semantic_sync::is_bulk_data_change(&r.statement));
    if schema_changed || data_changed {
        if let Ok(pool) = require_pool(&state, &profile_id).await {
            let app_handle = app.clone();
            let pid = profile_id.clone();
            tauri::async_runtime::spawn(async move {
                // Surfaces are republished only for schema changes; data loads
                // get a validate-only pass.
                crate::semantic_sync::revalidate(&app_handle, &pool, &pid, schema_changed).await;
            });
        }
    }

    Ok(ExecuteResponse {
        results,
        total_elapsed_ms,
        success,
        profile_session,
        profile_base_stmt,
    })
}

/// A run Stop can reach: a native run's server session, or the cancel flag
/// of an exarrow / bridge run.
#[derive(Clone)]
pub enum RunningQuery {
    Session { profile_id: String, session_id: String },
    Flag(CancelFlag),
}

/// What a stopped exarrow or bridge run reports.
pub const STOPPED: &str = "The query was stopped.";

/// Raised once by Stop; waited on (async) or polled (blocking).
#[derive(Clone, Default)]
pub struct CancelFlag(std::sync::Arc<(std::sync::atomic::AtomicBool, tokio::sync::Notify)>);

impl CancelFlag {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn cancel(&self) {
        self.0 .0.store(true, std::sync::atomic::Ordering::SeqCst);
        self.0 .1.notify_waiters();
    }
    pub fn is_cancelled(&self) -> bool {
        self.0 .0.load(std::sync::atomic::Ordering::SeqCst)
    }
    pub async fn cancelled(&self) {
        loop {
            let notified = self.0 .1.notified();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }
}

/// Registers a run under its progress id for as long as it lives.
struct RunRegistration<'a> {
    state: &'a AppState,
    id: Option<String>,
}

impl<'a> RunRegistration<'a> {
    fn new(state: &'a AppState, progress_id: Option<&str>, run: RunningQuery) -> Self {
        let id = progress_id.filter(|p| !p.is_empty()).map(str::to_string);
        if let (Some(id), Ok(mut m)) = (&id, state.running_queries.lock()) {
            m.insert(id.clone(), run);
        }
        Self { state, id }
    }
}

impl Drop for RunRegistration<'_> {
    fn drop(&mut self) {
        if let (Some(id), Ok(mut m)) = (&self.id, self.state.running_queries.lock()) {
            m.remove(id);
        }
    }
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
        Some(RunningQuery::Session { profile_id, session_id }) => (profile_id, session_id),
        Some(RunningQuery::Flag(flag)) => {
            flag.cancel();
            return Ok(true);
        }
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
mod live_decode {
    //! Run by hand against a live database:
    //! EXASOL_LIVE_PORT=8565 EXASOL_LIVE_PASSWORD=… cargo test --lib live_decode -- --ignored --nocapture
    #[tokio::test]
    #[ignore = "needs a live database (EXASOL_LIVE_* env)"]
    async fn live_values_decode_exactly() {
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
            network: None,
        };
        let pool = crate::connection::open_pool(&profile).await.unwrap();
        let rows = super::fetch_all_rows(&pool,
                "SELECT CAST(9007199254740993 AS DECIMAL(18,0)) AS big18, \
                 CAST(-9007199254740993 AS DECIMAL(18,0)) AS negbig18, \
                 CAST(42 AS DECIMAL(18,0)) AS small18, \
                 CAST('123456789012345678901234567890123456' AS DECIMAL(36,0)) AS huge36, \
                 CAST('12345678901234567890.123456789012345' AS DECIMAL(36,15)) AS wide_scale, \
                 CAST(1.5 AS DOUBLE) AS dbl, \
                 CAST('2026-01-02 03:04:05.123456' AS TIMESTAMP(6)) AS ts6, \
                 CAST('2026-01-02 03:04:05.123456789' AS TIMESTAMP(9)) AS ts9, \
                 CAST('2026-01-02 03:04:05' AS TIMESTAMP) AS ts3",
        )
        .await
        .unwrap();
        eprintln!("{}", serde_json::to_string(&rows[0]).unwrap());
        pool.close().await;
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn a_cancel_flag_wakes_its_waiters_and_stays_raised() {
        let flag = super::CancelFlag::new();
        assert!(!flag.is_cancelled());
        let waiter = tokio::spawn({
            let f = flag.clone();
            async move { f.cancelled().await }
        });
        tokio::task::yield_now().await;
        flag.cancel();
        tokio::time::timeout(std::time::Duration::from_secs(2), waiter).await.expect("woken").unwrap();
        assert!(flag.is_cancelled());
        // Raised before anyone waits: the wait returns at once.
        tokio::time::timeout(std::time::Duration::from_secs(2), flag.cancelled()).await.expect("already raised");
    }

    fn result(statement: &str, kind: &str, rows: u64, error: Option<&str>) -> super::StatementResult {
        super::StatementResult {
            statement: statement.into(),
            kind: kind.into(),
            columns: Vec::new(),
            rows: Vec::new(),
            row_count: rows,
            truncated: false,
            elapsed_ms: 0,
            exec_ms: 0,
            fetch_ms: 0,
            error: error.map(str::to_string),
        }
    }

    #[test]
    fn a_script_stops_where_the_execution_options_say() {
        use super::StopPolicy;
        let default = StopPolicy { on_error: true, on_no_rows: false };
        let keep_going = StopPolicy { on_error: false, on_no_rows: false };
        let no_rows = StopPolicy { on_error: true, on_no_rows: true };
        let err = result("SELECT * FROM NOPE", "resultSet", 0, Some("[42000] object NOPE not found"));
        assert!(default.halts_after(&err));
        assert!(!keep_going.halts_after(&err), "stop on error off: go on");
        let lost = result("SELECT 1", "resultSet", 0, Some("WebSocket protocol error: Connection closed normally"));
        assert!(keep_going.halts_after(&lost), "a lost connection always ends the script");
        let empty = result("SELECT * FROM T WHERE 1=0", "resultSet", 0, None);
        assert!(!default.halts_after(&empty));
        assert!(no_rows.halts_after(&empty));
        assert!(no_rows.halts_after(&result("-- fix\nUPDATE T SET A = 1 WHERE 1=0", "rowCount", 0, None)));
        assert!(!no_rows.halts_after(&result("CREATE TABLE X (A INT)", "rowCount", 0, None)), "DDL touches no rows by nature");
        assert!(!no_rows.halts_after(&result("SELECT 1", "resultSet", 1, None)));
        assert!(!no_rows.halts_after(&result("DELETE FROM T", "rowCount", 3, None)));
        assert!(!no_rows.halts_after(&result("INSERT INTO T SELECT 1", "executed", 0, None)), "no count is not zero rows");
    }

    #[test]
    fn bridges_get_the_empty_result_rule_per_statement() {
        use super::StopPolicy;
        let stmts: Vec<String> = ["SELECT 1", "CREATE TABLE X (A INT)", "UPDATE T SET A = 1", "WITH q AS (SELECT 1) SELECT * FROM q"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(StopPolicy { on_error: true, on_no_rows: true }.stop_if_empty(&stmts), vec![true, false, true, true]);
        assert_eq!(StopPolicy::default().stop_if_empty(&stmts), vec![false; 4]);
        assert!(StopPolicy::default().on_error);
    }

    use super::{is_result_set_statement, parse_activity_percent, split_statements};
    use super::{exact_text_type, history_row_total, integer_json};

    #[test]
    fn history_counts_rows_returned_and_rows_written() {
        let run = [("resultSet", 10u64), ("rowCount", 3), ("executed", 0), ("rowCount", 0)];
        assert_eq!(history_row_total(run.iter().copied()), 13);
        assert_eq!(history_row_total([("rowCount", 5u64)].iter().copied()), 5, "an INSERT alone is not 0");
        assert_eq!(history_row_total(std::iter::empty()), 0);
    }

    #[test]
    fn integers_the_page_cannot_hold_exactly_travel_as_text() {
        assert_eq!(integer_json(42), serde_json::json!(42));
        assert_eq!(integer_json(9_007_199_254_740_991), serde_json::json!(9_007_199_254_740_991_i64));
        assert_eq!(integer_json(9_007_199_254_740_992), serde_json::json!("9007199254740992"));
        assert_eq!(integer_json(-9_007_199_254_740_993), serde_json::json!("-9007199254740993"));
        assert_eq!(integer_json(i64::MIN), serde_json::json!(i64::MIN.to_string()));
    }

    #[test]
    fn decimal_and_timestamp_columns_keep_their_wire_text() {
        for t in ["DECIMAL(18,0)", "DECIMAL(36,15)", "TIMESTAMP", "TIMESTAMP(9)", "TIMESTAMP WITH LOCAL TIME ZONE"] {
            assert!(exact_text_type(t), "{t}");
        }
        for t in ["DOUBLE", "VARCHAR(10) UTF8", "DATE", "BOOLEAN", "HASHTYPE(16 BYTE)"] {
            assert!(!exact_text_type(t), "{t}");
        }
    }

    #[test]
    fn execute_script_is_a_result_set_statement() {
        // A script's RETURNS TABLE output must reach the results grid — the
        // rowcount path silently discarded it ("0 rows affected").
        assert!(is_result_set_statement(
            "EXECUTE SCRIPT SEMANTIC_ADMIN.DESCRIBE_SEMANTIC_OBJECT('tpch', 'SALES')"
        ));
        assert!(is_result_set_statement("  execute script my.s()"));
        assert!(!is_result_set_statement("INSERT INTO T VALUES (1)"));
    }

    #[test]
    fn comments_and_parentheses_do_not_hide_a_query() {
        // Every output-producing statement head Exasol has, behind the
        // disguises that used to misroute them.
        assert!(is_result_set_statement("(SELECT 1) UNION ALL (SELECT 2)"));
        assert!(is_result_set_statement("/* optimizer hint */ SELECT 1"));
        assert!(is_result_set_statement("-- comment\nSELECT 1"));
        assert!(is_result_set_statement("/* a */ -- b\n  /* c */ WITH x AS (SELECT 1) SELECT * FROM x"));
        assert!(is_result_set_statement("-- note\nEXECUTE SCRIPT s.t()"));
        assert!(is_result_set_statement("VALUES 1"));
        assert!(is_result_set_statement("DESC my_table"));
        // ...and disguises must not turn writes into queries.
        assert!(!is_result_set_statement("/* c */ INSERT INTO t VALUES (1)"));
        assert!(!is_result_set_statement("-- c\nUPDATE t SET a = 1"));
        assert!(!is_result_set_statement("-- only a comment"));
        assert!(!is_result_set_statement(""));
    }

    #[test]
    fn semantic_scripts_trigger_revalidation_except_the_syncs_own_calls() {
        use crate::semantic_sync::is_semantic_impacting_script;
        assert!(is_semantic_impacting_script(
            "EXECUTE SCRIPT SEMANTIC_ADMIN.CALL_ADMIN_JSON('CREATE_MODEL', '{}')"
        ));
        assert!(is_semantic_impacting_script("execute script etl.load_everything()"));
        assert!(!is_semantic_impacting_script(
            "EXECUTE SCRIPT SEMANTIC_ADMIN.VALIDATE_MODEL('tpch')"
        ));
        assert!(!is_semantic_impacting_script(
            "EXECUTE SCRIPT SEMANTIC_ADMIN.REFRESH_SEMANTIC_SURFACE('tpch')"
        ));
        assert!(!is_semantic_impacting_script("SELECT 1"));
        // a comment must not hide a user script from the sync
        assert!(is_semantic_impacting_script("-- reload\nEXECUTE SCRIPT etl.reload()"));
        // ...and a wrapper that merely MENTIONS the sync's calls still triggers
        assert!(is_semantic_impacting_script(
            "EXECUTE SCRIPT MY.WRAPPER('SEMANTIC_ADMIN.VALIDATE_MODEL')"
        ));
    }

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
