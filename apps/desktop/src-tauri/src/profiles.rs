use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::security;
use crate::state::AppState;
use crate::storage::{read_json, write_json};

pub const DEFAULT_PORT: u16 = 8563;

/// The current session's data-encryption key (None when the vault is locked or
/// not configured).
fn dek(state: &AppState) -> Option<[u8; 32]> {
    *state.vault_key.read().unwrap()
}

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
    let mut profile = load_profiles(state)?
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| {
            AppError::InvalidSettings(format!("unknown connection profile `{profile_id}`"))
        })?;
    // Decrypt the stored password for actual use (connect / driver bridges).
    profile.password = security::decrypt_secret(dek(state).as_ref(), &profile.password)?;
    Ok(profile)
}

/// Blank a profile's stored password (Connection Properties → Authentication
/// → "Clear at Disconnect"): the next connect prompts for it again.
pub fn clear_profile_password(state: &AppState, profile_id: &str) -> AppResult<()> {
    let mut profiles = load_profiles(state)?;
    if let Some(profile) = profiles.iter_mut().find(|p| p.id == profile_id) {
        profile.password = String::new();
    }
    write_json(&profiles_path(state), &profiles)
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
    // Pick up databases connected from the `exa` CLI before listing, so the
    // two programs show the same set. Failures here are ignored on purpose:
    // the user's own connections must still list if sharing has a problem.
    if let Err(err) = publish_local_profiles(&state) {
        eprintln!("could not publish connections to the shared registry: {err}");
    }
    if let Err(err) = import_shared_connections(&state) {
        eprintln!("could not import shared connections: {err}");
    }
    // Never hand stored passwords (encrypted or not) to the frontend — the UI
    // doesn't need them; reconnects decrypt server-side in `find_profile`.
    let mut profiles = load_profiles(&state)?;
    for p in &mut profiles {
        p.password = String::new();
    }
    Ok(profiles)
}

#[tauri::command]
pub fn save_connection_profile(
    state: State<'_, AppState>,
    profile: ConnectionProfile,
) -> AppResult<ConnectionProfile> {
    save_profile(&state, profile)
}

