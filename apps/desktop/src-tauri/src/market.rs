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

/// Our own repo — the single source of truth for CI-built Marketplace artifacts.
const OUR_REPO: &str = "Sheetaldharshan200/Exasol-studio";

pub(crate) fn emit_log(app: &AppHandle, id: &str, line: impl Into<String>, level: &str) {
    let _ = app.emit(
        "market:log",
        json!({ "id": id, "line": line.into(), "level": level }),
    );
}

/// Run a command, streaming stdout/stderr line-by-line to the frontend log.
pub(crate) fn run_streamed(app: &AppHandle, id: &str, program: &str, args: &[&str]) -> AppResult<i32> {
    run_streamed_env(app, id, program, args, &[])
}

/// Like `run_streamed`, with extra environment variables for the child.
fn run_streamed_env(
    app: &AppHandle,
    id: &str,
    program: &str,
    args: &[&str],
    envs: &[(&str, &str)],
) -> AppResult<i32> {
    emit_log(app, id, format!("$ {program} {}", args.join(" ")), "cmd");
    let mut cmd = Command::new(program);
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    for (k, v) in envs {
        cmd.env(k, v);
    }
    with_path(&mut cmd);
    let mut child = cmd
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
                // Most CLIs (pip, cargo, git, uv) write normal progress to stderr,
                // so this is neutral output — NOT an error. Only explicit failures
                // (emitted with level "err" by the recipes) are shown red.
                emit_log(&a2, &i2, line, "out");
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

/// Bin directories a GUI app (launched via launchd/Finder) does NOT get on its
/// PATH but where CLI tools commonly live. We probe these directly and prepend
/// them when spawning subprocesses so `exakit`, `uv`, etc. resolve.
fn extra_bin_dirs() -> Vec<PathBuf> {
    let h = home();
    vec![
        h.join(".local/bin"),
        h.join(".cargo/bin"),
        h.join("bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/opt/homebrew/sbin"),
        PathBuf::from("/usr/local/bin"),
    ]
}

/// PATH with the extra bin dirs prepended (unix only; `:`-separated).
pub(crate) fn augmented_path() -> String {
    let mut parts: Vec<String> = extra_bin_dirs()
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    if let Ok(p) = std::env::var("PATH") {
        parts.push(p);
    }
    parts.join(":")
}

/// Prepend the extra bin dirs to a child's PATH so it can find user-installed
/// tools. No-op on Windows (different PATH syntax; GUI apps inherit PATH there).
fn with_path(cmd: &mut Command) {
    if std::env::consts::OS != "windows" {
        cmd.env("PATH", augmented_path());
    }
}

/// Locate an executable by name in the extra + standard bin dirs.
pub(crate) fn resolve_bin(bin: &str) -> Option<PathBuf> {
    for dir in extra_bin_dirs()
        .into_iter()
        .chain([PathBuf::from("/usr/bin"), PathBuf::from("/bin")])
    {
        let cand = dir.join(bin);
        if cand.is_file() {
            return Some(cand);
        }
    }
    None
}

/// Resolve a working `uv` executable (extra dirs first, then PATH).
fn uv_path() -> Option<String> {
    if let Some(p) = resolve_bin("uv") {
        return Some(p.to_string_lossy().to_string());
    }
    let mut c = Command::new("uv");
    c.arg("--version");
    with_path(&mut c);
    if c.output().map(|o| o.status.success()).unwrap_or(false) {
        return Some("uv".into());
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
    let prog = resolve_bin(bin).map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| bin.to_string());
    let mut c = Command::new(prog);
    c.arg("--version");
    with_path(&mut c);
    c.output().map(|o| o.status.success()).unwrap_or(false)
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

/// The marketplace catalog (single source of truth) published by our CI to
/// `marketplace/catalog.json` on the app repo's default branch. Null on error.
#[tauri::command]
pub async fn market_catalog() -> AppResult<Value> {
    const CATALOG_URL: &str =
        "https://raw.githubusercontent.com/Sheetaldharshan200/Exasol-studio/main/marketplace/catalog.json";
    let client = reqwest::Client::new();
    let resp = match client
        .get(CATALOG_URL)
        .header("User-Agent", "exasol-studio")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        _ => return Ok(Value::Null),
    };
    Ok(resp.json().await.unwrap_or(Value::Null))
}

fn docs_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let d = market_dir(app)?.join("docs");
    std::fs::create_dir_all(&d)?;
    Ok(d)
}

