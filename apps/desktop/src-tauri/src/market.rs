//! Marketplace backend: detect the platform + container runtimes, fetch latest
//! GitHub releases for Exasol packages, and download / track / remove installs
//! under the app data directory.

use serde::Serialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, AppResult};

fn emit_log(app: &AppHandle, id: &str, line: impl Into<String>, level: &str) {
    let _ = app.emit(
        "market:log",
        json!({ "id": id, "line": line.into(), "level": level }),
    );
}

/// Run a command, streaming stdout/stderr line-by-line to the frontend log.
fn run_streamed(app: &AppHandle, id: &str, program: &str, args: &[&str]) -> AppResult<i32> {
    emit_log(app, id, format!("$ {program} {}", args.join(" ")), "cmd");
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Storage(format!("could not run `{program}`: {e}")))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let a1 = app.clone();
    let i1 = id.to_string();
    let h1 = std::thread::spawn(move || {
        if let Some(o) = stdout {
            for line in BufReader::new(o).lines().map_while(Result::ok) {
                emit_log(&a1, &i1, line, "out");
            }
        }
    });
    let a2 = app.clone();
    let i2 = id.to_string();
    let h2 = std::thread::spawn(move || {
        if let Some(e) = stderr {
            for line in BufReader::new(e).lines().map_while(Result::ok) {
                emit_log(&a2, &i2, line, "err");
            }
        }
    });
    let status = child.wait().map_err(|e| AppError::Storage(e.to_string()))?;
    let _ = h1.join();
    let _ = h2.join();
    Ok(status.code().unwrap_or(-1))
}

fn home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_default()
}

/// Resolve a working `uv` executable (PATH, then common install locations).
fn uv_path() -> Option<String> {
    if Command::new("uv").arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        return Some("uv".into());
    }
    for cand in [home().join(".local/bin/uv"), home().join(".cargo/bin/uv")] {
        if cand.exists() {
            return Some(cand.to_string_lossy().to_string());
        }
    }
    None
}

fn ensure_uv(app: &AppHandle, id: &str) -> AppResult<String> {
    if let Some(p) = uv_path() {
        emit_log(app, id, "uv is available.", "info");
        return Ok(p);
    }
    emit_log(app, id, "uv not found — installing the uv package manager…", "info");
    #[cfg(not(target_os = "windows"))]
    run_streamed(app, id, "sh", &["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"])?;
    #[cfg(target_os = "windows")]
    run_streamed(
        app,
        id,
        "powershell",
        &["-Command", "irm https://astral.sh/uv/install.ps1 | iex"],
    )?;
    uv_path().ok_or_else(|| AppError::Storage("uv installed but not found on PATH — restart may be needed.".into()))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketEnv {
    pub os: String,
    pub arch: String,
    pub docker: bool,
    pub podman: bool,
}

fn has_binary(bin: &str) -> bool {
    std::process::Command::new(bin)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Host OS/arch and whether Docker / Podman are available.
#[tauri::command]
pub fn market_env() -> MarketEnv {
    MarketEnv {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        docker: has_binary("docker"),
        podman: has_binary("podman"),
    }
}

fn market_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Storage(e.to_string()))?
        .join("marketplace");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn manifest_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(market_dir(app)?.join("installed.json"))
}

fn read_manifest(app: &AppHandle) -> Vec<Value> {
    manifest_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Vec<Value>>(&s).ok())
        .unwrap_or_default()
}

fn write_manifest(app: &AppHandle, items: &[Value]) -> AppResult<()> {
    std::fs::write(manifest_path(app)?, serde_json::to_string_pretty(items)?)?;
    Ok(())
}

/// The list of installed marketplace items.
#[tauri::command]
pub fn market_installed(app: AppHandle) -> AppResult<Value> {
    Ok(Value::Array(read_manifest(&app)))
}

