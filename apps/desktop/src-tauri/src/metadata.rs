use serde_json::{json, Map, Value};
use sqlx_exasol::ExaPool;
use tauri::State;

use crate::connection::require_pool;
use crate::error::AppResult;
use crate::query::fetch_all_rows;
use crate::state::AppState;

/// Fetch rows for the first query that succeeds (DBA view first, ALL view fallback).
pub(crate) async fn fetch_first_ok(pool: &ExaPool, candidates: &[&str]) -> Vec<Vec<Value>> {
    for sql in candidates {
        if let Ok(rows) = fetch_all_rows(pool, sql).await {
            return rows;
        }
    }
    Vec::new()
}

pub(crate) fn obj(pairs: Vec<(&str, Value)>) -> Value {
    let mut map = Map::new();
    for (key, value) in pairs {
        map.insert(key.to_string(), value);
    }
    Value::Object(map)
}

pub(crate) fn cell(row: &[Value], idx: usize) -> Value {
    row.get(idx).cloned().unwrap_or(Value::Null)
}

/// Schemas (with virtual flag), fixed system schemas, and server parameters.
#[tauri::command]
pub async fn get_database_overview(
    state: State<'_, AppState>,
    profile_id: String,
) -> AppResult<Value> {
    let pool = require_pool(&state, &profile_id).await?;

    let schemas = fetch_all_rows(
        &pool,
        "SELECT SCHEMA_NAME, SCHEMA_OWNER, SCHEMA_COMMENT \
         FROM SYS.EXA_ALL_SCHEMAS ORDER BY SCHEMA_NAME",
    )
    .await?;

    // Virtual schemas are listed in a separate view whose adapter-script column
    // differs across Exasol versions (ADAPTER_SCRIPT vs. ADAPTER_SCRIPT_SCHEMA +
    // ADAPTER_SCRIPT_NAME). Try each shape, then fall back to name-only.
    let virtual_rows = fetch_first_ok(
        &pool,
        &[
            "SELECT SCHEMA_NAME, ADAPTER_SCRIPT_SCHEMA || '.' || ADAPTER_SCRIPT_NAME AS ADAPTER \
             FROM SYS.EXA_ALL_VIRTUAL_SCHEMAS ORDER BY SCHEMA_NAME",
            "SELECT SCHEMA_NAME, ADAPTER_SCRIPT AS ADAPTER \
             FROM SYS.EXA_ALL_VIRTUAL_SCHEMAS ORDER BY SCHEMA_NAME",
            "SELECT SCHEMA_NAME, CAST(NULL AS VARCHAR(200)) AS ADAPTER \
             FROM SYS.EXA_ALL_VIRTUAL_SCHEMAS ORDER BY SCHEMA_NAME",
        ],
    )
    .await;

    let adapter_for = |name: &str| -> Value {
        virtual_rows
            .iter()
            .find(|r| r.first().and_then(|v| v.as_str()) == Some(name))
            .map(|r| cell(r, 1))
            .unwrap_or(Value::Null)
    };
    let is_virtual = |name: &str| -> bool {
        virtual_rows
            .iter()
            .any(|r| r.first().and_then(|v| v.as_str()) == Some(name))
    };

    let schema_list: Vec<Value> = schemas
        .iter()
        .map(|row| {
            let name = cell(row, 0);
            let name_str = name.as_str().unwrap_or_default().to_string();
            obj(vec![
                ("name", name),
                ("owner", cell(row, 1)),
                ("comment", cell(row, 2)),
                ("isVirtual", Value::Bool(is_virtual(&name_str))),
                ("adapterScript", adapter_for(&name_str)),
            ])
        })
        .collect();

    Ok(json!({
        "schemas": schema_list,
        "systemSchemas": ["SYS", "EXA_STATISTICS"],
    }))
}

