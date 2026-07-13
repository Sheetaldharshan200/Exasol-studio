//! Application settings: a single JSON blob (app-settings.json) the standalone
//! Settings window reads and shallow-merges into. Kept generic so the frontend
//! owns the schema; the backend just persists key/value patches.

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, AppResult};

fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| AppError::Storage(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("app-settings.json"))
}

/// Read all settings (empty object if none saved yet).
#[tauri::command]
pub fn get_app_settings(app: AppHandle) -> AppResult<Value> {
    let p = settings_path(&app)?;
    match std::fs::read_to_string(p) {
        Ok(s) => Ok(serde_json::from_str(&s).unwrap_or_else(|_| json!({}))),
        Err(_) => Ok(json!({})),
    }
}

/// Shallow-merge a patch into the stored settings and return the merged result.
#[tauri::command]
pub fn set_app_settings(app: AppHandle, patch: Value) -> AppResult<Value> {
    let mut cur = get_app_settings(app.clone())?;
    if let (Some(obj), Some(p)) = (cur.as_object_mut(), patch.as_object()) {
        for (k, v) in p {
            obj.insert(k.clone(), v.clone());
        }
    }
    std::fs::write(settings_path(&app)?, serde_json::to_string_pretty(&cur)?)?;
    // Notify other windows so live-applied settings (theme, etc.) update.
    let _ = app.emit("settings:changed", &cur);
    Ok(cur)
}
