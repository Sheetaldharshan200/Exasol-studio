use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// Built-in local AI: a managed llama-server sidecar. The engine binary is
// downloaded on demand from llama.cpp's official GitHub releases (per-OS/arch
// CPU-safe builds; macOS gets Metal automatically), models are curated GGUFs
// from Hugging Face. Fixed localhost port so agent-core auto-detects it the
// same way it detects Ollama.

pub const BUILTIN_PORT: u16 = 41414;
const RELEASES_LATEST: &str = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
const PROGRESS_EVENT: &str = "llm-progress";

/// Curated models — verified GGUF URLs, all tool-call capable.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModel {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub file: &'static str,
    pub url: &'static str,
    pub size_mb: u64,
    pub min_ram_gb: u8,
}

const MODELS: &[LlmModel] = &[
    LlmModel {
        id: "qwen3-4b",
        name: "Qwen3 4B Instruct",
        description: "Best small all-rounder — strong tool calling, fast.",
        file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        size_mb: 2500,
        min_ram_gb: 8,
    },
    LlmModel {
        id: "llama-3.2-3b",
        name: "Llama 3.2 3B Instruct",
        description: "Lightest option for smaller machines.",
        file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        size_mb: 1926,
        min_ram_gb: 8,
    },
    LlmModel {
        id: "qwen2.5-coder-7b",
        name: "Qwen2.5 Coder 7B",
        description: "Strongest SQL/code quality — needs more RAM.",
        file: "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
        url: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf",
        size_mb: 4467,
        min_ram_gb: 16,
    },
];

#[derive(Default)]
pub struct LlmEngine {
    child: Mutex<Option<(Child, String)>>, // (process, model id)
}

impl LlmEngine {
    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some((mut child, _)) = guard.take() {
                let _ = child.kill();
            }
        }
        kill_port_orphans();
    }
}

/// Kill any process still bound to the builtin port — an engine left behind
/// by a previous app instance (force-quit, crash). Unix best-effort.
fn kill_port_orphans() {
    #[cfg(unix)]
    {
        if let Ok(out) = Command::new("lsof").args(["-ti", &format!(":{BUILTIN_PORT}")]).output() {
            for pid in String::from_utf8_lossy(&out.stdout).split_whitespace() {
                let _ = Command::new("kill").args(["-9", pid]).status();
            }
        }
    }
}

/// If something already serves the builtin port, return its model alias.
async fn serving_alias() -> Option<String> {
    let client = reqwest::Client::new();
    let res = client
        .get(format!("http://127.0.0.1:{BUILTIN_PORT}/v1/models"))
        .timeout(Duration::from_millis(900))
        .send()
        .await
        .ok()?;
    let body: serde_json::Value = res.json().await.ok()?;
    body["models"][0]["name"]
        .as_str()
        .or_else(|| body["data"][0]["id"].as_str())
        .map(String::from)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStatus {
    pub supported: bool,
    pub engine_installed: bool,
    pub engine_version: Option<String>,
    pub running_model: Option<String>,
    pub auto_start: bool,
    pub last_model: Option<String>,
    pub port: u16,
    pub models: Vec<LlmModelStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModelStatus {
    #[serde(flatten)]
    pub model: LlmModel,
    pub downloaded: bool,
}

/// Persisted built-in-AI preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmPrefs {
    /// Start the last-used model automatically when the app opens.
    #[serde(default = "default_true")]
    pub auto_start: bool,
    /// The last model the user ran.
    #[serde(default)]
    pub model: Option<String>,
}

fn default_true() -> bool {
    true
}

impl Default for LlmPrefs {
    fn default() -> Self {
        Self { auto_start: true, model: None }
    }
}

fn prefs_path(state: &AppState) -> PathBuf {
    llm_dir(state).join("prefs.json")
}

fn load_prefs(state: &AppState) -> LlmPrefs {
    fs::read_to_string(prefs_path(state))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_prefs(state: &AppState, prefs: &LlmPrefs) {
    let _ = fs::create_dir_all(llm_dir(state));
    let _ = fs::write(prefs_path(state), serde_json::to_string_pretty(prefs).unwrap_or_default());
}

fn llm_dir(state: &AppState) -> PathBuf {
    state.data_dir.join("llm")
}

fn engine_dir(state: &AppState) -> PathBuf {
    llm_dir(state).join("engine")
}

fn models_dir(state: &AppState) -> PathBuf {
    llm_dir(state).join("models")
}

/// The asset-name fragment for this OS/arch (CPU-safe builds; macOS = Metal).
fn asset_fragment() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("-bin-macos-arm64."),
        ("macos", "x86_64") => Some("-bin-macos-x64."),
        ("linux", "x86_64") => Some("-bin-ubuntu-x64."),
        ("linux", "aarch64") => Some("-bin-ubuntu-arm64."),
        ("windows", "x86_64") => Some("-bin-win-cpu-x64."),
        ("windows", "aarch64") => Some("-bin-win-cpu-arm64."),
        _ => None,
    }
}