/// Latest GitHub release for a repo ("owner/name"); null when none exist.
#[tauri::command]
pub async fn market_release(repo: String) -> AppResult<Value> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "exasol-studio")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if !resp.status().is_success() {
        return Ok(Value::Null);
    }
    let json: Value = resp.json().await.map_err(|e| AppError::Storage(e.to_string()))?;
    let assets = json
        .get("assets")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .map(|a| {
                    json!({
                        "name": a.get("name"),
                        "url": a.get("browser_download_url"),
                        "size": a.get("size"),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(json!({
        "tag": json.get("tag_name"),
        "name": json.get("name"),
        "publishedAt": json.get("published_at"),
        "htmlUrl": json.get("html_url"),
        "assets": assets,
    }))
}

/// Download a release asset into the managed folder and record it.
#[tauri::command]
pub async fn market_install(
    app: AppHandle,
    id: String,
    version: String,
    url: String,
    filename: String,
) -> AppResult<Value> {
    let dir = market_dir(&app)?.join(&id);
    std::fs::create_dir_all(&dir)?;
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "exasol-studio")
        .send()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Storage(format!("Download failed (HTTP {}).", resp.status())));
    }
    let bytes = resp.bytes().await.map_err(|e| AppError::Storage(e.to_string()))?;
    let file = dir.join(&filename);
    std::fs::write(&file, &bytes)?;

    let mut items = read_manifest(&app);
    items.retain(|it| it.get("id").and_then(|v| v.as_str()) != Some(id.as_str()));
    items.push(json!({
        "id": id,
        "version": version,
        "path": file.to_string_lossy(),
        "filename": filename,
    }));
    write_manifest(&app, &items)?;
    Ok(json!({ "ok": true, "path": file.to_string_lossy() }))
}

// ── Real, streamed installs ────────────────────────────────────────────────

async fn download_and_place(
    app: &AppHandle,
    id: &str,
    url: &str,
    filename: &str,
) -> AppResult<String> {
    let dir = market_dir(app)?.join(id);
    std::fs::create_dir_all(&dir)?;
    emit_log(app, id, format!("Downloading {filename}…"), "info");
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("User-Agent", "exasol-studio")
        .send()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Storage(format!("Download failed (HTTP {}).", resp.status())));
    }
    let bytes = resp.bytes().await.map_err(|e| AppError::Storage(e.to_string()))?;
    let file = dir.join(filename);
    std::fs::write(&file, &bytes)?;
    emit_log(app, id, format!("Saved {} ({} bytes).", file.display(), bytes.len()), "info");
    // Make a downloaded binary/archive executable on unix (best effort).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&file) {
            let mut perm = meta.permissions();
            perm.set_mode(0o755);
            let _ = std::fs::set_permissions(&file, perm);
        }
    }
    Ok(file.to_string_lossy().to_string())
}

fn install_uv_pip(app: &AppHandle, id: &str, package: &str) -> AppResult<String> {
    let uv = ensure_uv(app, id)?;
    let venv = market_dir(app)?.join(id).join("venv");
    std::fs::create_dir_all(venv.parent().unwrap())?;
    let venv_s = venv.to_string_lossy().to_string();
    emit_log(app, id, format!("Creating a managed environment at {venv_s}…"), "info");
    if run_streamed(app, id, &uv, &["venv", &venv_s])? != 0 {
        return Err(AppError::Storage("uv venv failed.".into()));
    }
    emit_log(app, id, format!("Installing {package}…"), "info");
    if run_streamed(app, id, &uv, &["pip", "install", "--python", &venv_s, package])? != 0 {
        return Err(AppError::Storage(format!("uv pip install {package} failed.")));
    }
    Ok(format!("{package} installed into {venv_s}"))
}

fn install_uv_tool(app: &AppHandle, id: &str, package: &str) -> AppResult<String> {
    let uv = ensure_uv(app, id)?;
    emit_log(app, id, format!("Installing {package} as a uv tool…"), "info");
    if run_streamed(app, id, &uv, &["tool", "install", "--force", package])? != 0 {
        return Err(AppError::Storage(format!("uv tool install {package} failed.")));
    }
    Ok(format!("{package} installed (uv tool)"))
}

// Reuse a running database if one exists, and skip MCP/data auto-config —
// those are separate Marketplace items the user installs on purpose.
const STARTER_KIT_SH: &str =
    "curl -fsSL https://raw.githubusercontent.com/krishna-exasol/starter-kit-testing-v1/main/install.sh | EXAKIT_SKIP_MCP=1 EXAKIT_LOAD_SAMPLE=1 EXAKIT_REUSE_DB=1 sh";
const STARTER_KIT_PS1: &str =
    "$env:EXAKIT_SKIP_MCP=1; $env:EXAKIT_LOAD_SAMPLE=1; $env:EXAKIT_REUSE_DB=1; irm https://raw.githubusercontent.com/krishna-exasol/starter-kit-testing-v1/main/install.ps1 | iex";