/// Fetch a repo's README as raw markdown (any filename/branch). Null on error.
#[tauri::command]
pub async fn market_doc(repo: String) -> AppResult<Value> {
    let client = reqwest::Client::new();
    // Primary: GitHub API resolves whichever README variant exists.
    let url = format!("https://api.github.com/repos/{repo}/readme");
    if let Ok(r) = client
        .get(&url)
        .header("User-Agent", "exasol-studio")
        .header("Accept", "application/vnd.github.raw")
        .send()
        .await
    {
        if r.status().is_success() {
            return Ok(json!(r.text().await.unwrap_or_default()));
        }
    }
    // Fallback (e.g. API rate-limited): fetch a raw README directly, which has
    // far more generous limits.
    for base in ["HEAD", "main", "master"] {
        for name in ["README.md", "readme.md", "README.rst", "README.markdown"] {
            let raw = format!("https://raw.githubusercontent.com/{repo}/{base}/{name}");
            if let Ok(r) = client.get(&raw).header("User-Agent", "exasol-studio").send().await {
                if r.status().is_success() {
                    return Ok(json!(r.text().await.unwrap_or_default()));
                }
            }
        }
    }
    Ok(Value::Null)
}

/// Fetch an arbitrary file from a repo (raw), used to follow relative links in
/// a README (e.g. CONTRIBUTING.md, docs/*.md). Null when it can't be fetched.
#[tauri::command]
pub async fn market_doc_file(repo: String, path: String) -> AppResult<Value> {
    let clean = path.trim_start_matches("./").trim_start_matches('/');
    let client = reqwest::Client::new();
    // Try the default branch, then common branch names.
    for base in ["HEAD", "main", "master"] {
        let url = format!("https://raw.githubusercontent.com/{repo}/{base}/{clean}");
        if let Ok(r) = client.get(&url).header("User-Agent", "exasol-studio").send().await {
            if r.status().is_success() {
                return Ok(json!(r.text().await.unwrap_or_default()));
            }
        }
    }
    Ok(Value::Null)
}

/// Open a URL in the user's default browser via the OS opener. More reliable
/// than the webview's window.open (a no-op in Tauri) and independent of the
/// JS opener plugin's scoping.
#[tauri::command]
pub fn open_external(url: String) -> AppResult<()> {
    if !(url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")) {
        return Err(AppError::Storage("Only http(s) and mailto URLs can be opened.".into()));
    }
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(&url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", url.as_str()]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(&url);
        c
    };
    with_path(&mut cmd);
    cmd.spawn().map_err(|e| AppError::Storage(format!("Could not open {url}: {e}")))?;
    Ok(())
}

/// Save a doc for offline use under the managed docs folder.
#[tauri::command]
pub fn market_doc_save(app: AppHandle, id: String, content: String) -> AppResult<()> {
    let safe = id.replace(['/', '\\', '.'], "_");
    std::fs::write(docs_dir(&app)?.join(format!("{safe}.md")), content)?;
    Ok(())
}

/// Load an offline doc (null if not saved).
#[tauri::command]
pub fn market_doc_load(app: AppHandle, id: String) -> AppResult<Value> {
    let safe = id.replace(['/', '\\', '.'], "_");
    match std::fs::read_to_string(docs_dir(&app)?.join(format!("{safe}.md"))) {
        Ok(s) => Ok(json!(s)),
        Err(_) => Ok(Value::Null),
    }
}