/// Tables, views, functions, and scripts (grouped by type) for one schema.
#[tauri::command]
pub async fn list_schema_objects(
    state: State<'_, AppState>,
    profile_id: String,
    schema: String,
) -> AppResult<Value> {
    let pool = require_pool(&state, &profile_id).await?;
    let literal = schema.replace('\'', "''");

    let tables = fetch_all_rows(
        &pool,
        &format!(
            "SELECT TABLE_NAME, TABLE_OWNER, TABLE_ROW_COUNT, TABLE_COMMENT \
             FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = '{literal}' ORDER BY TABLE_NAME"
        ),
    )
    .await
    .unwrap_or_default();

    let views = fetch_all_rows(
        &pool,
        &format!(
            "SELECT VIEW_NAME, VIEW_OWNER, VIEW_COMMENT \
             FROM SYS.EXA_ALL_VIEWS WHERE VIEW_SCHEMA = '{literal}' ORDER BY VIEW_NAME"
        ),
    )
    .await
    .unwrap_or_default();

    let functions = fetch_all_rows(
        &pool,
        &format!(
            "SELECT FUNCTION_NAME, FUNCTION_OWNER, FUNCTION_COMMENT \
             FROM SYS.EXA_ALL_FUNCTIONS WHERE FUNCTION_SCHEMA = '{literal}' ORDER BY FUNCTION_NAME"
        ),
    )
    .await
    .unwrap_or_default();

    let scripts = fetch_all_rows(
        &pool,
        &format!(
            "SELECT SCRIPT_NAME, SCRIPT_TYPE, SCRIPT_LANGUAGE, SCRIPT_INPUT_TYPE, \
                    SCRIPT_RESULT_TYPE, SCRIPT_COMMENT \
             FROM SYS.EXA_ALL_SCRIPTS WHERE SCRIPT_SCHEMA = '{literal}' ORDER BY SCRIPT_NAME"
        ),
    )
    .await
    .unwrap_or_default();

    let table_list: Vec<Value> = tables
        .iter()
        .map(|row| {
            obj(vec![
                ("name", cell(row, 0)),
                ("owner", cell(row, 1)),
                ("rowCount", cell(row, 2)),
                ("comment", cell(row, 3)),
            ])
        })
        .collect();

    let view_list: Vec<Value> = views
        .iter()
        .map(|row| {
            obj(vec![
                ("name", cell(row, 0)),
                ("owner", cell(row, 1)),
                ("comment", cell(row, 2)),
            ])
        })
        .collect();

    let function_list: Vec<Value> = functions
        .iter()
        .map(|row| {
            obj(vec![
                ("name", cell(row, 0)),
                ("owner", cell(row, 1)),
                ("comment", cell(row, 2)),
            ])
        })
        .collect();

    let script_list: Vec<Value> = scripts
        .iter()
        .map(|row| {
            obj(vec![
                ("name", cell(row, 0)),
                ("scriptType", cell(row, 1)),
                ("language", cell(row, 2)),
                ("inputType", cell(row, 3)),
                ("resultType", cell(row, 4)),
                ("comment", cell(row, 5)),
            ])
        })
        .collect();

    Ok(json!({
        "tables": table_list,
        "views": view_list,
        "functions": function_list,
        "scripts": script_list,
    }))
}

/// Columns and constraints for one table (or view).
#[tauri::command]
pub async fn get_table_details(
    state: State<'_, AppState>,
    profile_id: String,
    schema: String,
    table: String,
) -> AppResult<Value> {
    let pool = require_pool(&state, &profile_id).await?;
    let schema_lit = schema.replace('\'', "''");
    let table_lit = table.replace('\'', "''");

    let columns = fetch_all_rows(
        &pool,
        &format!(
            "SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_IS_NULLABLE, COLUMN_DEFAULT, \
                    COLUMN_IDENTITY, COLUMN_IS_DISTRIBUTION_KEY, COLUMN_COMMENT \
             FROM SYS.EXA_ALL_COLUMNS \
             WHERE COLUMN_SCHEMA = '{schema_lit}' AND COLUMN_TABLE = '{table_lit}' \
             ORDER BY COLUMN_ORDINAL_POSITION"
        ),
    )
    .await
    .unwrap_or_default();

    let constraints = fetch_all_rows(
        &pool,
        &format!(
            "SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE, CONSTRAINT_ENABLED \
             FROM SYS.EXA_ALL_CONSTRAINTS \
             WHERE CONSTRAINT_SCHEMA = '{schema_lit}' AND CONSTRAINT_TABLE = '{table_lit}' \
             ORDER BY CONSTRAINT_TYPE, CONSTRAINT_NAME"
        ),
    )
    .await
    .unwrap_or_default();

    let constraint_columns = fetch_all_rows(
        &pool,
        &format!(
            "SELECT CONSTRAINT_NAME, COLUMN_NAME, ORDINAL_POSITION, \
                    REFERENCED_SCHEMA, REFERENCED_TABLE, REFERENCED_COLUMN \
             FROM SYS.EXA_ALL_CONSTRAINT_COLUMNS \
             WHERE CONSTRAINT_SCHEMA = '{schema_lit}' AND CONSTRAINT_TABLE = '{table_lit}' \
             ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION"
        ),
    )
    .await
    .unwrap_or_default();

    let column_list: Vec<Value> = columns
        .iter()
        .map(|row| {
            obj(vec![
                ("name", cell(row, 0)),
                ("dataType", cell(row, 1)),
                ("nullable", cell(row, 2)),
                ("default", cell(row, 3)),
                ("identity", cell(row, 4)),
                ("isDistributionKey", cell(row, 5)),
                ("comment", cell(row, 6)),
            ])
        })
        .collect();

    let constraint_list: Vec<Value> = constraints
        .iter()
        .map(|row| {
            let name = cell(row, 0);
            let name_str = name.as_str().unwrap_or_default().to_string();
            let cols: Vec<Value> = constraint_columns
                .iter()
                .filter(|cc| cc.first().and_then(|v| v.as_str()) == Some(name_str.as_str()))
                .map(|cc| {
                    obj(vec![
                        ("column", cell(cc, 1)),
                        ("referencedSchema", cell(cc, 3)),
                        ("referencedTable", cell(cc, 4)),
                        ("referencedColumn", cell(cc, 5)),
                    ])
                })
                .collect();
            obj(vec![
                ("name", name),
                ("constraintType", cell(row, 1)),
                ("enabled", cell(row, 2)),
                ("columns", Value::Array(cols)),
            ])
        })
        .collect();

    Ok(json!({
        "columns": column_list,
        "constraints": constraint_list,
    }))
}

