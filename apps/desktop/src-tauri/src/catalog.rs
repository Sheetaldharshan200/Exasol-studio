//! Read-only catalog surfaces for the DataGrip-style connection view:
//! Database Info (server metadata + parameters), Data Types (EXA_SQL_TYPES),
//! and a ranked, cross-object search over the EXA_ALL_* system views.

use serde_json::{json, Value};
use sqlx_exasol::ExaPool;
use tauri::State;

use crate::connection::require_pool;
use crate::error::AppResult;
use crate::metadata::{cell, fetch_first_ok, obj};
use crate::query::fetch_all_rows;
use crate::state::AppState;

/// Database Info tab: everything Exasol reports about itself.
/// `metadata`  → SYS.EXA_METADATA (product name/version, node count, …)
/// `parameters` → SYS.EXA_PARAMETERS (session vs. system values).
#[tauri::command]
pub async fn get_database_info(
    state: State<'_, AppState>,
    profile_id: String,
) -> AppResult<Value> {
    let pool = require_pool(&state, &profile_id).await?;

    let metadata = fetch_all_rows(
        &pool,
        "SELECT PARAM_NAME, PARAM_VALUE FROM SYS.EXA_METADATA ORDER BY PARAM_NAME",
    )
    .await
    .unwrap_or_default();

    let parameters = fetch_first_ok(
        &pool,
        &[
            "SELECT PARAMETER_NAME, SESSION_VALUE, SYSTEM_VALUE \
             FROM SYS.EXA_PARAMETERS ORDER BY PARAMETER_NAME",
            "SELECT PARAMETER_NAME, SESSION_VALUE, SYSTEM_VALUE \
             FROM EXA_PARAMETERS ORDER BY PARAMETER_NAME",
        ],
    )
    .await;

    Ok(json!({
        "metadata": metadata.iter().map(|r| obj(vec![
            ("name", cell(r, 0)), ("value", cell(r, 1)),
        ])).collect::<Vec<_>>(),
        "parameters": parameters.iter().map(|r| obj(vec![
            ("name", cell(r, 0)), ("sessionValue", cell(r, 1)), ("systemValue", cell(r, 2)),
        ])).collect::<Vec<_>>(),
    }))
}

/// Data Types tab: the SQL types the server exposes.
#[tauri::command]
pub async fn list_data_types(state: State<'_, AppState>, profile_id: String) -> AppResult<Value> {
    let pool = require_pool(&state, &profile_id).await?;

    let rows = fetch_first_ok(
        &pool,
        &[
            "SELECT TYPE_ID, TYPE_NAME FROM SYS.EXA_SQL_TYPES ORDER BY TYPE_NAME",
            "SELECT TYPE_ID, TYPE_NAME FROM EXA_SQL_TYPES ORDER BY TYPE_NAME",
        ],
    )
    .await;

    Ok(json!({
        "types": rows.iter().map(|r| obj(vec![
            ("typeId", cell(r, 0)), ("typeName", cell(r, 1)),
        ])).collect::<Vec<_>>(),
    }))
}