/// Remove an offline doc.
#[tauri::command]
pub fn market_doc_forget(app: AppHandle, id: String) -> AppResult<()> {
    let safe = id.replace(['/', '\\', '.'], "_");
    let _ = std::fs::remove_file(docs_dir(&app)?.join(format!("{safe}.md")));
    Ok(())
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
    use futures_util::StreamExt;
    use std::io::Write;

    let dir = market_dir(app)?.join(id);
    std::fs::create_dir_all(&dir)?;
    emit_log(app, id, format!("Downloading {filename}…"), "info");
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        // GitHub asset API URLs return JSON metadata unless we ask for the raw
        // bytes — this header makes both the API and browser URLs stream the file.
        .header("Accept", "application/octet-stream")
        .header("User-Agent", "exasol-studio")
        .send()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Storage(format!("Download failed (HTTP {}).", resp.status())));
    }

    let total = resp.content_length();
    let file = dir.join(filename);
    let mut out = std::fs::File::create(&file)?;
    let mut received: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Storage(e.to_string()))?;
        out.write_all(&chunk)?;
        received += chunk.len() as u64;
        let pct = total.map(|t| if t > 0 { (received * 100 / t).min(100) } else { 0 });
        let _ = app.emit(
            "market:progress",
            json!({ "id": id, "received": received, "total": total, "pct": pct }),
        );
    }
    let _ = app.emit(
        "market:progress",
        json!({ "id": id, "received": received, "total": total.or(Some(received)), "pct": 100 }),
    );
    emit_log(app, id, format!("Saved {} ({} bytes).", file.display(), received), "info");
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
    if run_streamed(app, id, &uv, &["venv", "--python", "3.11", &venv_s])? != 0 {
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

fn cmd_exists_unix(bin: &str) -> bool {
    if resolve_bin(bin).is_some() {
        return true;
    }
    let mut c = Command::new("sh");
    c.args(["-c", &format!("command -v {bin}")]);
    with_path(&mut c);
    c.output().map(|o| o.status.success()).unwrap_or(false)
}

fn cmd_exists_win(bin: &str) -> bool {
    Command::new("powershell")
        .args(["-Command", &format!("if (Get-Command {bin} -ErrorAction SilentlyContinue) {{ exit 0 }} else {{ exit 1 }}")])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// The official Exasol Personal launcher (`exasol`) drives BOTH local and cloud
// deployments — the single source for exasol-personal.
const EXASOL_INSTALLER_SH: &str = "curl -fsSL https://www.exasol.com/install/ | sh";

fn exasol_bin() -> String {
    resolve_bin("exasol").map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| "exasol".into())
}

/// Ensure the official Exasol launcher is installed (into ~/.local/bin).
fn ensure_exasol_launcher(app: &AppHandle, id: &str) -> AppResult<()> {
    if bin_present("exasol") {
        emit_log(app, id, "Exasol launcher is already installed.", "info");
        return Ok(());
    }
    if std::env::consts::OS == "windows" {
        return Err(AppError::Storage(
            "On Windows, download the Exasol launcher from https://downloads.exasol.com/exasol-personal and place it on your PATH, then try again.".into(),
        ));
    }
    emit_log(app, id, "Installing the official Exasol launcher…", "info");
    let code = run_streamed(app, id, "sh", &["-c", EXASOL_INSTALLER_SH])?;
    if code != 0 {
        return Err(AppError::Storage(format!("Launcher install exited with code {code}. See the log above.")));
    }
    Ok(())
}

/// Exasol Personal — local deployment (macOS only, per the official launcher).
fn install_personal_local(app: &AppHandle, id: &str) -> AppResult<String> {
    if std::env::consts::OS != "macos" {
        return Err(AppError::Storage(
            "Exasol Personal local deployment is macOS-only. Use “Exasol Personal — Cloud” to deploy on AWS, Azure, Exoscale or STACKIT.".into(),
        ));
    }
    ensure_exasol_launcher(app, id)?;
    emit_log(app, id, "Deploying a local Exasol database (this can take a few minutes)…", "info");
    let exa = exasol_bin();
    let code = run_streamed(app, id, &exa, &["install", "local"])?;
    if code != 0 {
        return Err(AppError::Storage(format!("`exasol install local` exited with code {code}. See the log above.")));
    }
    Ok("Exasol Personal deployed locally.".into())
}

/// Exasol Personal — cloud. Installs the launcher and shows the deploy commands;
/// provisioning needs the user's cloud credentials and is left for them to run.
fn install_personal_cloud(app: &AppHandle, id: &str) -> AppResult<String> {
    ensure_exasol_launcher(app, id)?;
    let exa = exasol_bin();
    emit_log(app, id, "Exasol launcher ready. Deploy to your cloud provider with:", "success");
    emit_log(app, id, format!("  {exa} install aws        # Amazon Web Services"), "info");
    emit_log(app, id, format!("  {exa} install azure      # Microsoft Azure"), "info");
    emit_log(app, id, format!("  {exa} install exoscale   # Exoscale"), "info");
    emit_log(app, id, format!("  {exa} install stackit    # STACKIT"), "info");
    emit_log(app, id, "Configure provider credentials first; provisioning takes ~10–20 min and uses your cloud account (costs may apply).", "info");
    emit_log(app, id, "Setup guides: https://github.com/exasol/exasol-personal", "info");
    Ok("Exasol launcher installed — run `exasol install <provider>` to deploy.".into())
}

/// Fetch a release ("tag") of OUR repo and return its assets array.
async fn our_mirror_assets(tag: &str) -> AppResult<Vec<Value>> {
    let url = format!("https://api.github.com/repos/{OUR_REPO}/releases/tags/{tag}");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "exasol-studio")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if !resp.status().is_success() {
        return Ok(vec![]);
    }
    let json: Value = resp.json().await.map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(json.get("assets").and_then(|a| a.as_array()).cloned().unwrap_or_default())
}

