//! Automatic Semantic Views revalidation after schema changes.
//!
//! A semantic model binds business meaning to physical columns, so a DDL
//! statement — a dropped column, a renamed table — can silently invalidate it.
//! The framework compiles queries from metadata at request time, which means
//! the failure would otherwise surface later, inside someone else's query,
//! as a compiler error with no hint that this morning's ALTER caused it.
//!
//! So: whenever a statement that can change the schema runs through Studio,
//! every active model on that connection is revalidated with the framework's
//! own VALIDATE_MODEL, and the current issues are pushed to the UI. Detection,
//! not repair — remapping a model onto a renamed column is a business
//! decision, and guessing it silently would corrupt the very contract the
//! semantic layer exists to protect.
//!
//! Changes made OUTSIDE Studio are caught the same way the next time any
//! schema-changing statement runs here; this is a safety net, not a watcher
//! daemon on someone else's database.

use futures_util::TryStreamExt;
use serde_json::json;
use sqlx_exasol::{AssertSqlSafe, ExaPool, Row};
use tauri::{AppHandle, Emitter};

/// Statements that can change what a semantic model is bound to.
pub fn is_schema_change(statement: &str) -> bool {
    let upper = statement.trim_start().to_ascii_uppercase();
    ["CREATE ", "ALTER ", "DROP ", "RENAME "]
        .iter()
        .any(|prefix| upper.starts_with(prefix))
}

async fn scalar_i64(pool: &ExaPool, sql: &str) -> i64 {
    match sqlx_exasol::query(AssertSqlSafe(sql.to_string())).fetch_one(pool).await {
        Ok(row) => row.try_get::<i64, _>(0).unwrap_or(0),
        Err(_) => 0,
    }
}

async fn string_column(pool: &ExaPool, sql: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut stream = sqlx_exasol::query(AssertSqlSafe(sql.to_string())).fetch(pool);
    while let Ok(Some(row)) = stream.try_next().await {
        if let Ok(value) = row.try_get::<String, _>(0) {
            out.push(value);
        }
    }
    out
}

/// Revalidate every active model on this connection, if the framework is
/// installed there. Returns quietly when it is not — most databases will not
/// have it, and this runs after ordinary DDL.
pub async fn revalidate(app: &AppHandle, pool: &ExaPool, profile_id: &str) {
    let installed = scalar_i64(
        pool,
        "SELECT COUNT(*) FROM SYS.EXA_ALL_TABLES \
         WHERE TABLE_SCHEMA = 'SYS_SEMANTIC' AND TABLE_NAME = 'MODELS'",
    )
    .await;
    if installed == 0 {
        return;
    }

    let models = string_column(
        pool,
        "SELECT MODEL_NAME FROM SYS_SEMANTIC.MODELS \
         WHERE ACTIVE_VERSION_ID IS NOT NULL ORDER BY MODEL_NAME",
    )
    .await;
    if models.is_empty() {
        return;
    }

    let mut validated = Vec::new();
    for model in &models {
        let escaped = model.replace('\'', "''");
        let sql = format!("EXECUTE SCRIPT SEMANTIC_ADMIN.VALIDATE_MODEL('{escaped}')");
        // A failed validation RUN is itself a finding — record and continue,
        // so one broken model does not hide the state of the others.
        match sqlx_exasol::query(AssertSqlSafe(sql)).execute(pool).await {
            Ok(_) => validated.push(json!({ "model": model, "ran": true })),
            Err(e) => validated.push(json!({ "model": model, "ran": false, "error": e.to_string() })),
        }
    }

    let issues = scalar_i64(
        pool,
        "SELECT COUNT(*) FROM SEMANTIC_CATALOG.CURRENT_VALIDATION_ISSUES",
    )
    .await;
    let detail = string_column(
        pool,
        "SELECT MODEL_NAME || ' [' || SEVERITY || '] ' || RULE_CODE || ': ' || MESSAGE \
         FROM SEMANTIC_CATALOG.CURRENT_VALIDATION_ISSUES ORDER BY CREATED_AT DESC LIMIT 20",
    )
    .await;

    let _ = app.emit(
        "semantic:validation",
        json!({
            "profileId": profile_id,
            "models": validated,
            "issueCount": issues,
            "issues": detail,
        }),
    );
}
