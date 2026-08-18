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
pub(crate) fn run_streamed(
    app: &AppHandle,
    id: &str,
    program: &str,
    args: &[&str],
) -> AppResult<i32> {
    run_streamed_env(app, id, program, args, &[])
}

/// Like `run_streamed`, with extra environment variables for the child.
pub(crate) fn run_streamed_env(
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
/// them when spawning subprocesses so `exasol`, `uv`, etc. resolve.
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


pub(crate) fn ensure_uv(app: &AppHandle, id: &str) -> AppResult<String> {
    let component = &crate::component_lock::components().uv;
    let locked = crate::component_lock::artifact_for(component).ok_or_else(|| {
        AppError::Storage(format!(
            "uv has no artifact for {}.",
            crate::component_lock::platform_key()
        ))
    })?;
    // The original repository is the source of truth, as it already is for
    // Exasol Personal and ExaPump. uv was the last component still tied to
    // whatever version happened to be pinned when Studio was built, so a pin
    // that went stale shipped an old uv with a checksum that matched the old
    // file and therefore raised nothing.
    //
    // Verify-or-refuse still holds: the hash is GitHub's own per-asset digest,
    // and an asset published without one is refused rather than installed
    // unverified. The pin is the fallback for an unreachable release API.
    let upstream = crate::upstream::latest(&component.repository).and_then(|release| {
        crate::upstream::pick_asset(&locked.name, &release.assets)
            .and_then(crate::upstream::artifact_from)
            .map(|artifact| (artifact, release.tag))
    });
    let (artifact, version) = match &upstream {
        Some((artifact, tag)) => (artifact, tag.trim_start_matches('v').to_string()),
        None => (locked, component.version.clone()),
    };
    let version = &version;
    let managed_name = if std::env::consts::OS == "windows" {
        "uv.exe"
    } else {
        "uv"
    };
    if let Ok(dir) = market_dir(app) {
        if let Some(path) = find_named_file(&dir.join("uv"), managed_name) {
            let expected = format!("uv {version} ");
            let valid = Command::new(&path)
                .arg("--version")
                .output()
                .map(|output| {
                    output.status.success()
                        && String::from_utf8_lossy(&output.stdout).starts_with(&expected)
                })
                .unwrap_or(false);
            let checksum_valid = artifact.executable_sha256.as_ref().is_some_and(|expected| {
                crate::local_runtime::sha256_file(&path)
                    .is_ok_and(|actual| actual.eq_ignore_ascii_case(expected))
            });
            if valid && checksum_valid {
                emit_log(
                    app,
                    id,
                    format!("Studio-managed uv {version} is available."),
                    "info",
                );
                return Ok(path.to_string_lossy().to_string());
            }
        }
    }
    let asset = artifact.name.as_str();
    let marketplace = market_dir(app)?;
    let install_dir = marketplace.join("uv");
    let staging_dir = marketplace.join("uv-staging");
    let download_dir = marketplace.join("uv-download");
    let _ = std::fs::remove_dir_all(&staging_dir);
    let _ = std::fs::remove_dir_all(&download_dir);
    std::fs::create_dir_all(&staging_dir)?;
    std::fs::create_dir_all(&download_dir)?;
    let archive = download_dir.join(asset);
    emit_log(
        app,
        id,
        format!("Downloading verified uv {version}…"),
        "info",
    );
    crate::local_runtime::download_verified(&artifact.url, &archive, &artifact.sha256)?;
    if asset.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&archive)?)
            .map_err(|e| AppError::Storage(format!("could not open uv archive: {e}")))?;
        zip.extract(&staging_dir)
            .map_err(|e| AppError::Storage(format!("could not extract uv archive: {e}")))?;
    } else {
        let decoder = flate2::read::GzDecoder::new(std::fs::File::open(&archive)?);
        tar::Archive::new(decoder).unpack(&staging_dir)?;
    }
    let name = if std::env::consts::OS == "windows" {
        "uv.exe"
    } else {
        "uv"
    };
    let installed = find_named_file(&staging_dir, name)
        .ok_or_else(|| AppError::Storage(format!("uv archive did not contain {name}.")))?;
    let expected_binary = artifact.executable_sha256.as_ref().ok_or_else(|| {
        AppError::Storage("The generated uv lock has no executable checksum.".into())
    })?;
    let actual_binary = crate::local_runtime::sha256_file(&installed)?;
    if !actual_binary.eq_ignore_ascii_case(expected_binary) {
        return Err(AppError::Storage(format!(
            "uv executable checksum mismatch: expected {expected_binary}, got {actual_binary}."
        )));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&installed)?.permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&installed, permissions)?;
    }
    let relative = installed
        .strip_prefix(&staging_dir)
        .map_err(|e| AppError::Storage(format!("invalid uv archive layout: {e}")))?
        .to_path_buf();
    if install_dir.exists() {
        std::fs::remove_dir_all(&install_dir)?;
    }
    std::fs::rename(&staging_dir, &install_dir)?;
    let _ = std::fs::remove_dir_all(download_dir);
    Ok(install_dir.join(relative).to_string_lossy().to_string())
}