/// Pick an asset whose name matches the host OS + arch.
fn pick_platform_asset<'a>(assets: &'a [Value]) -> Option<&'a Value> {
    let os_tokens: &[&str] = match std::env::consts::OS {
        "macos" => &["darwin", "macos", "apple", "osx"],
        "windows" => &["windows", "win", ".exe"],
        _ => &["linux"],
    };
    let arch_tokens: &[&str] = if std::env::consts::ARCH == "aarch64" {
        &["arm64", "aarch64"]
    } else {
        &["x86_64", "amd64", "x64"]
    };
    let name = |a: &Value| a.get("name").and_then(|n| n.as_str()).unwrap_or("").to_lowercase();
    assets
        .iter()
        .find(|a| {
            let n = name(a);
            !n.ends_with(".whl")
                && os_tokens.iter().any(|t| n.contains(t))
                && arch_tokens.iter().any(|t| n.contains(t))
        })
        .or_else(|| assets.iter().find(|a| {
            let n = name(a);
            !n.ends_with(".whl") && os_tokens.iter().any(|t| n.contains(t))
        }))
}

/// JSON Tables (exasol-labs/exasol-json-tables): a Python package plus a Rust
/// ingest engine. The ingest engine is cross-compiled once by OUR CI and shipped
/// in our `mirror-json-tables` release, so the user never needs Rust/cargo — we
/// just download the prebuilt binary + wheel and install the wheel with uv.
async fn install_json_tables(app: &AppHandle, id: &str) -> AppResult<String> {
    let assets = our_mirror_assets("mirror-json-tables").await?;
    if assets.is_empty() {
        return Err(AppError::Storage(
            "JSON Tables prebuilt artifacts aren't published yet. They are built by our CI (pkg-json-tables workflow) — check back after it has run.".into(),
        ));
    }
    let base = market_dir(app)?.join(id);
    std::fs::create_dir_all(&base)?;

    // 1) prebuilt Rust ingest binary for this platform
    if let Some(ing) = pick_platform_asset(&assets) {
        let url = ing.get("url").or_else(|| ing.get("browser_download_url")).and_then(|u| u.as_str());
        let nm = ing.get("name").and_then(|n| n.as_str());
        if let (Some(u), Some(n)) = (url, nm) {
            emit_log(app, id, "Fetching the prebuilt ingest engine (built by our CI)…", "info");
            download_and_place(app, id, u, n).await?;
        }
    } else {
        emit_log(app, id, "No prebuilt ingest engine for this platform — installing the Python package only.", "info");
    }

    // 2) Python wheel via uv
    let wheel = assets.iter().find(|a| {
        a.get("name").and_then(|n| n.as_str()).map(|n| n.ends_with(".whl")).unwrap_or(false)
    });
    let wheel = wheel.ok_or_else(|| AppError::Storage("The JSON Tables wheel is missing from the release.".into()))?;
    let wurl = wheel.get("url").or_else(|| wheel.get("browser_download_url")).and_then(|u| u.as_str())
        .ok_or_else(|| AppError::Storage("wheel URL missing".into()))?;
    let wname = wheel.get("name").and_then(|n| n.as_str()).unwrap_or("exasol_json_tables.whl");
    emit_log(app, id, "Fetching the Python package…", "info");
    let wpath = download_and_place(app, id, wurl, wname).await?;

    let uv = ensure_uv(app, id)?;
    let venv = base.join("venv");
    let venv_s = venv.to_string_lossy().to_string();
    emit_log(app, id, "Installing exasol-json-tables into a managed environment…", "info");
    run_streamed(app, id, &uv, &["venv", "--clear", "--python", "3.11", &venv_s])?;
    if run_streamed(app, id, &uv, &["pip", "install", "--python", &venv_s, &wpath])? != 0 {
        return Err(AppError::Storage("uv pip install of the JSON Tables wheel failed.".into()));
    }
    Ok("JSON Tables installed (prebuilt ingest engine + Python package).".into())
}

