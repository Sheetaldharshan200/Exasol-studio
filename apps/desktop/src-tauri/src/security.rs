//! Master-password vault.
//!
//! A random 256-bit **data-encryption key (DEK)** encrypts secrets at rest
//! (connection passwords) with AES-256-GCM. The DEK never touches disk in the
//! clear: it is wrapped by a key derived (Argon2id) from the master password,
//! and additionally by keys derived from 5 one-time **recovery codes**. On
//! unlock the DEK is held in memory for the session only (see AppState).

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MARKER: &[u8] = b"exasol-studio-vault-v1";
const RECOVERY_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

#[derive(Serialize, Deserialize, Clone)]
struct RecoveryEntry {
    salt: String,
    wrapped: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Vault {
    version: u8,
    salt: String,               // argon2 salt for the master password
    verifier: String,           // MARKER encrypted with the master KEK
    dek_wrapped: String,        // DEK encrypted with the master KEK
    recovery: Vec<RecoveryEntry>,
}

fn vault_path(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("vault.json")
}

fn load_vault(state: &AppState) -> AppResult<Option<Vault>> {
    let p = vault_path(state);
    if !p.exists() {
        return Ok(None);
    }
    let raw = std::fs::read(&p)?;
    let v: Vault = serde_json::from_slice(&raw).map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(Some(v))
}

fn rand_bytes(n: usize) -> Vec<u8> {
    let mut b = vec![0u8; n];
    OsRng.fill_bytes(&mut b);
    b
}

fn derive_key(secret: &str, salt: &[u8]) -> AppResult<[u8; 32]> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(secret.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::Storage(format!("key derivation failed: {e}")))?;
    Ok(key)
}

/// Encrypt with AES-256-GCM; output is base64(nonce ‖ ciphertext).
fn seal(key: &[u8; 32], plaintext: &[u8]) -> AppResult<String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce_bytes = rand_bytes(12);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| AppError::Storage("encryption failed".into()))?;
    let mut out = nonce_bytes;
    out.extend_from_slice(&ct);
    Ok(B64.encode(out))
}

fn open(key: &[u8; 32], data: &str) -> AppResult<Vec<u8>> {
    let raw = B64.decode(data).map_err(|_| AppError::Storage("corrupt vault data".into()))?;
    if raw.len() < 12 {
        return Err(AppError::Storage("corrupt vault data".into()));
    }
    let (nonce_bytes, ct) = raw.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ct)
        .map_err(|_| AppError::Storage("wrong key".into()))
}

fn format_recovery_code() -> String {
    let raw = rand_bytes(25);
    let chars: Vec<char> = raw
        .iter()
        .map(|b| RECOVERY_ALPHABET[(*b as usize) % RECOVERY_ALPHABET.len()] as char)
        .collect();
    chars
        .chunks(5)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("-")
}

fn make_recovery(dek: &[u8; 32]) -> AppResult<(Vec<String>, Vec<RecoveryEntry>)> {
    let mut codes = Vec::new();
    let mut entries = Vec::new();
    for _ in 0..5 {
        let code = format_recovery_code();
        let salt = rand_bytes(16);
        let kek = derive_key(&code, &salt)?;
        entries.push(RecoveryEntry {
            salt: B64.encode(&salt),
            wrapped: seal(&kek, dek)?,
        });
        codes.push(code);
    }
    Ok((codes, entries))
}

fn validate_password(pw: &str) -> AppResult<()> {
    let ok_len = pw.chars().count() >= 10;
    let has_alpha = pw.chars().any(|c| c.is_alphabetic());
    let has_digit = pw.chars().any(|c| c.is_ascii_digit());
    if !ok_len || !has_alpha || !has_digit {
        return Err(AppError::InvalidSettings(
            "Master password must be at least 10 characters and include a letter and a number.".into(),
        ));
    }
    Ok(())
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub configured: bool,
    pub unlocked: bool,
    pub recovery_remaining: usize,
}