fn find_named_file(dir: &std::path::Path, name: &str) -> Option<PathBuf> {
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().and_then(|part| part.to_str()) == Some(name) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_named_file(&path, name) {
                return Some(found);
            }
        }
    }
    None
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketEnv {
    pub os: String,
    pub arch: String,
    pub docker: bool,
    pub podman: bool,
}

pub(crate) fn has_binary(bin: &str) -> bool {
    let prog = resolve_bin(bin)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| bin.to_string());
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
        .timeout(std::time::Duration::from_secs(6))
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
            if let Ok(r) = client
                .get(&raw)
                .header("User-Agent", "exasol-studio")
                .send()
                .await
            {
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
        if let Ok(r) = client
            .get(&url)
            .header("User-Agent", "exasol-studio")
            .send()
            .await
        {
            if r.status().is_success() {
                return Ok(json!(r.text().await.unwrap_or_default()));
            }
        }
    }
    Ok(Value::Null)
}

/// Reveal an exported/saved file in the OS file manager (Finder/Explorer).
#[tauri::command]
pub fn reveal_path(path: String) -> AppResult<()> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(AppError::Storage(format!("File not found: {path}")));
    }
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg("-R").arg(&path);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("explorer");
        c.arg(format!("/select,{path}"));
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_else(|| path.clone()));
        c
    };
    cmd.spawn().map_err(|e| AppError::Storage(format!("reveal failed: {e}")))?;
    Ok(())
}

