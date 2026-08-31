//! "Backup now" (issue #45): a LOGICAL backup over the SQL connection —
//! per-table CSV data plus reconstructed CREATE TABLE DDL, written to
//! ~/ExasolStudioBackups/<connection>/<timestamp>/. This is what a SQL client
//! can genuinely do; native cluster backups stay in Exasol's admin layer.

use futures_util::TryStreamExt;
use serde::Serialize;
use sqlx_exasol::{AssertSqlSafe, Row};
use std::io::Write;
use tauri::{AppHandle, Emitter, State};

use crate::connection::require_pool;
use crate::error::{AppError, AppResult};
use crate::query::row_to_json;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub dir: String,
    pub tables: u32,
    pub rows: u64,
    pub skipped: Vec<String>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupProgress {
    table: String,
    done: u32,
    total: u32,
}

fn csv_field(v: &serde_json::Value) -> String {
    let text = match v {
        serde_json::Value::Null => return String::new(),
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    if text.contains(',') || text.contains('"') || text.contains('\n') {
        format!("\"{}\"", text.replace('"', "\"\""))
    } else {
        text
    }
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

#[tauri::command]
pub async fn backup_now(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
    connection_name: String,
) -> AppResult<BackupResult> {
    let started = std::time::Instant::now();
    let pool = require_pool(&state, &profile_id).await?;

    // User tables only — system and statistics schemas are the engine's.
    let tables: Vec<(String, String)> = sqlx_exasol::query(AssertSqlSafe(
        "SELECT TABLE_SCHEMA, TABLE_NAME FROM SYS.EXA_ALL_TABLES \
         WHERE TABLE_SCHEMA NOT IN ('SYS', 'EXA_STATISTICS', 'INFORMATION_SCHEMA') \
         ORDER BY TABLE_SCHEMA, TABLE_NAME"
            .to_string(),
    ))
    .fetch_all(&pool)
    .await?
    .iter()
    .map(|r| {
        (
            r.try_get::<String, _>(0).unwrap_or_default(),
            r.try_get::<String, _>(1).unwrap_or_default(),
        )
    })
    .collect();

    let home = dirs::home_dir().ok_or_else(|| AppError::Storage("no home directory".into()))?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let dir = home
        .join("ExasolStudioBackups")
        .join(sanitize(&connection_name))
        .join(&stamp);
    std::fs::create_dir_all(&dir)?;

    let mut ddl = String::new();
    let mut total_rows: u64 = 0;
    let mut skipped: Vec<String> = Vec::new();
    let total = tables.len() as u32;

    for (i, (schema, table)) in tables.iter().enumerate() {
        let qualified = format!("\"{}\".\"{}\"", schema, table);
        let _ = app.emit(
            &format!("backup-progress:{profile_id}"),
            &BackupProgress { table: qualified.clone(), done: i as u32, total },
        );

        // Reconstructed DDL from the column catalog (types as Exasol reports them).
        let cols = sqlx_exasol::query(AssertSqlSafe(format!(
            "SELECT COLUMN_NAME, COLUMN_TYPE FROM SYS.EXA_ALL_COLUMNS \
             WHERE COLUMN_SCHEMA = '{}' AND COLUMN_TABLE = '{}' ORDER BY COLUMN_ORDINAL_POSITION",
            schema.replace('\'', "''"),
            table.replace('\'', "''")
        )))
        .fetch_all(&pool)
        .await
        .unwrap_or_default();
        if !cols.is_empty() {
            let defs: Vec<String> = cols
                .iter()
                .map(|r| {
                    format!(
                        "  \"{}\" {}",
                        r.try_get::<String, _>(0).unwrap_or_default(),
                        r.try_get::<String, _>(1).unwrap_or_default()
                    )
                })
                .collect();
            ddl.push_str(&format!("CREATE SCHEMA IF NOT EXISTS \"{schema}\";\n"));
            ddl.push_str(&format!("CREATE OR REPLACE TABLE {qualified} (\n{}\n);\n\n", defs.join(",\n")));
        }

        // Stream the data straight to CSV — never all rows in memory.
        let schema_dir = dir.join(sanitize(schema));
        std::fs::create_dir_all(&schema_dir)?;
        let path = schema_dir.join(format!("{}.csv", sanitize(table)));
        let file = std::fs::File::create(&path)?;
        let mut out = std::io::BufWriter::new(file);
        let mut conn = pool.acquire().await.map_err(|e| AppError::Storage(e.to_string()))?;
        let mut stream = sqlx_exasol::query(AssertSqlSafe(format!("SELECT * FROM {qualified}"))).fetch(&mut *conn);
        let mut wrote_header = false;
        let mut ok = true;
        loop {
            match stream.try_next().await {
                Ok(Some(row)) => {
                    if !wrote_header {
                        use sqlx_exasol::Column;
                        let names: Vec<String> =
                            row.columns().iter().map(|c| csv_field(&serde_json::Value::String(c.name().to_string()))).collect();
                        writeln!(out, "{}", names.join(","))?;
                        wrote_header = true;
                    }
                    let cells = row_to_json(&row);
                    let fields: Vec<String> = cells.iter().map(csv_field).collect();
                    writeln!(out, "{}", fields.join(","))?;
                    total_rows += 1;
                }
                Ok(None) => break,
                Err(e) => {
                    skipped.push(format!("{qualified}: {e}"));
                    ok = false;
                    break;
                }
            }
        }
        out.flush()?;
        if !ok {
            let _ = std::fs::remove_file(schema_dir.join(format!("{}.csv", sanitize(table))));
        }
    }

    std::fs::write(dir.join("schema.sql"), &ddl)?;
    let result = BackupResult {
        dir: dir.to_string_lossy().to_string(),
        tables: total - skipped.len() as u32,
        rows: total_rows,
        skipped,
        elapsed_ms: started.elapsed().as_millis() as u64,
    };
    std::fs::write(dir.join("manifest.json"), serde_json::to_string_pretty(&result)?)?;
    let _ = app.emit(
        &format!("backup-progress:{profile_id}"),
        &BackupProgress { table: String::new(), done: total, total },
    );
    Ok(result)
}
