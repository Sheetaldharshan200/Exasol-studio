use std::collections::HashMap;
use std::path::PathBuf;

use sqlx_exasol::ExaPool;
use tokio::sync::RwLock;

/// Global backend state managed by Tauri.
pub struct AppState {
    /// Open connection pools keyed by connection profile id.
    pub pools: RwLock<HashMap<String, ExaPool>>,
    /// Directory where profiles, history, and settings JSON files live.
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            pools: RwLock::new(HashMap::new()),
            data_dir,
        }
    }
}