fn server_binary_name() -> &'static str {
    if cfg!(windows) { "llama-server.exe" } else { "llama-server" }
}

fn walk_for(dir: &Path, name: &str, depth: u8) -> Option<PathBuf> {
    if depth > 4 {
        return None;
    }
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if let Some(found) = walk_for(&p, name, depth + 1) {
                return Some(found);
            }
        } else if p.file_name().and_then(|n| n.to_str()) == Some(name) {
            return Some(p);
        }
    }
    None
}

/// The engine bundled into the app resources (placed by the release workflow),
/// if present. Absent in dev builds.
fn bundled_engine(app: &AppHandle) -> Option<PathBuf> {
    let dir = app
        .path()
        .resolve("runtime/llama", tauri::path::BaseDirectory::Resource)
        .ok()?;
    walk_for(&dir, server_binary_name(), 0)
}

/// Find the llama-server executable: bundled with the app first (shipping
/// builds), else the on-demand download dir (dev / user-installed).
fn find_server(app: &AppHandle, state: &AppState) -> Option<PathBuf> {
    bundled_engine(app).or_else(|| walk_for(&engine_dir(state), server_binary_name(), 0))
}

fn emit(app: &AppHandle, stage: &str, pct: Option<u8>, msg: &str) {
    let _ = app.emit(
        PROGRESS_EVENT,
        serde_json::json!({ "stage": stage, "pct": pct, "msg": msg }),
    );
}

#[tauri::command]
pub async fn llm_status(app: AppHandle, state: State<'_, AppState>, engine: State<'_, LlmEngine>) -> AppResult<LlmStatus> {
    let mut running_model = engine
        .child
        .lock()
        .ok()
        .and_then(|mut g| {
            // Reap a dead process so status stays truthful.
            if let Some((child, model)) = g.as_mut() {
                match child.try_wait() {
                    Ok(None) => Some(model.clone()),
                    _ => {
                        *g = None;
                        None
                    }
                }
            } else {
                None
            }
        });

    // No owned child, but the port may be served by an engine from a previous
    // app instance — recognize it so the UI doesn't show a stale "Use".
    if running_model.is_none() {
        if let Some(alias) = serving_alias().await {
            running_model = MODELS.iter().find(|m| m.name == alias).map(|m| m.id.to_string());
        }
    }

    let version = fs::read_to_string(engine_dir(&state).join(".version")).ok();
    let prefs = load_prefs(&state);
    let mdir = models_dir(&state);
    Ok(LlmStatus {
        supported: asset_fragment().is_some(),
        engine_installed: find_server(&app, &state).is_some(),
        engine_version: version,
        running_model,
        auto_start: prefs.auto_start,
        last_model: prefs.model,
        port: BUILTIN_PORT,
        models: MODELS
            .iter()
            .map(|m| LlmModelStatus {
                model: m.clone(),
                downloaded: mdir.join(m.file).exists(),
            })
            .collect(),
    })
}

