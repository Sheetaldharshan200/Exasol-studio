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
    pub success: bool,
    pub error: Option<String>,
    pub row_count: u64,
}

fn history_path(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("sql-history.json")
}

pub fn append_history(state: &AppState, entry: HistoryEntry) -> AppResult<()> {
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
