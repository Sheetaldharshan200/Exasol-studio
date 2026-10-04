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
    /// In-flight, cancellable queries by progress id. execute_sql registers a
    /// run; Stop (cancel_query) KILLs the native run's statement in its
    /// session, or raises the flag of an exarrow / bridge run.
    pub running_queries: std::sync::Mutex<HashMap<String, crate::query::RunningQuery>>,
    /// Passwords kept for this run only (policy "this session only"):
    /// `profile_id -> password`. Never written anywhere; gone on quit.
    pub session_passwords: std::sync::Mutex<HashMap<String, String>>,
    /// One database session per SQL tab (session.rs).
    pub sessions: crate::session::TabSessions,
    /// ConfD (Admin API) sessions keyed by connection profile id. Credentials
    /// live ONLY here, for this app session — never returned to the frontend
    /// and never persisted (admin-api-parity spec).
    pub admin_sessions: std::sync::Mutex<HashMap<String, crate::confd::AdminSession>>,
    /// The app settings as last read or saved (settings.rs), for backend
    /// readers such as history and connect.
    pub app_settings: std::sync::RwLock<serde_json::Value>,
    /// The schema last used per connection (SQL Editor → initial schema
    /// "Most Recently Used"); memory only.
    pub recent_schemas: std::sync::Mutex<HashMap<String, String>>,
    /// What carries each open connection (pin tunnel, SSH tunnel, proxy
    /// relay), by profile id; dropped with the connection.
    pub carriers: std::sync::Mutex<HashMap<String, crate::carrier::Carrier>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            pools: RwLock::new(HashMap::new()),
            data_dir,
            vault_key: std::sync::RwLock::new(None),
            master_secret: std::sync::RwLock::new(None),
            running_queries: std::sync::Mutex::new(HashMap::new()),
            session_passwords: std::sync::Mutex::new(HashMap::new()),
            sessions: crate::session::TabSessions::default(),
            admin_sessions: std::sync::Mutex::new(HashMap::new()),
            app_settings: std::sync::RwLock::new(serde_json::Value::Null),
            recent_schemas: std::sync::Mutex::new(HashMap::new()),
            carriers: std::sync::Mutex::new(HashMap::new()),
        }
    }
}