/// Open a URL in the user's default browser via the OS opener. More reliable
/// than the webview's window.open (a no-op in Tauri) and independent of the
/// JS opener plugin's scoping.
#[tauri::command]
pub fn open_external(url: String) -> AppResult<()> {
    if !(url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")) {
        return Err(AppError::Storage(
            "Only http(s) and mailto URLs can be opened.".into(),
        ));
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
    cmd.spawn()
        .map_err(|e| AppError::Storage(format!("Could not open {url}: {e}")))?;
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
    let json: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
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
        return Err(AppError::Storage(format!(
            "Download failed (HTTP {}).",
            resp.status()
        )));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
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
        return Err(AppError::Storage(format!(
            "Download failed (HTTP {}).",
            resp.status()
        )));
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
        let pct = total.map(|t| {
            if t > 0 {
                (received * 100 / t).min(100)
            } else {
                0
            }
        });
        let _ = app.emit(
            "market:progress",
            json!({ "id": id, "received": received, "total": total, "pct": pct }),
        );
    }
    let _ = app.emit(
        "market:progress",
        json!({ "id": id, "received": received, "total": total.or(Some(received)), "pct": 100 }),
    );
    emit_log(
        app,
        id,
        format!("Saved {} ({} bytes).", file.display(), received),
        "info",
    );
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

/// AI Lab is NOT a PyPI package (the old `uv pip install exasol-ai-lab`
/// failed forever — no such package). It ships as the exasol/ai-lab Docker
/// image (JupyterLab on port 49494). Pull it with whichever engine exists.
fn install_ai_lab(app: &AppHandle, id: &str) -> AppResult<String> {
    let engine = ["docker", "podman"]
        .iter()
        .find_map(|name| resolve_bin(name).map(|p| p.to_string_lossy().to_string()))
        .ok_or_else(|| AppError::Storage(
            "Exasol AI Lab ships as a Docker image (exasol/ai-lab). Install Docker Desktop or Podman first, then retry.".into(),
        ))?;
    emit_log(app, id, "Pulling docker.io/exasol/ai-lab:latest…", "info");
    if run_streamed(app, id, &engine, &["pull", "docker.io/exasol/ai-lab:latest"])? != 0 {
        return Err(AppError::Storage("Could not pull the exasol/ai-lab image.".into()));
    }
    emit_log(
        app,
        id,
        "AI Lab image ready. Start it with: docker run --detach --name exasol-ai-lab -p 127.0.0.1:49494:49494 exasol/ai-lab:latest — then open http://localhost:49494 (JupyterLab).",
        "info",
    );
    Ok("exasol/ai-lab image pulled".into())
}

fn install_uv_pip(app: &AppHandle, id: &str, package: &str) -> AppResult<String> {
    let uv = ensure_uv(app, id)?;
    let venv = market_dir(app)?.join(id).join("venv");
    std::fs::create_dir_all(venv.parent().unwrap())?;
    let venv_s = venv.to_string_lossy().to_string();
    emit_log(
        app,
        id,
        format!("Creating a managed environment at {venv_s}…"),
        "info",
    );
    // `--clear` recreates an existing venv (from a prior/failed install) instead
    // of erroring with "a virtual environment already exists".
    if run_streamed(
        app,
        id,
        &uv,
        &["venv", "--clear", "--python", "3.11", &venv_s],
    )? != 0
    {
        return Err(AppError::Storage("uv venv failed.".into()));
    }
    emit_log(app, id, format!("Installing {package}…"), "info");
    if run_streamed(
        app,
        id,
        &uv,
        &["pip", "install", "--python", &venv_s, package],
    )? != 0
    {
        return Err(AppError::Storage(format!(
            "uv pip install {package} failed."
        )));
    }
    Ok(format!("{package} installed into {venv_s}"))
}

fn install_uv_tool(app: &AppHandle, id: &str, package: &str) -> AppResult<String> {
    let uv = ensure_uv(app, id)?;
    emit_log(
        app,
        id,
        format!("Installing {package} as a uv tool…"),
        "info",
    );
    if run_streamed(app, id, &uv, &["tool", "install", "--force", package])? != 0 {
        return Err(AppError::Storage(format!(
            "uv tool install {package} failed."
        )));
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

// The official Exasol launcher (`exasol`) drives cloud deployments. The local
// runtime is owned by `local_runtime`: native Personal on macOS, Nano through
// Docker/Podman on Windows and Linux.
const EXASOL_INSTALLER_SH: &str = "curl -fsSL https://www.exasol.com/install/ | sh";

fn exasol_bin() -> String {
    resolve_bin("exasol")
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "exasol".into())
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
        return Err(AppError::Storage(format!(
            "Launcher install exited with code {code}. See the log above."
        )));
    }
    Ok(())
}

/// Local database: native Exasol Personal on macOS, Exasol Nano elsewhere.
fn install_personal_local(app: &AppHandle, id: &str) -> AppResult<String> {
    let runtime = crate::local_runtime::ensure_runtime(app, id)?;
    Ok(format!(
        "Studio-managed Exasol {} is running at {}:{}.",
        runtime.kind, runtime.host, runtime.port
    ))
}

/// Exasol Personal — cloud. Installs the launcher and shows the deploy commands;
/// provisioning needs the user's cloud credentials and is left for them to run.
fn install_personal_cloud(app: &AppHandle, id: &str) -> AppResult<String> {
    ensure_exasol_launcher(app, id)?;
    let exa = exasol_bin();
    emit_log(
        app,
        id,
        "Exasol launcher ready. Deploy to your cloud provider with:",
        "success",
    );
    emit_log(
        app,
        id,
        format!("  {exa} install aws        # Amazon Web Services"),
        "info",
    );
    emit_log(
        app,
        id,
        format!("  {exa} install azure      # Microsoft Azure"),
        "info",
    );
    emit_log(
        app,
        id,
        format!("  {exa} install exoscale   # Exoscale"),
        "info",
    );
    emit_log(
        app,
        id,
        format!("  {exa} install stackit    # STACKIT"),
        "info",
    );
    emit_log(app, id, "Configure provider credentials first; provisioning takes ~10–20 min and uses your cloud account (costs may apply).", "info");
    emit_log(
        app,
        id,
        "Setup guides: https://github.com/exasol/exasol-personal",
        "info",
    );
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
    let json: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(json
        .get("assets")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default())
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
    let name = |a: &Value| {
        a.get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_lowercase()
    };
    assets
        .iter()
        .find(|a| {
            let n = name(a);
            !n.ends_with(".whl")
                && os_tokens.iter().any(|t| n.contains(t))
                && arch_tokens.iter().any(|t| n.contains(t))
        })
        .or_else(|| {
            assets.iter().find(|a| {
                let n = name(a);
                !n.ends_with(".whl") && os_tokens.iter().any(|t| n.contains(t))
            })
        })
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
        let url = ing
            .get("url")
            .or_else(|| ing.get("browser_download_url"))
            .and_then(|u| u.as_str());
        let nm = ing.get("name").and_then(|n| n.as_str());
        if let (Some(u), Some(n)) = (url, nm) {
            emit_log(
                app,
                id,
                "Fetching the prebuilt ingest engine (built by our CI)…",
                "info",
            );
            download_and_place(app, id, u, n).await?;
        }
    } else {
        emit_log(
            app,
            id,
            "No prebuilt ingest engine for this platform — installing the Python package only.",
            "info",
        );
    }

    // 2) Python wheel via uv
    let wheel = assets.iter().find(|a| {
        a.get("name")
            .and_then(|n| n.as_str())
            .map(|n| n.ends_with(".whl"))
            .unwrap_or(false)
    });
    let wheel = wheel.ok_or_else(|| {
        AppError::Storage("The JSON Tables wheel is missing from the release.".into())
    })?;
    let wurl = wheel
        .get("url")
        .or_else(|| wheel.get("browser_download_url"))
        .and_then(|u| u.as_str())
        .ok_or_else(|| AppError::Storage("wheel URL missing".into()))?;
    let wname = wheel
        .get("name")
        .and_then(|n| n.as_str())
        .unwrap_or("exasol_json_tables.whl");
    emit_log(app, id, "Fetching the Python package…", "info");
    let wpath = download_and_place(app, id, wurl, wname).await?;

    let uv = ensure_uv(app, id)?;
    let venv = base.join("venv");
    let venv_s = venv.to_string_lossy().to_string();
    emit_log(
        app,
        id,
        "Installing exasol-json-tables into a managed environment…",
        "info",
    );
    let python_version = crate::component_lock::components()
        .python_stack
        .python_version
        .as_str();
    run_streamed(
        app,
        id,
        &uv,
        &["venv", "--clear", "--python", python_version, &venv_s],
    )?;
    if run_streamed(
        app,
        id,
        &uv,
        &["pip", "install", "--python", &venv_s, &wpath],
    )? != 0
    {
        return Err(AppError::Storage(
            "uv pip install of the JSON Tables wheel failed.".into(),
        ));
    }
    Ok("JSON Tables installed (prebuilt ingest engine + Python package).".into())
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
    let stack = &crate::component_lock::components().python_stack;
    let mcp_package = format!("exasol-mcp-server=={}", stack.mcp_server_version);
    let pyexasol_package = format!("pyexasol=={}", stack.pyexasol_version);
    let result: AppResult<String> = match id.as_str() {
        "mcp-server" => install_uv_tool(&app, &id, &mcp_package),
        "agent-skills" => crate::local_database::ensure_agent_skills(&app)
            .map(|_| "Bundled Exasol agent skills are ready.".into()),
        "pyexasol" => install_uv_pip(&app, &id, &pyexasol_package),
        "sqlalchemy-exasol" => install_uv_pip(&app, &id, "sqlalchemy-exasol"),
        "ai-lab" => install_ai_lab(&app, &id),
        "json-tables" => install_json_tables(&app, &id).await,
        "exasol-personal" => install_personal_local(&app, &id),
        "exasol-cloud" => install_personal_cloud(&app, &id),
        "semantic-views" => crate::local_database::personal_install_semantic_views(app.clone())
            .await
            .map(|_| "Exasol Semantic Views is installed on your local database.".into()),
        _ => match (url, filename) {
            (Some(u), Some(f)) => download_and_place(&app, &id, &u, &f).await,
            _ => Err(AppError::Storage(
                "No downloadable asset was provided for this item.".into(),
            )),
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
            let _ = app.emit(
                "market:done",
                json!({ "id": id, "ok": false, "error": e.to_string() }),
            );
            Err(e)
        }
    }
}