/// Objects of a system schema (SYS / EXA_STATISTICS) via the EXA_SYSCAT catalog.
#[tauri::command]
pub async fn list_system_objects(
    state: State<'_, AppState>,
    profile_id: String,
    schema: String,
) -> AppResult<Value> {
    let pool = require_pool(&state, &profile_id).await?;
    let literal = schema.replace('\'', "''");

    let rows = fetch_first_ok(
        &pool,
        &[
            &format!(
                "SELECT OBJECT_NAME, OBJECT_TYPE, OBJECT_COMMENT \
                 FROM SYS.EXA_SYSCAT WHERE SCHEMA_NAME = '{literal}' ORDER BY OBJECT_NAME"
            ),
            &format!(
                "SELECT OBJECT_NAME, OBJECT_TYPE, OBJECT_COMMENT \
                 FROM SYS.EXA_ALL_OBJECTS WHERE ROOT_NAME = '{literal}' ORDER BY OBJECT_NAME"
            ),
        ],
    )
    .await;

    let objects: Vec<Value> = rows
        .iter()
        .map(|row| {
            obj(vec![
                ("name", cell(row, 0)),
                ("objectType", cell(row, 1)),
                ("comment", cell(row, 2)),
            ])
        })
        .collect();

    Ok(json!({ "objects": objects }))
}

/// Columns of one system view (uses EXA_SYS_COLUMNS which covers system tables).
#[tauri::command]
pub async fn list_system_columns(
    state: State<'_, AppState>,
    profile_id: String,
    schema: String,
    object: String,
) -> AppResult<Value> {
    let pool = require_pool(&state, &profile_id).await?;
    let schema_lit = schema.replace('\'', "''");
    let object_lit = object.replace('\'', "''");

    let rows = fetch_first_ok(
        &pool,
        &[
            &format!(
                "SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT \
                 FROM SYS.EXA_SYS_COLUMNS \
                 WHERE COLUMN_SCHEMA = '{schema_lit}' AND COLUMN_TABLE = '{object_lit}' \
                 ORDER BY COLUMN_ORDINAL_POSITION"
            ),
            &format!(
                "SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT \
                 FROM SYS.EXA_ALL_COLUMNS \
                 WHERE COLUMN_SCHEMA = '{schema_lit}' AND COLUMN_TABLE = '{object_lit}' \
                 ORDER BY COLUMN_ORDINAL_POSITION"
            ),
        ],
    )
    .await;

    let columns: Vec<Value> = rows
        .iter()
        .map(|row| {
            obj(vec![
                ("name", cell(row, 0)),
                ("dataType", cell(row, 1)),
                ("comment", cell(row, 2)),
            ])
        })
        .collect();

    Ok(json!({ "columns": columns }))
}