fn superset_bin(venv: &std::path::Path) -> PathBuf {
    if std::env::consts::OS == "windows" {
        venv.join("Scripts/superset.exe")
    } else {
        venv.join("bin/superset")
    }
}

/// Apache Superset — the optional BI tool (Apache-2.0). Installed into a managed
/// uv environment together with the official Exasol SQLAlchemy dialect, then
/// initialised. Not bundled; users opt in from the Marketplace.
/// Minimal Superset config that lets it be embedded inside an Exasol Studio tab
/// (iframe): no Talisman, no X-Frame-Options/CSP frame restrictions, no CSRF
/// friction for the single local user. Kept deliberately small to avoid startup
/// failure modes.
fn superset_config_py() -> &'static str {
    "SECRET_KEY = \"exasol-studio-local-dev-key\"\n\
     TALISMAN_ENABLED = False\n\
     HTTP_HEADERS = {}\n\
     WTF_CSRF_ENABLED = False\n"
}

fn install_superset(app: &AppHandle, id: &str) -> AppResult<String> {
    let uv = ensure_uv(app, id)?;
    let base = market_dir(app)?.join(id);
    std::fs::create_dir_all(&base)?;
    let venv = base.join("venv");
    let venv_s = venv.to_string_lossy().to_string();
    let home = base.join("home");
    std::fs::create_dir_all(&home)?;
    let home_s = home.to_string_lossy().to_string();

    // Superset supports Python <=3.11 and pins pandas versions with no 3.13
    // wheels, so a default (newest) interpreter fails building pandas from
    // source. uv downloads a managed 3.11 automatically when it's missing.
    emit_log(app, id, "Creating a managed Python 3.11 environment…", "info");
    // `--clear` recreates the venv if a previous (possibly half-finished)
    // install left one behind, instead of erroring out.
    if run_streamed(app, id, &uv, &["venv", "--clear", "--python", "3.11", &venv_s])? != 0 {
        return Err(AppError::Storage("Could not create the Python 3.11 environment for Superset.".into()));
    }
    // Config that lets Superset be embedded inside an Exasol Studio tab: drop the
    // X-Frame-Options/CSP frame restrictions Talisman adds so an <iframe> can load it.
    let cfg = base.join("superset_config.py");
    let _ = std::fs::write(&cfg, superset_config_py());
    emit_log(app, id, "Installing Apache Superset + the official Exasol dialect (this can take a few minutes)…", "info");
    if run_streamed(app, id, &uv, &["pip", "install", "--python", &venv_s, "apache-superset", "sqlalchemy-exasol", "rich", "Pillow", "cachetools"])? != 0 {
        // bi_installed()/tool detection treat an existing venv as "installed" —
        // don't leave a broken one behind.
        let _ = std::fs::remove_dir_all(&venv);
        return Err(AppError::Storage("Superset installation failed. See the log above.".into()));
    }

    let superset = superset_bin(&venv).to_string_lossy().to_string();
    let cfg_s = cfg.to_string_lossy().to_string();
    let envs: &[(&str, &str)] = &[
        ("FLASK_APP", "superset"),
        ("SUPERSET_SECRET_KEY", "exasol-studio-local-dev-key"),
        ("SUPERSET_HOME", &home_s),
        ("SUPERSET_CONFIG_PATH", &cfg_s),
    ];
    emit_log(app, id, "Initializing Superset metadata…", "info");
    if run_streamed_env(app, id, &superset, &["db", "upgrade"], envs)? != 0 {
        let _ = std::fs::remove_dir_all(&venv);
        return Err(AppError::Storage("`superset db upgrade` failed.".into()));
    }
    let _ = run_streamed_env(
        app,
        id,
        &superset,
        &["fab", "create-admin", "--username", "admin", "--firstname", "Exasol", "--lastname", "Studio", "--email", "admin@exasol.local", "--password", "admin"],
        envs,
    );
    let _ = run_streamed_env(app, id, &superset, &["init"], envs);
    Ok("Apache Superset installed. Open it from the SQL editor’s ‘Open in BI’ button (login: admin / admin).".into())
}

