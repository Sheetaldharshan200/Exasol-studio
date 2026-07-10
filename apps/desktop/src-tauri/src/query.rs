use futures_util::TryStreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use sqlx_exasol::{AssertSqlSafe, Column, ExaPool, ExaRow, Row, TypeInfo};
use tauri::State;

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
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResponse {
    pub results: Vec<StatementResult>,
    pub total_elapsed_ms: u64,
    pub success: bool,
}

/// Decode one cell into JSON, trying types from most to least specific.
fn decode_cell(row: &ExaRow, idx: usize) -> Value {
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v.map(Value::from).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v.map(Value::from).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v.map(|f| json!(f)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<rust_decimal::Decimal>, _>(idx) {
        return v
            .map(|d| Value::String(d.to_string()))
            .unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v.map(Value::String).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(idx) {
        return v
            .map(|d| Value::String(d.to_string()))
            .unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(idx) {
        return v
            .map(|d| Value::String(d.format("%Y-%m-%d %H:%M:%S%.3f").to_string()))
            .unwrap_or(Value::Null);
    }
    Value::Null
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

/// Split a script into statements, respecting quotes, line and block comments.
pub fn split_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut chars = sql.chars().peekable();
    let mut in_single = false;
    let mut in_double = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;

    while let Some(ch) = chars.next() {
        if in_line_comment {
            current.push(ch);
            if ch == '\n' {
                in_line_comment = false;
            }
            continue;
        }
        if in_block_comment {
            current.push(ch);
            if ch == '*' && chars.peek() == Some(&'/') {
                current.push(chars.next().unwrap());
                in_block_comment = false;
            }
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
            '-' if !in_single && !in_double && chars.peek() == Some(&'-') => {
                in_line_comment = true;
                current.push(ch);
            }
            '/' if !in_single && !in_double && chars.peek() == Some(&'*') => {
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
    }
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        statements.push(trimmed.to_string());
    }
    statements
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

async fn run_statement(pool: &ExaPool, statement: &str, max_rows: usize) -> StatementResult {
    let started = std::time::Instant::now();

    if is_result_set_statement(statement) {
        let mut stream = sqlx_exasol::query(AssertSqlSafe(statement.to_string())).fetch(pool);
        let mut columns: Vec<ColumnMeta> = Vec::new();
        let mut rows: Vec<Vec<Value>> = Vec::new();
        let mut truncated = false;
        let mut error = None;

        loop {
            match stream.try_next().await {
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
        StatementResult {
            statement: statement.to_string(),
            kind: "resultSet".to_string(),
            columns,
            rows,
            row_count,
            truncated,
            elapsed_ms: started.elapsed().as_millis() as u64,
            error,
        }
    } else {
        match sqlx_exasol::query(AssertSqlSafe(statement.to_string()))
            .execute(pool)
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
                error: Some(err.to_string()),
            },
        }
    }
}

#[tauri::command]
pub async fn execute_sql(
    state: State<'_, AppState>,
    profile_id: String,
    connection_name: String,
    sql: String,
    max_rows: Option<usize>,
) -> AppResult<ExecuteResponse> {
    let pool = require_pool(&state, &profile_id).await?;
    let max_rows = max_rows.unwrap_or(1000).clamp(1, 100_000);
    let statements = split_statements(&sql);

    let started = std::time::Instant::now();
    let mut results = Vec::with_capacity(statements.len());
    let mut success = true;

    for statement in &statements {
        let result = run_statement(&pool, statement, max_rows).await;
        let failed = result.error.is_some();
        results.push(result);
        if failed {
            success = false;
            break; // stop the script at the first failing statement
        }
    }

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
        success,
        error: results.iter().find_map(|r| r.error.clone()),
        row_count: row_total,
    };
    history::append_history(&state, entry)?;

    Ok(ExecuteResponse {
        results,
        total_elapsed_ms,
        success,
    })
}
