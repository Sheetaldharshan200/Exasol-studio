use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage::{read_json, write_json};

pub const DEFAULT_PORT: u16 = 8563;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub password: String,
    /// Schema opened on connect (optional).
    #[serde(default)]
    pub schema: Option<String>,
    /// Free-form notes about this connection.
    #[serde(default)]
    pub notes: Option<String>,
    /// preferred | required | verify_ca | verify_identity | disabled
    #[serde(default = "default_ssl_mode")]
    pub ssl_mode: String,
    #[serde(default)]
    pub compression: bool,
    #[serde(default = "default_driver")]
    pub driver_id: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub last_used_at: Option<String>,
}

fn default_port() -> u16 {
    DEFAULT_PORT
}

fn default_ssl_mode() -> String {
    "preferred".to_string()
}

fn default_driver() -> String {
    "sqlx-exasol".to_string()
}

fn profiles_path(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("connections.json")
}

pub fn load_profiles(state: &AppState) -> AppResult<Vec<ConnectionProfile>> {
    read_json(&profiles_path(state), Vec::new())
}

pub fn find_profile(state: &AppState, profile_id: &str) -> AppResult<ConnectionProfile> {
    load_profiles(state)?
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| AppError::InvalidSettings(format!("unknown connection profile `{profile_id}`")))
}

pub fn touch_profile(state: &AppState, profile_id: &str) -> AppResult<()> {
    let mut profiles = load_profiles(state)?;
    if let Some(profile) = profiles.iter_mut().find(|p| p.id == profile_id) {
        profile.last_used_at = Some(chrono::Utc::now().to_rfc3339());
    }
    write_json(&profiles_path(state), &profiles)
}

#[tauri::command]
pub fn list_connection_profiles(state: State<'_, AppState>) -> AppResult<Vec<ConnectionProfile>> {
    load_profiles(&state)
}

#[tauri::command]
pub fn save_connection_profile(
    state: State<'_, AppState>,
    mut profile: ConnectionProfile,
) -> AppResult<ConnectionProfile> {
    if profile.host.trim().is_empty() {
        return Err(AppError::InvalidSettings("host is required".into()));
    }
    if profile.username.trim().is_empty() {
        return Err(AppError::InvalidSettings("username is required".into()));
    }
    if profile.name.trim().is_empty() {
        profile.name = format!("{}@{}", profile.username, profile.host);
    }

    let mut profiles = load_profiles(&state)?;

    // Find an existing profile to update: by id when editing, otherwise by
    // connection identity (host+port+user+driver) so repeated connects don't
    // pile up duplicates of the same target.
    let existing_index = if !profile.id.is_empty() {
        profiles.iter().position(|p| p.id == profile.id)
    } else {
        profiles.iter().position(|p| {
            p.host.trim().eq_ignore_ascii_case(profile.host.trim())
                && p.port == profile.port
                && p.username == profile.username
                && p.driver_id == profile.driver_id
        })
    };

    match existing_index {
        Some(idx) => {
            profile.id = profiles[idx].id.clone();
            profile.created_at = profiles[idx].created_at.clone();
            profiles[idx] = profile.clone();
        }
        None => {
            profile.id = format!(
                "conn-{}-{}",
                chrono::Utc::now().timestamp_millis(),
                profiles.len() + 1
            );
            profile.created_at = Some(chrono::Utc::now().to_rfc3339());
            profiles.push(profile.clone());
        }
    }

    write_json(&profiles_path(&state), &profiles)?;
    Ok(profile)
}

#[tauri::command]
pub async fn delete_connection_profile(
    state: State<'_, AppState>,
    profile_id: String,
) -> AppResult<()> {
    // Close the pool if this profile is currently connected.
    if let Some(pool) = state.pools.write().await.remove(&profile_id) {
        pool.close().await;
    }
    let mut profiles = load_profiles(&state)?;
    profiles.retain(|p| p.id != profile_id);
    write_json(&profiles_path(&state), &profiles)
}