/// Download + extract the llama-server engine for this platform.
#[tauri::command]
pub async fn llm_engine_install(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    // A shipping build already carries the engine — nothing to download.
    if bundled_engine(&app).is_some() {
        emit(&app, "engine", Some(100), "Engine bundled with the app");
        return Ok(());
    }
    let fragment = asset_fragment().ok_or_else(|| {
        AppError::Assistant(format!(
            "Built-in AI is not available for {}/{} yet.",
            std::env::consts::OS,
            std::env::consts::ARCH
        ))
    })?;

    emit(&app, "engine", None, "Resolving latest engine release…");
    let client = reqwest::Client::builder()
        .user_agent("exasol-studio")
        .build()
        .map_err(|e| AppError::Assistant(e.to_string()))?;
    // Separate no-redirect client purely for reading the Location header.
    let no_redirect = reqwest::Client::builder()
        .user_agent("exasol-studio")
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| AppError::Assistant(e.to_string()))?;

    // Resolve the latest tag from the releases/latest redirect — unlike the
    // REST API this is not rate-limited. Fall back to the API if it fails.
    let tag = match no_redirect
        .get("https://github.com/ggml-org/llama.cpp/releases/latest")
        .send()
        .await
        .ok()
        .and_then(|r| r.headers().get("location").and_then(|l| l.to_str().ok()).map(String::from))
        .and_then(|loc| loc.rsplit('/').next().map(String::from))
        .filter(|t| !t.is_empty())
    {
        Some(tag) => tag,
        None => {
            let release: serde_json::Value = client
                .get(RELEASES_LATEST)
                .send()
                .await
                .map_err(|e| AppError::Assistant(format!("release lookup failed: {e}")))?
                .json()
                .await
                .map_err(|e| AppError::Assistant(format!("bad release payload: {e}")))?;
            match release["tag_name"].as_str() {
                Some(t) => t.to_string(),
                None => {
                    let msg = release["message"].as_str().unwrap_or("unknown error");
                    return Err(AppError::Assistant(format!("could not resolve engine release: {msg}")));
                }
            }
        }
    };

    // Asset names follow "llama-<tag>-bin-<platform>.<ext>" in every release.
    let ext = if cfg!(windows) { "zip" } else { "tar.gz" };
    let name = format!("llama-{tag}{fragment}{ext}");
    let url = format!("https://github.com/ggml-org/llama.cpp/releases/download/{tag}/{name}");
    let name = name.as_str();
    let url = url.as_str();

    // Fresh install dir per version.
    let dir = engine_dir(&state);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|e| AppError::Assistant(e.to_string()))?;
    let archive = dir.join(name);

    download_with_progress(&app, &client, url, &archive, "engine").await?;

    emit(&app, "engine", None, "Extracting…");
    let ok = if name.ends_with(".zip") {
        Command::new(if cfg!(windows) { "tar" } else { "unzip" })
            .args(if cfg!(windows) {
                vec!["-xf", archive.to_str().unwrap_or(""), "-C", dir.to_str().unwrap_or("")]
            } else {
                vec!["-oq", archive.to_str().unwrap_or(""), "-d", dir.to_str().unwrap_or("")]
            })
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    } else {
        Command::new("tar")
            .args(["-xzf", archive.to_str().unwrap_or(""), "-C", dir.to_str().unwrap_or("")])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    };
    if !ok {
        return Err(AppError::Assistant("engine archive extraction failed".into()));
    }
    let _ = fs::remove_file(&archive);

    let server = find_server(&app, &state)
        .ok_or_else(|| AppError::Assistant("llama-server not found in the engine archive".into()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // Every bundled binary needs the executable bit after extraction.
        if let Some(bin_dir) = server.parent() {
            for entry in fs::read_dir(bin_dir).into_iter().flatten().flatten() {
                let _ = fs::set_permissions(entry.path(), fs::Permissions::from_mode(0o755));
            }
        }
    }
    let _ = fs::write(dir.join(".version"), &tag);
    emit(&app, "engine", Some(100), "Engine ready");
    Ok(())
}