/// Schema graph for the visualizer: tables with their columns (primary-key
/// flagged) and the foreign-key links between them.
#[tauri::command]
pub async fn get_schema_graph(
    state: State<'_, AppState>,
    profile_id: String,
    schema: String,
) -> AppResult<Value> {
    let pool = require_pool(&state, &profile_id).await?;
    let lit = schema.replace('\'', "''");

    let columns = fetch_all_rows(
        &pool,
        &format!(
            "SELECT COLUMN_TABLE, COLUMN_NAME, COLUMN_TYPE \
             FROM SYS.EXA_ALL_COLUMNS WHERE COLUMN_SCHEMA = '{lit}' \
             ORDER BY COLUMN_TABLE, COLUMN_ORDINAL_POSITION"
        ),
    )
    .await
    .unwrap_or_default();

    let pks = fetch_all_rows(
        &pool,
        &format!(
            "SELECT cc.CONSTRAINT_TABLE, cc.COLUMN_NAME \
             FROM SYS.EXA_ALL_CONSTRAINT_COLUMNS cc \
             JOIN SYS.EXA_ALL_CONSTRAINTS c \
               ON c.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA \
              AND c.CONSTRAINT_TABLE = cc.CONSTRAINT_TABLE \
              AND c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME \
             WHERE cc.CONSTRAINT_SCHEMA = '{lit}' AND c.CONSTRAINT_TYPE = 'PRIMARY KEY'"
        ),
    )
    .await
    .unwrap_or_default();

    let fks = fetch_all_rows(
        &pool,
        &format!(
            "SELECT CONSTRAINT_TABLE, COLUMN_NAME, REFERENCED_TABLE, REFERENCED_COLUMN \
             FROM SYS.EXA_ALL_CONSTRAINT_COLUMNS \
             WHERE CONSTRAINT_SCHEMA = '{lit}' AND REFERENCED_TABLE IS NOT NULL"
        ),
    )
    .await
    .unwrap_or_default();

    let is_pk = |table: &str, col: &str| -> bool {
        pks.iter().any(|r| {
            r.first().and_then(|v| v.as_str()) == Some(table)
                && r.get(1).and_then(|v| v.as_str()) == Some(col)
        })
    };

    // Group columns by table, preserving order.
    let mut tables: Vec<(String, Vec<Value>)> = Vec::new();
    for row in &columns {
        let table = cell(row, 0).as_str().unwrap_or_default().to_string();
        let col_name = cell(row, 1);
        let col_name_str = col_name.as_str().unwrap_or_default().to_string();
        let entry = obj(vec![
            ("name", col_name),
            ("dataType", cell(row, 2)),
            ("pk", Value::Bool(is_pk(&table, &col_name_str))),
        ]);
        match tables.iter_mut().find(|(t, _)| t == &table) {
            Some((_, cols)) => cols.push(entry),
            None => tables.push((table, vec![entry])),
        }
    }

    let table_list: Vec<Value> = tables
        .into_iter()
        .map(|(name, cols)| obj(vec![("name", Value::String(name)), ("columns", Value::Array(cols))]))
        .collect();

    let link_list: Vec<Value> = fks
        .iter()
        .map(|r| {
            obj(vec![
                ("source", cell(r, 0)),
                ("sourceColumn", cell(r, 1)),
                ("target", cell(r, 2)),
                ("targetColumn", cell(r, 3)),
            ])
        })
        .collect();

    Ok(json!({ "tables": table_list, "links": link_list }))
}

/// Escape a user string for use inside a single-quoted SQL literal, and also
/// neutralise LIKE wildcards so the term is matched literally.
fn like_literal(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len() + 2);
    for ch in raw.chars() {
        match ch {
            '\'' => out.push_str("''"),
            '%' | '_' | '\\' => {
                out.push('\\');
                out.push(ch);
            }
            _ => out.push(ch),
        }
    }
    out
}

/// One search hit, ready for the frontend to render and (optionally) open.
fn hit(
    object_type: &str,
    schema: Value,
    name: Value,
    container: Value,
    detail: Value,
    selectable: bool,
) -> Value {
    obj(vec![
        ("objectType", Value::String(object_type.to_string())),
        ("schema", schema),
        ("name", name),
        ("container", container),
        ("detail", detail),
        ("selectable", Value::Bool(selectable)),
    ])
}

/// The ordinal rank of a name against the query: exact (0), prefix (1),
/// word-boundary (2), else substring (3). Lower sorts first.
fn rank(name: &str, needle_upper: &str) -> u8 {
    let upper = name.to_uppercase();
    if upper == needle_upper {
        0
    } else if upper.starts_with(needle_upper) {
        1
    } else if upper
        .split(|c: char| c == '_' || c == ' ' || c == '.')
        .any(|w| w.starts_with(needle_upper))
    {
        2
    } else {
        3
    }
}

