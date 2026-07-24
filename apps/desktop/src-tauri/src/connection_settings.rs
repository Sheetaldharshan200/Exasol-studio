//! Per-connection settings for the Connection Properties page. Stored as raw
//! JSON keyed by profile id — the frontend owns the shape; the backend only
//! reads the few keys it wires (hooks, keep-alive, pool size, password
//! policy), so adding a category never needs a Rust change.

use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::{read_json, write_json};

fn settings_path(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("connection-settings.json")
}

pub fn read_settings(state: &AppState, profile_id: &str) -> Value {
    let all: HashMap<String, Value> = read_json(&settings_path(state), HashMap::new()).unwrap_or_default();
    all.get(profile_id).cloned().unwrap_or(Value::Null)
}

#[tauri::command]
pub fn connection_settings_get(state: State<'_, AppState>, profile_id: String) -> AppResult<Value> {
    Ok(read_settings(&state, &profile_id))
}

#[tauri::command]
pub fn connection_settings_set(
    state: State<'_, AppState>,
    profile_id: String,
    settings: Value,
) -> AppResult<Value> {
    use std::sync::Mutex;
    static LOCK: Mutex<()> = Mutex::new(());
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut all: HashMap<String, Value> = read_json(&settings_path(&state), HashMap::new())?;
    all.insert(profile_id, settings.clone());
    write_json(&settings_path(&state), &all)?;
    Ok(settings)
}

/// Convenience getters for the keys the backend wires.
pub fn str_at<'a>(v: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut cur = v;
    for p in path {
        cur = cur.get(p)?;
    }
    cur.as_str()
}
pub fn bool_at(v: &Value, path: &[&str]) -> Option<bool> {
    let mut cur = v;
    for p in path {
        cur = cur.get(p)?;
    }
    cur.as_bool()
}
pub fn num_at(v: &Value, path: &[&str]) -> Option<u64> {
    let mut cur = v;
    for p in path {
        cur = cur.get(p)?;
    }
    cur.as_u64()
}