/// Download a curated model (resumable) into the models dir.
#[tauri::command]
pub async fn llm_model_install(app: AppHandle, state: State<'_, AppState>, model_id: String) -> AppResult<()> {
    let model = MODELS
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| AppError::Assistant(format!("unknown model {model_id}")))?;
    let dir = models_dir(&state);
    fs::create_dir_all(&dir).map_err(|e| AppError::Assistant(e.to_string()))?;
    let target = dir.join(model.file);
    if target.exists() {
        emit(&app, "model", Some(100), "Already downloaded");
        return Ok(());
    }
    let client = reqwest::Client::builder()
        .user_agent("exasol-studio")
        .build()
        .map_err(|e| AppError::Assistant(e.to_string()))?;
    download_with_progress(&app, &client, model.url, &target, "model").await?;
    emit(&app, "model", Some(100), "Model ready");
    Ok(())
}

/// Start (or switch) the engine on the fixed builtin port.
pub async fn start_model(app: &AppHandle, model_id: &str) -> AppResult<()> {
    use tauri::Manager;
    let state = app.state::<AppState>();
    let engine = app.state::<LlmEngine>();
    let model = MODELS
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| AppError::Assistant(format!("unknown model {model_id}")))?;
    let server = find_server(app, &state)
        .ok_or_else(|| AppError::Assistant("engine not installed".into()))?;
    let gguf = models_dir(&state).join(model.file);
    if !gguf.exists() {
        return Err(AppError::Assistant("model not downloaded".into()));
    }

    // Already serving this exact model (e.g. survived an app restart)? Adopt.
    if serving_alias().await.as_deref() == Some(model.name) {
        emit(app, "start", Some(100), "Model already running");
        return Ok(());
    }

    // Stop whatever is running first (also frees the port + orphans).
    engine.kill();

    emit(app, "start", None, &format!("Loading {}…", model.name));
    let child = Command::new(&server)
        .args([
            "-m",
            gguf.to_str().unwrap_or(""),
            "--host",
            "127.0.0.1",
            "--port",
            &BUILTIN_PORT.to_string(),
            "--jinja", // enables OpenAI-style tool calling
            "-ngl",
            "99", // full GPU offload where available; ignored on CPU builds
            "-c",
            "16384",
            "--alias",
            model.name,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::Assistant(format!("failed to start engine: {e}")))?;

    {
        let mut guard = engine
            .child
            .lock()
            .map_err(|_| AppError::Assistant("engine state poisoned".into()))?;
        *guard = Some((child, model_id.to_string()));
    }

    // Wait until the server reports healthy (model load can take a while).
    let client = reqwest::Client::new();
    let deadline = Instant::now() + Duration::from_secs(120);
    loop {
        if Instant::now() > deadline {
            engine.kill();
            return Err(AppError::Assistant("engine did not become ready within 120s".into()));
        }
        match client
            .get(format!("http://127.0.0.1:{BUILTIN_PORT}/health"))
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => break,
            _ => tokio::time::sleep(Duration::from_millis(600)).await,
        }
        // Bail out early if the process died (bad model / port conflict).
        if let Ok(mut guard) = engine.child.lock() {
            if let Some((child, _)) = guard.as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    *guard = None;
                    return Err(AppError::Assistant(format!(
                        "engine exited during startup ({status}). Is port {BUILTIN_PORT} free?"
                    )));
                }
            }
        }
    }

    emit(app, "start", Some(100), "Model loaded");
    Ok(())
}

#[tauri::command]
pub async fn llm_start(app: AppHandle, model_id: String) -> AppResult<()> {
    start_model(&app, &model_id).await?;
    {
        use tauri::Manager;
        let state = app.state::<AppState>();
        let mut prefs = load_prefs(&state);
        prefs.model = Some(model_id);
        save_prefs(&state, &prefs);
    }
    // Panels listen for this app-wide and refresh their model pickers.
    let _ = app.emit("ai-providers-changed", serde_json::json!({}));
    Ok(())
}