/// Industry-grade object search: schemas, tables, views, columns, scripts and
/// functions whose name contains the query, ranked by match quality.
#[tauri::command]
pub async fn search_objects(
    state: State<'_, AppState>,
    profile_id: String,
    query: String,
    limit: Option<usize>,
) -> AppResult<Value> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(json!({ "results": [] }));
    }
    let limit = limit.unwrap_or(200).clamp(1, 1000);
    let pool = require_pool(&state, &profile_id).await?;
    let like = format!("%{}%", like_literal(needle));
    let per_kind = 80;

    // Each query is bounded and matched case-insensitively via UPPER(...) LIKE.
    let schemas = search_rows(
        &pool,
        &format!(
            "SELECT SCHEMA_NAME FROM SYS.EXA_ALL_SCHEMAS \
             WHERE UPPER(SCHEMA_NAME) LIKE UPPER('{like}') ESCAPE '\\' \
             ORDER BY SCHEMA_NAME LIMIT {per_kind}"
        ),
    )
    .await;

    let tables = search_rows(
        &pool,
        &format!(
            "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_ROW_COUNT FROM SYS.EXA_ALL_TABLES \
             WHERE UPPER(TABLE_NAME) LIKE UPPER('{like}') ESCAPE '\\' \
             ORDER BY TABLE_NAME LIMIT {per_kind}"
        ),
    )
    .await;

    let views = search_rows(
        &pool,
        &format!(
            "SELECT VIEW_SCHEMA, VIEW_NAME FROM SYS.EXA_ALL_VIEWS \
             WHERE UPPER(VIEW_NAME) LIKE UPPER('{like}') ESCAPE '\\' \
             ORDER BY VIEW_NAME LIMIT {per_kind}"
        ),
    )
    .await;

    let columns = search_rows(
        &pool,
        &format!(
            "SELECT COLUMN_SCHEMA, COLUMN_TABLE, COLUMN_NAME, COLUMN_TYPE FROM SYS.EXA_ALL_COLUMNS \
             WHERE UPPER(COLUMN_NAME) LIKE UPPER('{like}') ESCAPE '\\' \
             ORDER BY COLUMN_NAME LIMIT {per_kind}"
        ),
    )
    .await;

    let scripts = search_rows(
        &pool,
        &format!(
            "SELECT SCRIPT_SCHEMA, SCRIPT_NAME, SCRIPT_TYPE FROM SYS.EXA_ALL_SCRIPTS \
             WHERE UPPER(SCRIPT_NAME) LIKE UPPER('{like}') ESCAPE '\\' \
             ORDER BY SCRIPT_NAME LIMIT {per_kind}"
        ),
    )
    .await;

    let functions = search_rows(
        &pool,
        &format!(
            "SELECT FUNCTION_SCHEMA, FUNCTION_NAME FROM SYS.EXA_ALL_FUNCTIONS \
             WHERE UPPER(FUNCTION_NAME) LIKE UPPER('{like}') ESCAPE '\\' \
             ORDER BY FUNCTION_NAME LIMIT {per_kind}"
        ),
    )
    .await;

    let needle_upper = needle.to_uppercase();
    let mut results: Vec<(u8, Value)> = Vec::new();

    for r in &schemas {
        let name = cell(r, 0);
        let rk = rank(name.as_str().unwrap_or_default(), &needle_upper);
        results.push((rk, hit("SCHEMA", Value::Null, name, Value::Null, Value::Null, false)));
    }
    for r in &tables {
        let name = cell(r, 1);
        let rk = rank(name.as_str().unwrap_or_default(), &needle_upper);
        let detail = match cell(r, 2) {
            Value::Null => Value::Null,
            v => Value::String(format!("{} rows", v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()))),
        };
        results.push((rk, hit("TABLE", cell(r, 0), name, Value::Null, detail, true)));
    }
    for r in &views {
        let name = cell(r, 1);
        let rk = rank(name.as_str().unwrap_or_default(), &needle_upper);
        results.push((rk, hit("VIEW", cell(r, 0), name, Value::Null, Value::Null, true)));
    }
    for r in &columns {
        let name = cell(r, 2);
        let rk = rank(name.as_str().unwrap_or_default(), &needle_upper);
        results.push((
            rk,
            hit("COLUMN", cell(r, 0), name, cell(r, 1), cell(r, 3), false),
        ));
    }
    for r in &scripts {
        let name = cell(r, 1);
        let rk = rank(name.as_str().unwrap_or_default(), &needle_upper);
        results.push((rk, hit("SCRIPT", cell(r, 0), name, Value::Null, cell(r, 2), false)));
    }
    for r in &functions {
        let name = cell(r, 1);
        let rk = rank(name.as_str().unwrap_or_default(), &needle_upper);
        results.push((rk, hit("FUNCTION", cell(r, 0), name, Value::Null, Value::Null, false)));
    }

    // Rank first, then by name for a stable, readable ordering.
    results.sort_by(|a, b| {
        a.0.cmp(&b.0).then_with(|| {
            let an = a.1.get("name").and_then(|v| v.as_str()).unwrap_or_default();
            let bn = b.1.get("name").and_then(|v| v.as_str()).unwrap_or_default();
            an.cmp(bn)
        })
    });

    let out: Vec<Value> = results.into_iter().take(limit).map(|(_, v)| v).collect();
    Ok(json!({ "results": out }))
}

/// Run one search query, swallowing errors (a missing view just yields nothing).
async fn search_rows(pool: &ExaPool, sql: &str) -> Vec<Vec<Value>> {
    fetch_all_rows(pool, sql).await.unwrap_or_default()
}