/// True when Apache Superset has been installed into its managed environment.
#[tauri::command]
pub fn bi_installed(app: AppHandle) -> AppResult<bool> {
    Ok(market_dir(&app)?.join("superset").join("venv").exists())
}

/// Start the local Superset server (detached) and return its URL.
#[tauri::command]
pub fn bi_launch(app: AppHandle) -> AppResult<String> {
    let base = market_dir(&app)?.join("superset");
    let venv = base.join("venv");
    if !venv.exists() {
        return Err(AppError::Storage(
            "Apache Superset isn’t installed yet. Install it from the Marketplace first.".into(),
        ));
    }
    let home = base.join("home");
    std::fs::create_dir_all(&home)?;
    // Ensure the embeddable config exists (older installs predate it).
    let cfg = base.join("superset_config.py");
    // Always (re)write so older installs pick up the current embeddable config.
    let _ = std::fs::write(&cfg, superset_config_py());
    let superset = superset_bin(&venv);
    let mut cmd = Command::new(&superset);
    cmd.args(["run", "-p", "8088", "--with-threads"])
        .env("FLASK_APP", "superset")
        .env("SUPERSET_SECRET_KEY", "exasol-studio-local-dev-key")
        .env("SUPERSET_HOME", home.to_string_lossy().to_string())
        .env("SUPERSET_CONFIG_PATH", cfg.to_string_lossy().to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    with_path(&mut cmd);
    cmd.spawn().map_err(|e| AppError::Storage(format!("Could not start Superset: {e}")))?;
    Ok("http://localhost:8088".into())
}

/// Percent-encode URL userinfo (username / password) so special characters
/// don't break the SQLAlchemy URI.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Register (or update) an Exasol database connection inside Superset's metadata
/// so the user doesn't have to add it by hand. Uses the SQLAlchemy dialect URI
/// (`exa+websocket://…`). Runs against the metadata DB (server up or down).
#[tauri::command]
pub fn bi_register_db(
    app: AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
    profile_id: String,
    name: String,
) -> AppResult<()> {
    // Build the SQLAlchemy URI server-side from the (decrypted) profile so the
    // password never has to reach the frontend.
    let profile = crate::profiles::find_profile(&state, &profile_id)?;
    let user = percent_encode(&profile.username);
    let pass = percent_encode(&profile.password);
    let query = if profile.ssl_mode == "disabled" {
        "?ENCRYPTION=No"
    } else if profile.ssl_mode == "verify_ca" || profile.ssl_mode == "verify_identity" {
        ""
    } else {
        "?SSLCertificate=SSL_VERIFY_NONE"
    };
    let uri = format!(
        "exa+websocket://{user}:{pass}@{}:{}/{query}",
        profile.host, profile.port
    );

    let base = market_dir(&app)?.join("superset");
    let venv = base.join("venv");
    if !venv.exists() {
        return Err(AppError::Storage("Superset isn’t installed yet.".into()));
    }
    let home = base.join("home");
    std::fs::create_dir_all(&home)?;
    let cfg = base.join("superset_config.py");
    let _ = std::fs::write(&cfg, superset_config_py());
    let superset = superset_bin(&venv);
    let db_name = if name.trim().is_empty() { "Exasol".to_string() } else { name };
    let mut cmd = Command::new(&superset);
    cmd.args(["set_database_uri", "-d", &db_name, "-u", &uri])
        .env("FLASK_APP", "superset")
        .env("SUPERSET_SECRET_KEY", "exasol-studio-local-dev-key")
        .env("SUPERSET_HOME", home.to_string_lossy().to_string())
        .env("SUPERSET_CONFIG_PATH", cfg.to_string_lossy().to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    with_path(&mut cmd);
    let status = cmd.status().map_err(|e| AppError::Storage(format!("Could not run Superset CLI: {e}")))?;
    if !status.success() {
        return Err(AppError::Storage("Could not register the Exasol connection in Superset.".into()));
    }
    Ok(())
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
        "agent-skills" => install_uv_tool(&app, &id, "exasol-agent-skills"),
        "pyexasol" => install_uv_pip(&app, &id, "pyexasol"),
        "sqlalchemy-exasol" => install_uv_pip(&app, &id, "sqlalchemy-exasol"),
        "ai-lab" => install_uv_pip(&app, &id, "exasol-ai-lab"),
        "json-tables" => install_json_tables(&app, &id).await,
        "superset" => install_superset(&app, &id),
        "exasol-personal" => install_personal_local(&app, &id),
        "exasol-cloud" => install_personal_cloud(&app, &id),
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

/// Control a local Exasol Personal deployment (start / stop / status / info /
/// destroy) via the `exasol` launcher. Streams output over `market:log` under
/// the id `exasol-local` and finishes with `market:done`, so the frontend can
/// reuse the install-console UI. Blocking lifecycle actions (start/stop/destroy)
/// can take a while; the launcher prints progress as it goes.
#[tauri::command]
pub async fn exasol_local_ctl(app: AppHandle, action: String) -> AppResult<Value> {
    const ID: &str = "exasol-local";
    // Allowlist — never pass arbitrary strings to the launcher.
    let allowed = ["status", "info", "start", "stop", "destroy"];
    if !allowed.contains(&action.as_str()) {
        return Err(AppError::Storage(format!("Unsupported action: {action}")));
    }
    if !bin_present("exasol") {
        let e = AppError::Storage(
            "Exasol launcher not found. Install “Exasol Personal — Local” from the Marketplace first.".into(),
        );
        emit_log(&app, ID, format!("✗ {e}"), "err");
        let _ = app.emit("market:done", json!({ "id": ID, "ok": false, "error": e.to_string() }));
        return Err(e);
    }
    // `destroy` is irreversible — pass `--yes` so it doesn't hang on a prompt.
    let exa = exasol_bin();
    let args: Vec<&str> = if action == "destroy" {
        vec!["destroy", "--yes"]
    } else {
        vec![action.as_str()]
    };
    let code = run_streamed(&app, ID, &exa, &args)?;
    let ok = code == 0;
    if ok {
        emit_log(&app, ID, format!("✓ exasol {action} finished."), "success");
    } else {
        emit_log(&app, ID, format!("✗ exasol {action} exited with code {code}."), "err");
    }
    let _ = app.emit("market:done", json!({ "id": ID, "ok": ok }));
    Ok(json!({ "ok": ok, "code": code }))
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
    let mut c = Command::new(uv);
    c.args(["tool", "list"]);
    with_path(&mut c);
    c.output()
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
        let prog = resolve_bin(py).map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| py.to_string());
        let mut c = Command::new(prog);
        c.args(["-c", &format!("import {module}")]);
        with_path(&mut c);
        c.output().map(|o| o.status.success()).unwrap_or(false)
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
    // Exasol Personal launcher drives both local and cloud.
    let launcher = bin_present("exasol");
    map.insert("exasol-personal".into(), json!(launcher));
    map.insert("exasol-cloud".into(), json!(launcher));
    map.insert(
        "exapump".into(),
        json!(bin_present("exapump") || managed_exists(&app, "exapump", "exapump")),
    );
    map.insert(
        "mcp-server".into(),
        json!(uv_tool_installed("exasol-mcp-server") || bin_present("exasol-mcp-server")),
    );
    map.insert(
        "agent-skills".into(),
        json!(uv_tool_installed("exasol-agent-skills") || bin_present("exasol-install-skills")),
    );
    map.insert(
        "pyexasol".into(),
        json!(managed_exists(&app, "pyexasol", "venv") || python_import_ok("pyexasol")),
    );
    map.insert(
        "sqlalchemy-exasol".into(),
        json!(managed_exists(&app, "sqlalchemy-exasol", "venv") || python_import_ok("sqlalchemy_exasol")),
    );
    map.insert(
        "ai-lab".into(),
        json!(managed_exists(&app, "ai-lab", "venv") || python_import_ok("exasol.ai_lab")),
    );
    map.insert(
        "json-tables".into(),
        json!(managed_exists(&app, "json-tables", "venv") || managed_exists(&app, "json-tables", "src")),
    );
    map.insert("superset".into(), json!(managed_exists(&app, "superset", "venv")));
    Ok(Value::Object(map))
}

/// Reveal the marketplace folder path (so users can find downloads).
#[tauri::command]
pub fn market_dir_path(app: AppHandle) -> AppResult<String> {
    Ok(market_dir(&app)?.to_string_lossy().to_string())
}