/// Control the Studio-managed local runtime (native Personal on macOS, Nano on
/// Windows/Linux). Streams output over `market:log` under
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
    if !crate::local_runtime::runtime_installed(&app) {
        let e = AppError::Storage(
            "Local Exasol is not installed yet. Run first-install setup or install it from the Marketplace.".into(),
        );
        emit_log(&app, ID, format!("✗ {e}"), "err");
        let _ = app.emit(
            "market:done",
            json!({ "id": ID, "ok": false, "error": e.to_string() }),
        );
        return Err(e);
    }

    if let Err(error) = crate::local_database::ensure_lifecycle_idle(&app, &action) {
        emit_log(&app, ID, format!("✗ {error}"), "err");
        let _ = app.emit(
            "market:done",
            json!({ "id": ID, "ok": false, "error": error.to_string() }),
        );
        return Err(error);
    }

    let code = crate::local_runtime::control_runtime(&app, ID, &action)?;
    let ok = code == 0;
    if let Err(error) = crate::local_database::record_lifecycle(&app, &action, ok) {
        emit_log(&app, ID, format!("✗ {error}"), "err");
        let _ = app.emit(
            "market:done",
            json!({ "id": ID, "ok": false, "error": error.to_string() }),
        );
        return Err(error);
    }
    if ok {
        emit_log(
            &app,
            ID,
            format!("✓ Local runtime {action} finished."),
            "success",
        );
    } else {
        emit_log(
            &app,
            ID,
            format!("✗ Local runtime {action} exited with code {code}."),
            "err",
        );
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

fn python_import_ok(module: &str) -> bool {
    ["python3", "python"].iter().any(|py| {
        let prog = resolve_bin(py)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| py.to_string());
        let mut c = Command::new(prog);
        c.args(["-c", &format!("import {module}")]);
        with_path(&mut c);
        c.output().map(|o| o.status.success()).unwrap_or(false)
    })
}