/// Persist a profile through the same validation and encryption path used by
/// the Tauri command. Background bootstrap jobs call this directly so local
/// defaults never bypass the vault.
pub fn save_profile(
    state: &AppState,
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

    // Encrypt the password at rest (no-op when no vault is configured). If the
    // field is left blank while editing an existing connection, keep the stored
    // one instead of clobbering it.
    let key = dek(state);
    match existing_index {
        Some(idx) => {
            if profile.password.is_empty() {
                profile.password = profiles[idx].password.clone();
            } else {
                profile.password = security::encrypt_secret(key.as_ref(), &profile.password);
            }
            profile.id = profiles[idx].id.clone();
            profile.created_at = profiles[idx].created_at.clone();
            profiles[idx] = profile.clone();
        }
        None => {
            profile.password = security::encrypt_secret(key.as_ref(), &profile.password);
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

    // Publish outward so the `exa` CLI sees this database too. Best effort:
    // a shared-registry problem must never fail saving a connection here.
    let plaintext = security::decrypt_secret(key.as_ref(), &profile.password).unwrap_or_default();
    let shared = crate::shared_registry::SharedConnection {
        id: crate::shared_registry::connection_id(&profile.host, profile.port, &profile.username),
        name: profile.name.clone(),
        host: profile.host.clone(),
        port: profile.port,
        user: profile.username.clone(),
        schema: profile.schema.clone(),
        managed: None,
        source: Some("studio".into()),
        created_at: profile.created_at.clone(),
    };
    if let Err(err) = crate::shared_registry::publish(shared, Some(plaintext.as_str())) {
        eprintln!("could not publish connection to the shared registry: {err}");
    }

    // Don't echo the stored secret back to the caller.
    profile.password = String::new();
    Ok(profile)
}

/// Publish Studio's existing connections outward, so databases that predate
/// the shared registry (deployed or added before this build) are visible to
/// the `exa` CLI without waiting for the user to re-save them.
///
/// Metadata AND the password are published for every connection, because the
/// password goes to the operating system's credential store rather than a
/// plaintext file — the same protection Studio's own vault provides, and the
/// reason there is no longer a local-only exception. A machine with no
/// credential store falls back to a 0600 file (see shared_registry).
pub fn publish_local_profiles(state: &AppState) -> AppResult<usize> {
    let registry = crate::shared_registry::read_registry();
    let key = dek(state);
    let mut published = 0usize;
    for profile in load_profiles(state)? {
        let id = crate::shared_registry::connection_id(&profile.host, profile.port, &profile.username);
        let known = registry.connections.iter().any(|c| c.id == id);
        let credential_present = crate::shared_registry::read_credential(&id).is_some();
        // Nothing to do when it is already listed and its secret is shared.
        if known && credential_present {
            continue;
        }
        let password =
            security::decrypt_secret(key.as_ref(), &profile.password).ok().filter(|p| !p.is_empty());
        let entry = crate::shared_registry::SharedConnection {
            id,
            name: profile.name.clone(),
            host: profile.host.clone(),
            port: profile.port,
            user: profile.username.clone(),
            schema: profile.schema.clone(),
            managed: None,
            source: Some("studio".into()),
            created_at: profile.created_at.clone(),
        };
        if crate::shared_registry::publish(entry, password.as_deref()).is_ok() {
            published += 1;
        }
    }
    Ok(published)
}

/// Import databases the CLI (or another program) registered that Studio has no
/// profile for yet, so a connection made in the terminal shows up here.
/// Best effort by design: sync is a convenience, never a startup dependency.
pub fn import_shared_connections(state: &AppState) -> AppResult<usize> {
    let registry = crate::shared_registry::read_registry();
    let existing = load_profiles(state)?;
    let known: Vec<(String, u16, String)> = existing
        .iter()
        .map(|p| (p.host.clone(), p.port, p.username.clone()))
        .collect();
    let missing = crate::shared_registry::missing_locally(&registry, &known);
    let mut imported = 0usize;
    for entry in missing {
        let password = crate::shared_registry::read_credential(&entry.id).unwrap_or_default();
        let profile = ConnectionProfile {
            id: String::new(),
            name: entry.name.clone(),
            host: entry.host.clone(),
            port: entry.port,
            username: entry.user.clone(),
            password,
            schema: entry.schema.clone(),
            notes: None,
            ssl_mode: default_ssl_mode(),
            compression: false,
            driver_id: default_driver(),
            created_at: entry.created_at.clone(),
            last_used_at: None,
        };
        if save_profile(state, profile).is_ok() {
            imported += 1;
        }
    }
    Ok(imported)
}

/// Create or reconcile the built-in local connection. Studio
/// refreshes the generated SYS secret while preserving the user's display
/// settings.
pub fn ensure_personal_local_profile(
    state: &AppState,
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> AppResult<ConnectionProfile> {
    if let Some(mut existing) = load_profiles(state)?.into_iter().find(|p| {
        p.host.trim().eq_ignore_ascii_case(host.trim())
            && p.port == port
            && p.username.eq_ignore_ascii_case(username)
    }) {
        existing.password = password.into();
        // Loopback connection — compression buys nothing and just adds CPU.
        // Force it off so an older managed profile that was created with
        // compression on is reconciled off, too.
        existing.compression = false;
        return save_profile(state, existing);
    }

    save_profile(
        state,
        ConnectionProfile {
            id: String::new(),
            // Match the sidebar card + onboarding wording so the connection
            // shows the same name everywhere.
            name: "Exasol Personal (local)".into(),
            host: host.into(),
            port,
            username: username.into(),
            password: password.into(),
            schema: None,
            notes: Some("Managed automatically by Exasol Studio".into()),
            ssl_mode: "preferred".into(),
            // Off by default — loopback gains nothing from compression.
            compression: false,
            driver_id: default_driver(),
            created_at: None,
            last_used_at: None,
        },
    )
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