fn cmd_exists_unix(bin: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {bin}")])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn cmd_exists_win(bin: &str) -> bool {
    Command::new("powershell")
        .args(["-Command", &format!("if (Get-Command {bin} -ErrorAction SilentlyContinue) {{ exit 0 }} else {{ exit 1 }}")])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Install a local Exasol Personal database. macOS installs natively via the
/// official starter kit; Windows/Linux use a container runtime (Docker/Podman).
/// If a starter kit (`exakit`) is already present we REUSE it rather than
/// deploying a second database — never clone an existing local Exasol.
fn install_personal_local(app: &AppHandle, id: &str) -> AppResult<String> {
    let windows = std::env::consts::OS == "windows";
    let already = if windows { cmd_exists_win("exakit") } else { cmd_exists_unix("exakit") };

    if already {
        emit_log(
            app,
            id,
            "An existing Exasol starter kit was found — reusing your local database instead of deploying a new one.",
            "info",
        );
        // Bring it up if it isn't already running, then report status.
        if windows {
            let _ = run_streamed(app, id, "powershell", &["-Command", "exakit start"]);
            let _ = run_streamed(app, id, "powershell", &["-Command", "exakit status"]);
        } else {
            let _ = run_streamed(app, id, "sh", &["-c", "exakit start || true"]);
            let _ = run_streamed(app, id, "sh", &["-c", "exakit status || true"]);
        }
        return Ok("Reused your existing local Exasol (starter kit).".into());
    }

    match std::env::consts::OS {
        "macos" => {
            emit_log(app, id, "Installing Exasol Personal locally via the official starter kit…", "info");
            let code = run_streamed(app, id, "sh", &["-c", STARTER_KIT_SH])?;
            if code != 0 {
                return Err(AppError::Storage(format!("The installer exited with code {code}. See the log above.")));
            }
            Ok("Exasol Personal (local) installed via the starter kit.".into())
        }
        "windows" => {
            let env = market_env();
            if !env.docker {
                return Err(AppError::Storage(
                    "Docker Desktop is required to run Exasol locally on Windows. Install Docker Desktop, then try again — the rest of Exasol Studio works without it.".into(),
                ));
            }
            emit_log(app, id, "Docker detected — installing Exasol Personal via the starter kit…", "info");
            let code = run_streamed(app, id, "powershell", &["-Command", STARTER_KIT_PS1])?;
            if code != 0 {
                return Err(AppError::Storage(format!("The installer exited with code {code}. See the log above.")));
            }
            Ok("Exasol Personal (local) installed via Docker.".into())
        }
        _ => {
            let env = market_env();
            if !env.docker && !env.podman {
                return Err(AppError::Storage(
                    "Docker or Podman is required to run Exasol locally on Linux. Install one, then try again — the rest of Exasol Studio works without it.".into(),
                ));
            }
            emit_log(app, id, "Container runtime detected — installing Exasol Personal via the starter kit…", "info");
            let code = run_streamed(app, id, "sh", &["-c", STARTER_KIT_SH])?;
            if code != 0 {
                return Err(AppError::Storage(format!("The installer exited with code {code}. See the log above.")));
            }
            Ok("Exasol Personal (local) installed via a container runtime.".into())
        }
    }
}

/// Install the Exasol `c4` deployment tool used to launch Exasol on AWS, then
/// print the AWS deploy usage. Deployment itself (which needs AWS credentials
/// and incurs cost) is left for the user to run intentionally.
async fn install_cloud_c4(app: &AppHandle, id: &str) -> AppResult<String> {
    let plat = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "windows",
        _ => "linux",
    };
    let march = if std::env::consts::ARCH == "aarch64" { "aarch64" } else { "x86_64" };
    let fname = if plat == "windows" { "c4.exe" } else { "c4" };
    let url = format!("https://x-up.s3.amazonaws.com/releases/c4/{plat}/{march}/latest/{fname}");
    emit_log(app, id, format!("Downloading the c4 deployment tool for {plat}/{march}…"), "info");
    let path = match download_and_place(app, id, &url, fname).await {
        Ok(p) => p,
        Err(e) => {
            emit_log(app, id, format!("No prebuilt c4 for {plat}/{march}: {e}"), "err");
            emit_log(app, id, "Download c4 manually from https://downloads.exasol.com/exasol-8/c4", "info");
            return Err(e);
        }
    };
    emit_log(app, id, "c4 installed. To deploy Exasol on AWS:", "success");
    emit_log(app, id, "  1) Configure AWS credentials:  aws configure", "info");
    emit_log(app, id, format!("  2) Deploy:  {path} aws play -N 1 -T <package>"), "info");
    emit_log(app, id, "  Docs: https://docs.exasol.com/db/latest/administration/aws/c4/using_c4.htm", "info");
    Ok(format!("c4 deployment tool installed at {path}"))
}

