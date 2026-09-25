//! Raising GitHub's rate limit by signing in.
//!
//! Without a sign-in GitHub allows **60 requests an hour per IP**, shared by
//! everything Studio does — and an unauthenticated `304 Not Modified` still
//! costs one, so caching cannot buy its way out. Studio avoids needing the API
//! at all for the common paths (the CI-built catalog mirror, and release
//! reads that fall back to github.com, which is not the API). This is for what
//! is left: when the allowance is gone and something still needs the API, the
//! person can connect a token and get 5,000 an hour instead.
//!
//! **A token with no scopes is enough** and is what the UI asks for: public
//! metadata is all Studio reads, so there is nothing to grant. The token is
//! encrypted with the same vault key as connection passwords and never leaves
//! this machine except as an `Authorization` header to github.com.

use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::security;
use crate::state::AppState;

/// The decrypted token, kept in memory so the many free functions that talk to
/// GitHub can reach it without threading an `AppHandle` through every call.
fn cache() -> &'static Mutex<Option<String>> {
    static CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

/// The token to send with GitHub requests, if the user connected one.
pub fn token() -> Option<String> {
    cache().lock().ok().and_then(|t| t.clone())
}

/// Add the `Authorization` header when a token is connected. Every GitHub
/// request in the app goes through this, so connecting lifts them all at once.
pub fn authorize(req: reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder {
    match token() {
        Some(t) => req.header("Authorization", format!("Bearer {t}")),
        None => req,
    }
}

/// Same, for the async client.
pub fn authorize_async(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match token() {
        Some(t) => req.header("Authorization", format!("Bearer {t}")),
        None => req,
    }
}

fn token_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir().map_err(|e| AppError::Storage(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("github-token"))
}

/// Read the stored token into memory.
///
/// Lazy rather than startup-only: the vault key that decrypts it is not set
/// until the vault unlocks, which happens after `setup`. The commands below
/// call this first, and the marketplace asks for status before it does
/// anything with GitHub, so a stored token is in place by the time it matters.
pub fn ensure_loaded(app: &AppHandle, state: &AppState) {
    if cache().lock().map(|t| t.is_some()).unwrap_or(false) {
        return;
    }
    let Ok(path) = token_path(app) else { return };
    let Ok(stored) = std::fs::read_to_string(&path) else { return };
    let key = *state.vault_key.read().unwrap();
    if let Ok(plain) = security::decrypt_secret(key.as_ref(), stored.trim()) {
        if !plain.is_empty() {
            *cache().lock().unwrap() = Some(plain);
        }
    }
}

/// What GitHub says the current allowance is.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GithubStatus {
    /// A token is stored and in use.
    pub connected: bool,
    /// The account the token belongs to, when connected.
    pub login: Option<String>,
    pub limit: Option<u64>,
    pub remaining: Option<u64>,
    /// Seconds until the allowance refills.
    pub resets_in_secs: Option<u64>,
    /// Where to create a token. No scopes are needed.
    pub token_url: String,
}

/// Ask GitHub for the allowance. `/rate_limit` does not itself consume one,
/// so this is safe to call even when everything else is refusing.
fn query_rate_limit(token: Option<&str>) -> Option<(u64, u64, u64)> {
    let mut req = reqwest::blocking::Client::new()
        .get("https://api.github.com/rate_limit")
        .header("User-Agent", "exasol-studio")
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(10));
    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    let body: serde_json::Value = req.send().ok()?.error_for_status().ok()?.json().ok()?;
    let core = body.get("resources")?.get("core")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let reset = core.get("reset")?.as_u64()?;
    Some((
        core.get("limit")?.as_u64()?,
        core.get("remaining")?.as_u64()?,
        reset.saturating_sub(now),
    ))
}

const TOKEN_URL: &str = "https://github.com/settings/tokens/new?description=Exasol%20Studio&scopes=";

/// The allowance right now, and whether a token is in use.
#[tauri::command]
pub fn github_status(app: AppHandle, state: tauri::State<'_, AppState>) -> AppResult<GithubStatus> {
    ensure_loaded(&app, &state);
    status_now()
}

fn status_now() -> AppResult<GithubStatus> {
    let tok = token();
    let login = tok.as_deref().and_then(|t| {
        let body: serde_json::Value = reqwest::blocking::Client::new()
            .get("https://api.github.com/user")
            .header("User-Agent", "exasol-studio")
            .header("Authorization", format!("Bearer {t}"))
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .ok()?
            .error_for_status()
            .ok()?
            .json()
            .ok()?;
        body.get("login")?.as_str().map(str::to_string)
    });
    let (limit, remaining, resets_in_secs) = match query_rate_limit(tok.as_deref()) {
        Some((l, r, s)) => (Some(l), Some(r), Some(s)),
        None => (None, None, None),
    };
    Ok(GithubStatus {
        connected: tok.is_some(),
        login,
        limit,
        remaining,
        resets_in_secs,
        token_url: TOKEN_URL.into(),
    })
}

/// Store a token, after proving it works. A token that GitHub rejects is not
/// saved — silently keeping a dead one would look identical to being rate
/// limited, which is the very confusion this feature exists to end.
#[tauri::command]
pub fn github_connect(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    token: String,
) -> AppResult<GithubStatus> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err(AppError::Storage("Paste the token you created on GitHub.".into()));
    }
    let (limit, ..) = query_rate_limit(Some(&token))
        .ok_or_else(|| AppError::Storage("GitHub did not accept that token. Create a new one and paste it again — it needs no scopes.".into()))?;
    if limit <= 60 {
        return Err(AppError::Storage(
            "GitHub still reports the signed-out allowance for that token, so it would change nothing. Check it was copied whole.".into(),
        ));
    }
    let key = *state.vault_key.read().unwrap();
    std::fs::write(token_path(&app)?, security::encrypt_secret(key.as_ref(), &token))?;
    *cache().lock().unwrap() = Some(token);
    status_now()
}

/// Forget the token. The app drops back to the signed-out allowance.
#[tauri::command]
pub fn github_disconnect(app: AppHandle) -> AppResult<GithubStatus> {
    *cache().lock().unwrap() = None;
    if let Ok(path) = token_path(&app) {
        let _ = std::fs::remove_file(path);
    }
    status_now()
}