/// Unified-credential model: remember the master password in memory for this session and
/// keep the local Personal database's SYS credential equal to it. The sync is
/// best-effort in a background thread — vault operations never block on the
/// database, and a stopped DB picks the password up on its next bootstrap.
fn remember_master(app: &AppHandle, state: &State<'_, AppState>, password: &str) {
    *state.master_secret.write().unwrap() = Some(password.to_string());
    let app = app.clone();
    let master = password.to_string();
    std::thread::spawn(move || {
        if crate::local_runtime::personal_db_running(&app) {
            if let Err(error) = crate::local_database::sync_master_password(&app, &master) {
                crate::market::emit_log(
                    &app,
                    "personal-local",
                    format!("Master-password sync skipped: {error}"),
                    "info",
                );
            }
        }
    });
}

#[tauri::command]
pub async fn vault_status(state: State<'_, AppState>) -> AppResult<VaultStatus> {
    let vault = load_vault(&state)?;
    let unlocked = state.vault_key.read().unwrap().is_some();
    Ok(VaultStatus {
        configured: vault.is_some(),
        unlocked,
        recovery_remaining: vault.map(|v| v.recovery.len()).unwrap_or(0),
    })
}

/// Create the vault. Returns the 5 recovery codes (shown once, never stored).
#[tauri::command]
pub async fn vault_setup(app: AppHandle, state: State<'_, AppState>, password: String) -> AppResult<Vec<String>> {
    if load_vault(&state)?.is_some() {
        return Err(AppError::InvalidSettings("A master password is already set.".into()));
    }
    validate_password(&password)?;
    let mut dek = [0u8; 32];
    OsRng.fill_bytes(&mut dek);

    let salt = rand_bytes(16);
    let kek = derive_key(&password, &salt)?;
    let (codes, recovery) = make_recovery(&dek)?;
    let vault = Vault {
        version: 1,
        salt: B64.encode(&salt),
        verifier: seal(&kek, MARKER)?,
        dek_wrapped: seal(&kek, &dek)?,
        recovery,
    };
    std::fs::write(vault_path(&state), serde_json::to_vec_pretty(&vault).unwrap())?;
    *state.vault_key.write().unwrap() = Some(dek);
    remember_master(&app, &state, &password);
    Ok(codes)
}

#[tauri::command]
pub async fn vault_unlock(app: AppHandle, state: State<'_, AppState>, password: String) -> AppResult<bool> {
    let vault = load_vault(&state)?.ok_or_else(|| AppError::InvalidSettings("No master password is set.".into()))?;
    let salt = B64.decode(&vault.salt).map_err(|_| AppError::Storage("corrupt vault".into()))?;
    let kek = derive_key(&password, &salt)?;
    // Verify then unwrap the DEK.
    if open(&kek, &vault.verifier).map(|m| m != MARKER).unwrap_or(true) {
        return Err(AppError::InvalidSettings("Incorrect master password.".into()));
    }
    let dek = open(&kek, &vault.dek_wrapped)?;
    let mut key = [0u8; 32];
    key.copy_from_slice(&dek);
    *state.vault_key.write().unwrap() = Some(key);
    remember_master(&app, &state, &password);
    Ok(true)
}

#[tauri::command]
pub async fn vault_lock(state: State<'_, AppState>) -> AppResult<()> {
    *state.vault_key.write().unwrap() = None;
    *state.master_secret.write().unwrap() = None;
    Ok(())
}

