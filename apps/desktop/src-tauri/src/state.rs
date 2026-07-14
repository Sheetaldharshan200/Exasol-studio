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
    /// The unlocked data-encryption key for this session (None = locked).
    /// Set on vault unlock; cleared on lock/quit. Used to encrypt/decrypt
    /// connection passwords at rest. A std lock so sync code can read it.
    pub vault_key: std::sync::RwLock<Option<[u8; 32]>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            pools: RwLock::new(HashMap::new()),
            data_dir,
            vault_key: std::sync::RwLock::new(None),
        }
    }
}
