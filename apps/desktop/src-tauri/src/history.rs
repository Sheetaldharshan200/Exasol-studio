use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::{read_json, write_json};

const MAX_ENTRIES: usize = 300;

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
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut entries: Vec<HistoryEntry> = read_json(&history_path(state), Vec::new())?;
    entries.insert(0, entry);
    entries.truncate(MAX_ENTRIES);
    write_json(&history_path(state), &entries)
}

#[tauri::command]
pub fn sql_history_list(state: State<'_, AppState>) -> AppResult<Vec<HistoryEntry>> {
    read_json(&history_path(&state), Vec::new())
}

#[tauri::command]
pub fn sql_history_clear(state: State<'_, AppState>) -> AppResult<()> {
    write_json(&history_path(&state), &Vec::<HistoryEntry>::new())
}