/// Reset the master password using one recovery code. The used code is consumed.
#[tauri::command]
pub async fn vault_recover(
    app: AppHandle,
    state: State<'_, AppState>,
    code: String,
    new_password: String,
) -> AppResult<usize> {
    validate_password(&new_password)?;
    let mut vault = load_vault(&state)?.ok_or_else(|| AppError::InvalidSettings("No master password is set.".into()))?;
    let code = code.trim().to_uppercase();

    let mut found: Option<(usize, [u8; 32])> = None;
    for (i, entry) in vault.recovery.iter().enumerate() {
        let salt = match B64.decode(&entry.salt) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let kek = derive_key(&code, &salt)?;
        if let Ok(dek) = open(&kek, &entry.wrapped) {
            let mut key = [0u8; 32];
            key.copy_from_slice(&dek);
            found = Some((i, key));
            break;
        }
    }
    let (idx, dek) = found.ok_or_else(|| AppError::InvalidSettings("Invalid recovery key.".into()))?;

    // Re-wrap the DEK under the new password; consume the used recovery code.
    let salt = rand_bytes(16);
    let kek = derive_key(&new_password, &salt)?;
    vault.salt = B64.encode(&salt);
    vault.verifier = seal(&kek, MARKER)?;
    vault.dek_wrapped = seal(&kek, &dek)?;
    vault.recovery.remove(idx);
    std::fs::write(vault_path(&state), serde_json::to_vec_pretty(&vault).unwrap())?;
    *state.vault_key.write().unwrap() = Some(dek);
    remember_master(&app, &state, &new_password);
    Ok(vault.recovery.len())
}

/// Change the master password (must currently be unlocked / supply the old one).
#[tauri::command]
pub async fn vault_change_password(
    app: AppHandle,
    state: State<'_, AppState>,
    old_password: String,
    new_password: String,
) -> AppResult<()> {
    validate_password(&new_password)?;
    let mut vault = load_vault(&state)?.ok_or_else(|| AppError::InvalidSettings("No master password is set.".into()))?;
    let old_salt = B64.decode(&vault.salt).map_err(|_| AppError::Storage("corrupt vault".into()))?;
    let old_kek = derive_key(&old_password, &old_salt)?;
    let dek = open(&old_kek, &vault.dek_wrapped).map_err(|_| AppError::InvalidSettings("Incorrect current password.".into()))?;

    let salt = rand_bytes(16);
    let kek = derive_key(&new_password, &salt)?;
    vault.salt = B64.encode(&salt);
    vault.verifier = seal(&kek, MARKER)?;
    vault.dek_wrapped = seal(&kek, &dek)?;
    std::fs::write(vault_path(&state), serde_json::to_vec_pretty(&vault).unwrap())?;
    remember_master(&app, &state, &new_password);
    Ok(())
}

/// Regenerate a fresh set of 5 recovery codes (invalidates the old ones).
#[tauri::command]
pub async fn vault_regenerate_recovery(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    let key_guard = state.vault_key.read().unwrap();
    let dek = key_guard.ok_or_else(|| AppError::InvalidSettings("Unlock the vault first.".into()))?;
    drop(key_guard);
    let mut vault = load_vault(&state)?.ok_or_else(|| AppError::InvalidSettings("No master password is set.".into()))?;
    let (codes, entries) = make_recovery(&dek)?;
    vault.recovery = entries;
    std::fs::write(vault_path(&state), serde_json::to_vec_pretty(&vault).unwrap())?;
    Ok(codes)
}

// ── Secret field encryption (used by profiles) ───────────────────────────────

const SECRET_PREFIX: &str = "v1:";

/// Encrypt a secret for storage. No-op (returns plaintext) when the vault isn't
/// configured or is locked, so the app still works without a master password.
pub fn encrypt_secret(dek: Option<&[u8; 32]>, plaintext: &str) -> String {
    match dek {
        Some(key) => match seal(key, plaintext.as_bytes()) {
            Ok(enc) => format!("{SECRET_PREFIX}{enc}"),
            Err(_) => plaintext.to_string(),
        },
        None => plaintext.to_string(),
    }
}

/// Decrypt a stored secret. Plaintext (un-prefixed) values pass through so
/// pre-vault connections keep working. Returns an error only when a `v1:` value
/// can't be decrypted (vault locked).
pub fn decrypt_secret(dek: Option<&[u8; 32]>, stored: &str) -> AppResult<String> {
    if let Some(enc) = stored.strip_prefix(SECRET_PREFIX) {
        let key = dek.ok_or_else(|| AppError::InvalidSettings("The vault is locked — unlock it to use saved connections.".into()))?;
        let bytes = open(key, enc)?;
        Ok(String::from_utf8_lossy(&bytes).to_string())
    } else {
        Ok(stored.to_string())
    }
}

