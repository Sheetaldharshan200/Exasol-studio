//! Dashboard persistence: one JSON file per dashboard under
//! `<data>/dashboards/<id>.json`. The frontend owns the document shape
//! (features/dashboard/store.ts); Rust only reads, writes, lists, and deletes
//! the files. Ids are sanitized to a safe filename charset so a crafted id can
//! never escape the dashboards directory.

use crate::error::{AppError, AppResult};
use tauri::Manager;

/// Keep only filename-safe characters; reject an id that is empty afterwards so
/// a document can never be written outside `<data>/dashboards`.
fn safe_id(id: &str) -> AppResult<String> {
    let cleaned: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if cleaned.is_empty() {
        return Err(AppError::Storage("invalid dashboard id".into()));
    }
    Ok(cleaned)
}

fn dashboards_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.state::<crate::state::AppState>().data_dir.join("dashboards")
}

/// One entry in the dashboard list: the file id plus its document title.
#[derive(serde::Serialize)]
pub struct DashboardMeta {
    pub id: String,
    pub title: String,
}

/// Read a dashboard file's JSON, or None when it does not exist.
#[tauri::command]
pub async fn dashboard_read(app: tauri::AppHandle, id: String) -> AppResult<Option<String>> {
    let path = dashboards_dir(&app).join(format!("{}.json", safe_id(&id)?));
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::Storage(e.to_string())),
    }
}

/// Write a dashboard file (creating the directory on first write).
#[tauri::command]
pub async fn dashboard_write(app: tauri::AppHandle, id: String, json: String) -> AppResult<()> {
    let dir = dashboards_dir(&app);
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.json", safe_id(&id)?));
    std::fs::write(&path, json)?;
    Ok(())
}

/// Delete a dashboard file (a missing file is not an error).
#[tauri::command]
pub async fn dashboard_delete(app: tauri::AppHandle, id: String) -> AppResult<()> {
    let path = dashboards_dir(&app).join(format!("{}.json", safe_id(&id)?));
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::Storage(e.to_string())),
    }
}

/// List saved dashboards (id + title). Files that fail to parse are skipped
/// rather than failing the whole listing.
#[tauri::command]
pub async fn dashboard_list(app: tauri::AppHandle) -> AppResult<Vec<DashboardMeta>> {
    let dir = dashboards_dir(&app);
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(AppError::Storage(e.to_string())),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let id = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let title = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.get("doc").and_then(|d| d.get("title")).and_then(|t| t.as_str()).map(String::from))
            .unwrap_or_else(|| id.clone());
        out.push(DashboardMeta { id, title });
    }
    Ok(out)
}
