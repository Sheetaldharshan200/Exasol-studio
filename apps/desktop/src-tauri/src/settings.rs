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

/// Settings that once had a toggle but no behaviour behind it, removed from
/// the file on the next read. `aiApiKey` among them was a plaintext secret
/// nothing used — it must not linger on disk.
const RETIRED: &[&str] = &[
    "uiFontSize", "uiDensity", "autoExpandFirstSchema", "metadataCache", "metadataStaleDays",
    "statementDelimiter", "autoCommit", "aiModel", "aiApiKey", "defaultSchema", "quoteIdentifiers",
    "queryTimeoutMs", "compression", "tls", "dbAutoCommit", "isolation", "charset", "fetchSize",
    "qbDefaultLimit",
];

/// Drop retired keys; says whether anything was removed.
fn scrub_retired(settings: &mut Value) -> bool {
    let Some(obj) = settings.as_object_mut() else { return false };
    let before = obj.len();
    obj.retain(|k, _| !RETIRED.contains(&k.as_str()));
    obj.len() != before
}

fn write(app: &AppHandle, settings: &Value) -> AppResult<()> {
    crate::storage::write_private(&settings_path(app)?, serde_json::to_string_pretty(settings)?.as_bytes())?;
    Ok(())
}

/// Keep the backend's copy current: history and connect read it.
fn cache(app: &AppHandle, settings: &Value) {
    if let Ok(mut c) = app.state::<crate::state::AppState>().app_settings.write() {
        *c = settings.clone();
    }
}

/// Read all settings (empty object if none saved yet).
#[tauri::command]
pub fn get_app_settings(app: AppHandle) -> AppResult<Value> {
    let p = settings_path(&app)?;
    let mut cur = match std::fs::read_to_string(p) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| json!({})),
        Err(_) => json!({}),
    };
    if scrub_retired(&mut cur) {
        write(&app, &cur)?;
    }
    cache(&app, &cur);
    Ok(cur)
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
    scrub_retired(&mut cur);
    write(&app, &cur)?;
    cache(&app, &cur);
    // Notify other windows so live-applied settings (theme, etc.) update.
    let _ = app.emit("settings:changed", &cur);
    Ok(cur)
}

/// One app setting as the backend last saw it.
pub fn app_setting(state: &crate::state::AppState, key: &str) -> Option<Value> {
    state.app_settings.read().ok()?.get(key).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retired_settings_are_scrubbed_and_live_ones_kept() {
        let mut s = json!({ "theme": "dark", "aiApiKey": "sk-secret", "fetchSize": 5000, "maxRows": 10 });
        assert!(scrub_retired(&mut s));
        assert_eq!(s, json!({ "theme": "dark", "maxRows": 10 }));
        assert!(!scrub_retired(&mut s), "nothing left to remove");
        assert!(!scrub_retired(&mut json!(null)));
        assert!(!scrub_retired(&mut json!({})));
    }
}
