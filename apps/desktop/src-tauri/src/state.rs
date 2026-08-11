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
    /// The master password itself, memory-only for this session (unified
    /// model): the local Personal database's SYS password is kept equal to
    /// it, so setup after unlock can apply it. Never persisted anywhere.
    pub master_secret: std::sync::RwLock<Option<String>>,
    /// In-flight, cancellable queries: `progress_id -> (profile_id, session_id)`.
    /// execute_sql registers a run once it knows the executing session; Stop
    /// (cancel_query) looks it up to KILL the running statement.
    pub running_queries: std::sync::Mutex<HashMap<String, (String, String)>>,
    /// ConfD (Admin API) sessions keyed by connection profile id. Credentials
    /// live ONLY here, for this app session — never returned to the frontend
    /// and never persisted (admin-api-parity spec).
    pub admin_sessions: std::sync::Mutex<HashMap<String, crate::confd::AdminSession>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            pools: RwLock::new(HashMap::new()),
            data_dir,
            vault_key: std::sync::RwLock::new(None),
            master_secret: std::sync::RwLock::new(None),
            running_queries: std::sync::Mutex::new(HashMap::new()),
            admin_sessions: std::sync::Mutex::new(HashMap::new()),
        }
    }
}