/// Perform a real installation for an item, streaming logs over `market:log`
/// and finishing with a `market:done` event. Records the item as installed.
#[tauri::command]
pub async fn market_install_run(
    app: AppHandle,
    id: String,
    version: Option<String>,
    url: Option<String>,
    filename: Option<String>,
) -> AppResult<Value> {
    emit_log(&app, &id, "Starting installation…", "info");
    let result: AppResult<String> = match id.as_str() {
        "mcp-server" => install_uv_tool(&app, &id, "exasol-mcp-server"),
        "pyexasol" => install_uv_pip(&app, &id, "pyexasol"),
        "exasol-personal" => install_personal_local(&app, &id),
        "exasol-cloud" => install_cloud_c4(&app, &id).await,
        _ => match (url, filename) {
            (Some(u), Some(f)) => download_and_place(&app, &id, &u, &f).await,
            _ => Err(AppError::Storage("No downloadable asset was provided for this item.".into())),
        },
    };

    match result {
        Ok(note) => {
            let mut items = read_manifest(&app);
            items.retain(|it| it.get("id").and_then(|v| v.as_str()) != Some(id.as_str()));
            items.push(json!({
                "id": id,
                "version": version.unwrap_or_else(|| "latest".into()),
                "note": note,
            }));
            write_manifest(&app, &items)?;
            emit_log(&app, &id, "✓ Installation complete.", "success");
            let _ = app.emit("market:done", json!({ "id": id, "ok": true }));
            Ok(json!({ "ok": true }))
        }
        Err(e) => {
            emit_log(&app, &id, format!("✗ {e}"), "err");
            let _ = app.emit("market:done", json!({ "id": id, "ok": false, "error": e.to_string() }));
            Err(e)
        }
    }
}

/// Remove an installed item's files and manifest entry.
#[tauri::command]
pub fn market_uninstall(app: AppHandle, id: String) -> AppResult<()> {
    let dir = market_dir(&app)?.join(&id);
    let _ = std::fs::remove_dir_all(&dir);
    let mut items = read_manifest(&app);
    items.retain(|it| it.get("id").and_then(|v| v.as_str()) != Some(id.as_str()));
    write_manifest(&app, &items)?;
    Ok(())
}

// ── System detection ───────────────────────────────────────────────────────
// The manifest only knows what WE installed. These probes also recognise tools
// the user installed themselves (a binary dropped in their PATH, a uv tool, a
// python package) so a card shows "installed" instead of offering Install.

fn bin_present(bin: &str) -> bool {
    if std::env::consts::OS == "windows" {
        cmd_exists_win(bin)
    } else {
        cmd_exists_unix(bin)
    }
}

fn uv_tool_installed(pkg: &str) -> bool {
    let Some(uv) = uv_path() else { return false };
    Command::new(uv)
        .args(["tool", "list"])
        .output()
        .map(|o| {
            o.status.success()
                && String::from_utf8_lossy(&o.stdout)
                    .to_lowercase()
                    .contains(&pkg.to_lowercase())
        })
        .unwrap_or(false)
}

fn python_import_ok(module: &str) -> bool {
    ["python3", "python"].iter().any(|py| {
        Command::new(py)
            .args(["-c", &format!("import {module}")])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

fn managed_exists(app: &AppHandle, id: &str, name: &str) -> bool {
    market_dir(app).map(|d| d.join(id).join(name).exists()).unwrap_or(false)
}

/// Probe the real system for tools that may already be installed (in PATH, as a
/// uv tool, as a python package, or in our managed folder). Returns id → bool.
#[tauri::command]
pub fn market_detect(app: AppHandle) -> AppResult<Value> {
    let mut map = serde_json::Map::new();
    map.insert(
        "exasol-personal".into(),
        json!(bin_present("exakit") || bin_present("exasol")),
    );
    map.insert(
        "exapump".into(),
        json!(bin_present("exapump") || managed_exists(&app, "exapump", "exapump")),
    );
    map.insert(
        "exasol-cloud".into(),
        json!(bin_present("c4") || managed_exists(&app, "exasol-cloud", "c4") || managed_exists(&app, "exasol-cloud", "c4.exe")),
    );
    map.insert(
        "mcp-server".into(),
        json!(uv_tool_installed("exasol-mcp-server") || bin_present("exasol-mcp-server")),
    );
    map.insert(
        "pyexasol".into(),
        json!(managed_exists(&app, "pyexasol", "venv") || python_import_ok("pyexasol")),
    );
    Ok(Value::Object(map))
}

/// Reveal the marketplace folder path (so users can find downloads).
#[tauri::command]
pub fn market_dir_path(app: AppHandle) -> AppResult<String> {
    Ok(market_dir(&app)?.to_string_lossy().to_string())
}
