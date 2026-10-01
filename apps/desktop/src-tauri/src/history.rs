use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::{read_json, write_json};

/// History length when the setting is missing (Settings → SQL History).
const DEFAULT_LIMIT: usize = 1000;

/// How many entries to keep, from the app settings — None when history is off.
fn history_limit(keep: Option<serde_json::Value>, limit: Option<serde_json::Value>) -> Option<usize> {
    if keep.and_then(|v| v.as_bool()) == Some(false) {
        return None;
    }
    let n = limit.and_then(|v| v.as_f64()).filter(|n| n.is_finite()).map(|n| n as usize).unwrap_or(DEFAULT_LIMIT);
    Some(n.clamp(10, 100_000))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub executed_at: String,
    pub profile_id: String,
    pub connection_name: String,
    pub sql: String,
    pub statement_count: usize,
    pub elapsed_ms: u64,
    /// Query execution time (until the server's first answer). None on
    /// entries written before the exec/fetch split.
    #[serde(default)]
    pub exec_ms: Option<u64>,
    /// Row-streaming time after execution.
    #[serde(default)]
    pub fetch_ms: Option<u64>,
    /// True when any result set hit the row cap (the query matched MORE rows
    /// than were fetched).
    #[serde(default)]
    pub truncated: Option<bool>,
    pub success: bool,
    pub error: Option<String>,
    pub row_count: u64,
}

fn history_path(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("sql-history.json")
}

pub fn append_history(state: &AppState, entry: HistoryEntry) -> AppResult<()> {
    // Serialize read-modify-write: concurrent statements (dashboard panels)
    // all append here — without the lock they drop each other's entries.
    use std::sync::Mutex;
    static LOCK: Mutex<()> = Mutex::new(());
    let Some(limit) = history_limit(
        crate::settings::app_setting(state, "keepHistory"),
        crate::settings::app_setting(state, "historyLimit"),
    ) else {
        return Ok(());
    };
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut entries: Vec<HistoryEntry> = read_json(&history_path(state), Vec::new())?;
    entries.insert(0, entry);
    entries.truncate(limit);
    write_json(&history_path(state), &entries)
}

#[tauri::command]
pub fn sql_history_list(state: State<'_, AppState>) -> AppResult<Vec<HistoryEntry>> {
    let mut entries: Vec<HistoryEntry> = read_json(&history_path(&state), Vec::new())?;
    // A lowered limit shows at once; the file is trimmed on the next append.
    let limit = history_limit(Some(serde_json::Value::Bool(true)), crate::settings::app_setting(&state, "historyLimit"));
    entries.truncate(limit.unwrap_or(DEFAULT_LIMIT));
    Ok(entries)
}

#[tauri::command]
pub fn sql_history_clear(state: State<'_, AppState>) -> AppResult<()> {
    write_json(&history_path(&state), &Vec::<HistoryEntry>::new())
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_history_setting_decides_whether_and_how_much_is_kept() {
        use serde_json::json;
        assert_eq!(super::history_limit(None, None), Some(1000));
        assert_eq!(super::history_limit(Some(json!(true)), Some(json!(250))), Some(250));
        assert_eq!(super::history_limit(Some(json!(false)), Some(json!(250))), None);
        assert_eq!(super::history_limit(None, Some(json!(3))), Some(10), "clamped up");
        assert_eq!(super::history_limit(None, Some(json!(1e9))), Some(100_000), "clamped down");
        assert_eq!(super::history_limit(Some(json!("yes")), Some(json!("many"))), Some(1000), "junk falls back");
    }
}