/// Toggle auto-start of the last-used built-in model on app launch.
#[tauri::command]
pub fn llm_set_auto_start(state: State<'_, AppState>, enabled: bool) -> AppResult<()> {
    let mut prefs = load_prefs(&state);
    prefs.auto_start = enabled;
    save_prefs(&state, &prefs);
    Ok(())
}

/// Called once at app startup: silently bring the last-used model up.
/// With no recorded preference, fall back to any already-downloaded model
/// (curated order) so a fresh install still comes up hands-free.
pub fn auto_start_if_enabled(app: &AppHandle) {
    use tauri::Manager;
    let model_id = {
        let state = app.state::<AppState>();
        let prefs = load_prefs(&state);
        if !prefs.auto_start || find_server(app, &state).is_none() {
            return;
        }
        let mdir = models_dir(&state);
        let downloaded = |id: &str| {
            MODELS
                .iter()
                .find(|m| m.id == id)
                .map(|m| mdir.join(m.file).exists())
                .unwrap_or(false)
        };
        let picked = prefs
            .model
            .clone()
            .filter(|id| downloaded(id))
            .or_else(|| MODELS.iter().find(|m| mdir.join(m.file).exists()).map(|m| m.id.to_string()));
        let Some(id) = picked else { return };
        if prefs.model.as_deref() != Some(&id) {
            save_prefs(&state, &LlmPrefs { auto_start: prefs.auto_start, model: Some(id.clone()) });
        }
        id
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if start_model(&app, &model_id).await.is_ok() {
            let _ = app.emit("ai-providers-changed", serde_json::json!({}));
        }
    });
}

#[tauri::command]
pub fn llm_stop(engine: State<'_, LlmEngine>) -> AppResult<()> {
    engine.kill();
    Ok(())
}

async fn download_with_progress(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    target: &Path,
    stage: &str,
) -> AppResult<()> {
    let partial = target.with_extension("part");
    let existing = fs::metadata(&partial).map(|m| m.len()).unwrap_or(0);

    let mut req = client.get(url).header("Accept", "application/octet-stream");
    if existing > 0 {
        req = req.header("Range", format!("bytes={existing}-"));
    }
    let res = req
        .send()
        .await
        .map_err(|e| AppError::Assistant(format!("download failed: {e}")))?;
    let status = res.status();
    if !status.is_success() {
        return Err(AppError::Assistant(format!("download failed: HTTP {status}")));
    }

    let resumed = status == reqwest::StatusCode::PARTIAL_CONTENT;
    let total = res.content_length().map(|l| l + if resumed { existing } else { 0 });
    let mut file = if resumed {
        fs::OpenOptions::new()
            .append(true)
            .open(&partial)
            .map_err(|e| AppError::Assistant(e.to_string()))?
    } else {
        fs::File::create(&partial).map_err(|e| AppError::Assistant(e.to_string()))?
    };

    let mut done: u64 = if resumed { existing } else { 0 };
    let mut last_pct: i16 = -1;
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| AppError::Assistant(format!("download interrupted: {e}")))?;
        file.write_all(&bytes)
            .map_err(|e| AppError::Assistant(e.to_string()))?;
        done += bytes.len() as u64;
        if let Some(total) = total {
            let pct = ((done as f64 / total as f64) * 100.0) as i16;
            if pct != last_pct {
                last_pct = pct;
                emit(
                    app,
                    stage,
                    Some(pct.clamp(0, 100) as u8),
                    &format!("{} / {} MB", done / 1_048_576, total / 1_048_576),
                );
            }
        }
    }
    drop(file);
    fs::rename(&partial, target).map_err(|e| AppError::Assistant(e.to_string()))?;
    Ok(())
}