/// DBA section: users, roles, consumer groups, connection objects, sessions, DB size.
#[tauri::command]
pub async fn get_dba_overview(state: State<'_, AppState>, profile_id: String) -> AppResult<Value> {
    let pool = require_pool(&state, &profile_id).await?;

    let users = fetch_first_ok(
        &pool,
        &[
            "SELECT USER_NAME, CREATED, USER_CONSUMER_GROUP, USER_COMMENT \
             FROM SYS.EXA_DBA_USERS ORDER BY USER_NAME",
            "SELECT USER_NAME, CREATED, USER_CONSUMER_GROUP, USER_COMMENT \
             FROM SYS.EXA_ALL_USERS ORDER BY USER_NAME",
        ],
    )
    .await;

    let roles = fetch_first_ok(
        &pool,
        &[
            "SELECT ROLE_NAME, CREATED, ROLE_CONSUMER_GROUP, ROLE_COMMENT \
             FROM SYS.EXA_DBA_ROLES ORDER BY ROLE_NAME",
            "SELECT ROLE_NAME, CREATED, ROLE_CONSUMER_GROUP, ROLE_COMMENT \
             FROM SYS.EXA_ALL_ROLES ORDER BY ROLE_NAME",
        ],
    )
    .await;

    let consumer_groups = fetch_first_ok(
        &pool,
        &["SELECT CONSUMER_GROUP_NAME, CPU_WEIGHT, PRECEDENCE, QUERY_TIMEOUT, IDLE_TIMEOUT \
           FROM SYS.EXA_CONSUMER_GROUPS ORDER BY PRECEDENCE DESC"],
    )
    .await;

    let connections = fetch_first_ok(
        &pool,
        &[
            "SELECT CONNECTION_NAME, CONNECTION_STRING, USER_NAME, CREATED, CONNECTION_COMMENT \
             FROM SYS.EXA_DBA_CONNECTIONS ORDER BY CONNECTION_NAME",
            "SELECT CONNECTION_NAME, CONNECTION_STRING, USER_NAME, CREATED, CONNECTION_COMMENT \
             FROM SYS.EXA_ALL_CONNECTIONS ORDER BY CONNECTION_NAME",
        ],
    )
    .await;

    let sessions = fetch_first_ok(
        &pool,
        &[
            "SELECT TO_CHAR(SESSION_ID), USER_NAME, STATUS, COMMAND_NAME, DURATION, \
                    LOGIN_TIME, CLIENT, DRIVER, HOST, OS_USER \
             FROM SYS.EXA_DBA_SESSIONS ORDER BY LOGIN_TIME",
            "SELECT TO_CHAR(SESSION_ID), USER_NAME, STATUS, COMMAND_NAME, DURATION, \
                    LOGIN_TIME, CLIENT, DRIVER, HOST, OS_USER \
             FROM SYS.EXA_ALL_SESSIONS ORDER BY LOGIN_TIME",
        ],
    )
    .await;

    let db_size = fetch_first_ok(
        &pool,
        &["SELECT TO_CHAR(MEASURE_TIME), RAW_OBJECT_SIZE, MEM_OBJECT_SIZE, \
                  AUXILIARY_SIZE, STATISTICS_SIZE, RECOMMENDED_DB_RAM_SIZE \
           FROM EXA_STATISTICS.EXA_DB_SIZE_LAST_DAY ORDER BY MEASURE_TIME DESC LIMIT 1"],
    )
    .await;

    Ok(json!({
        "users": users.iter().map(|r| obj(vec![
            ("name", cell(r, 0)), ("created", cell(r, 1)),
            ("consumerGroup", cell(r, 2)), ("comment", cell(r, 3)),
        ])).collect::<Vec<_>>(),
        "roles": roles.iter().map(|r| obj(vec![
            ("name", cell(r, 0)), ("created", cell(r, 1)),
            ("consumerGroup", cell(r, 2)), ("comment", cell(r, 3)),
        ])).collect::<Vec<_>>(),
        "consumerGroups": consumer_groups.iter().map(|r| obj(vec![
            ("name", cell(r, 0)), ("cpuWeight", cell(r, 1)), ("precedence", cell(r, 2)),
            ("queryTimeout", cell(r, 3)), ("idleTimeout", cell(r, 4)),
        ])).collect::<Vec<_>>(),
        "connections": connections.iter().map(|r| obj(vec![
            ("name", cell(r, 0)), ("connectionString", cell(r, 1)), ("userName", cell(r, 2)),
            ("created", cell(r, 3)), ("comment", cell(r, 4)),
        ])).collect::<Vec<_>>(),
        "sessions": sessions.iter().map(|r| obj(vec![
            ("sessionId", cell(r, 0)), ("userName", cell(r, 1)), ("status", cell(r, 2)),
            ("command", cell(r, 3)), ("duration", cell(r, 4)), ("loginTime", cell(r, 5)),
            ("client", cell(r, 6)), ("driver", cell(r, 7)), ("host", cell(r, 8)),
            ("osUser", cell(r, 9)),
        ])).collect::<Vec<_>>(),
        "dbSize": db_size.first().map(|r| obj(vec![
            ("measureTime", cell(r, 0)), ("rawObjectSize", cell(r, 1)),
            ("memObjectSize", cell(r, 2)), ("auxiliarySize", cell(r, 3)),
            ("statisticsSize", cell(r, 4)), ("recommendedDbRamSize", cell(r, 5)),
        ])),
    }))
}