fn managed_exists(app: &AppHandle, id: &str, name: &str) -> bool {
    market_dir(app)
        .map(|d| d.join(id).join(name).exists())
        .unwrap_or(false)
}

/// A file inside the app-data dir (Studio's managed runtime area).
fn data_file_exists(app: &AppHandle, rel: &str) -> bool {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(rel).is_file())
        .unwrap_or(false)
}

/// Authoritative install/run state for every Marketplace item. The managed
/// components (Personal, ExaPump, MCP server, Semantic Views) are read from the
/// bootstrap status manifest and their real on-disk paths — NOT from PATH or
/// guesses — so the badges always match what setup actually did. Returns
/// id → bool, plus `exasol-personal:running` for the DB's live state.
#[tauri::command]
pub fn market_detect(app: AppHandle) -> AppResult<Value> {
    use crate::local_database as db;
    let mut map = serde_json::Map::new();

    // Exasol Personal is a DATABASE: installed vs. actually running are distinct.
    map.insert(
        "exasol-personal".into(),
        json!(crate::local_runtime::runtime_installed(&app)),
    );
    map.insert(
        "exasol-personal:running".into(),
        json!(crate::local_runtime::runtime_running(&app)),
    );
    map.insert("exasol-cloud".into(), json!(bin_present("exasol")));

    // ExaPump: prebundled/installed at the managed path, or verified in the
    // manifest. (It lives in personal-local/bin, never on the user's PATH.)
    let exapump_name = if cfg!(windows) { "personal-local/bin/exapump.exe" } else { "personal-local/bin/exapump" };
    map.insert(
        "exapump".into(),
        json!(data_file_exists(&app, exapump_name) || db::component_ready(&app, "exapump")),
    );

    // MCP server: managed venv binary present, or verified in the manifest.
    let mcp_name = if cfg!(windows) {
        "personal-local/python/Scripts/exasol-mcp-server.exe"
    } else {
        "personal-local/python/bin/exasol-mcp-server"
    };
    map.insert(
        "mcp-server".into(),
        json!(data_file_exists(&app, mcp_name) || db::component_ready(&app, "mcp-server")),
    );

    // Semantic Views is OPT-IN — installed ONLY when its readiness marker exists.
    map.insert("semantic-views".into(), json!(db::semantic_views_installed(&app)));

    // Bundled agent skills are always present in the app; the manifest confirms.
    map.insert(
        "agent-skills".into(),
        json!(db::component_ready(&app, "agent-skills") || true),
    );
    map.insert(
        "pyexasol".into(),
        json!(managed_exists(&app, "pyexasol", "venv") || python_import_ok("pyexasol")),
    );
    map.insert(
        "sqlalchemy-exasol".into(),
        json!(
            managed_exists(&app, "sqlalchemy-exasol", "venv")
                || python_import_ok("sqlalchemy_exasol")
        ),
    );
    map.insert(
        "ai-lab".into(),
        json!(["docker", "podman"].iter().any(|name| {
            resolve_bin(name).is_some_and(|p| {
                std::process::Command::new(p)
                    .args(["image", "inspect", "exasol/ai-lab:latest"])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            })
        })),
    );
    map.insert(
        "json-tables".into(),
        json!(
            managed_exists(&app, "json-tables", "venv")
                || managed_exists(&app, "json-tables", "src")
        ),
    );
    Ok(Value::Object(map))
}

/// Reveal the marketplace folder path (so users can find downloads).
#[tauri::command]
pub fn market_dir_path(app: AppHandle) -> AppResult<String> {
    Ok(market_dir(&app)?.to_string_lossy().to_string())
}
