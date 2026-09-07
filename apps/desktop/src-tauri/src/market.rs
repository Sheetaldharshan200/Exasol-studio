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
            let checksum_valid = artifact.executable_sha256.as_ref().map_or(true, |expected| {
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
    // The inner-executable pin only exists in the committed lock; a
    // live-resolved release is already verified by GitHub's per-asset digest
    // on the archive, and no inner pin CAN exist for it — verify when pinned,
    // never refuse the digest-verified live release.
    match artifact.executable_sha256.as_ref() {
        Some(expected_binary) => {
            let actual_binary = crate::local_runtime::sha256_file(&installed)?;
            if !actual_binary.eq_ignore_ascii_case(expected_binary) {
                return Err(AppError::Storage(format!(
                    "uv executable checksum mismatch: expected {expected_binary}, got {actual_binary}."
                )));
            }
        }
        None => emit_log(
            app,
            id,
            "Archive verified via GitHub's asset digest (live release — no inner-executable pin).",
            "info",
        ),
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

/// GitHub metadata (repo name, About/description, homepage) for the requested
/// repos, so marketplace cards render exactly what the official repo shows.
/// Disk-cached for 24h; on fetch failure the last-known entry is kept, so the
/// marketplace stays populated offline and under API rate limits.
#[tauri::command]
pub async fn market_repo_meta(app: AppHandle, repos: Vec<String>) -> AppResult<Value> {
    fn valid_repo(r: &str) -> bool {
        let mut parts = r.split('/');
        let ok = |s: &str| {
            !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        };
        matches!((parts.next(), parts.next(), parts.next()), (Some(o), Some(n), None) if ok(o) && ok(n))
    }
    let cache_path = market_dir(&app)?.join("repo-meta.json");
    let cached: Value = std::fs::read_to_string(&cache_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let fetched_at = cached.get("fetchedAt").and_then(|v| v.as_u64()).unwrap_or(0);
    let mut entries = cached
        .get("repos")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let fresh = now.saturating_sub(fetched_at) < 24 * 3600;
    let wanted: Vec<String> = repos.into_iter().filter(|r| valid_repo(r)).collect();
    if !(fresh && wanted.iter().all(|r| entries.contains_key(r))) {
        let client = reqwest::Client::new();
        let fetches = wanted.iter().map(|repo| {
            let client = client.clone();
            let url = format!("https://api.github.com/repos/{repo}");
            async move {
                let resp = client
                    .get(&url)
                    .header("User-Agent", "exasol-studio")
                    .header("Accept", "application/vnd.github+json")
                    .timeout(std::time::Duration::from_secs(6))
                    .send()
                    .await
                    .ok()?;
                if !resp.status().is_success() {
                    return None;
                }
                let v: Value = resp.json().await.ok()?;
                Some(json!({
                    "name": v.get("name"),
                    "description": v.get("description"),
                    "htmlUrl": v.get("html_url"),
                }))
            }
        });
        let results = futures_util::future::join_all(fetches).await;
        for (repo, meta) in wanted.iter().zip(results) {
            // Failure keeps the previous cached entry rather than erasing it.
            if let Some(m) = meta {
                entries.insert(repo.clone(), m);
            }
        }
        let _ = std::fs::write(
            &cache_path,
            serde_json::to_string(&json!({ "fetchedAt": now, "repos": entries })).unwrap_or_default(),
        );
    }
    let out: serde_json::Map<String, Value> = wanted
        .iter()
        .filter_map(|r| entries.get(r).map(|m| (r.clone(), m.clone())))
        .collect();
    Ok(Value::Object(out))
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

/// Latest GitHub release for a repo ("owner/name") — or, with `tag`, that
/// specific release (so any version can be installed, not just the newest);
/// null when none exist.
#[tauri::command]
pub async fn market_release(app: AppHandle, repo: String, tag: Option<String>) -> AppResult<Value> {
    // The tag becomes a URL path segment — refuse anything path-like.
    if let Some(t) = &tag {
        if !valid_version_tag(t) {
            return Err(AppError::Storage(format!("Invalid release tag: {t}")));
        }
    }
    // 1h disk cache per repo: the marketplace asks for ~17 repos per open and
    // unauthenticated GitHub rate-limits at 60 req/h per IP — without a cache
    // the live "latest" labels 403 into nothing on any busy machine. A failed
    // fetch serves the last-known value instead of erasing it. Tagged releases
    // are immutable, so their cache entries never really go stale.
    let cache_key = match &tag {
        Some(t) => format!("{repo}@{t}"),
        None => repo.clone(),
    };
    let cache_path = market_dir(&app)?.join("release-cache.json");
    let mut cache: serde_json::Map<String, Value> = std::fs::read_to_string(&cache_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Some(entry) = cache.get(&cache_key) {
        let at = entry.get("at").and_then(|v| v.as_u64()).unwrap_or(0);
        if now.saturating_sub(at) < 3600 {
            return Ok(entry.get("value").cloned().unwrap_or(Value::Null));
        }
    }
    let cached_value = cache.get(&cache_key).and_then(|e| e.get("value")).cloned();
    let store = |cache: &mut serde_json::Map<String, Value>, value: &Value| {
        cache.insert(cache_key.clone(), json!({ "at": now, "value": value }));
        let _ = std::fs::write(&cache_path, serde_json::to_string(cache).unwrap_or_default());
    };
    let url = match &tag {
        Some(t) => format!("https://api.github.com/repos/{repo}/releases/tags/{t}"),
        None => format!("https://api.github.com/repos/{repo}/releases/latest"),
    };
    let client = reqwest::Client::new();
    let resp = match client
        .get(&url)
        .header("User-Agent", "exasol-studio")
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Ok(cached_value.unwrap_or(Value::Null)),
    };
    if !resp.status().is_success() {
        // 404 = repo has no releases (a real answer — cache it as null);
        // 403 = rate limit (serve the last-known value, don't overwrite).
        if resp.status().as_u16() == 404 {
            store(&mut cache, &Value::Null);
            return Ok(Value::Null);
        }
        return Ok(cached_value.unwrap_or(Value::Null));
    }
    let json: Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => return Ok(cached_value.unwrap_or(Value::Null)),
    };
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
    let value = json!({
        "tag": json.get("tag_name"),
        "name": json.get("name"),
        "publishedAt": json.get("published_at"),
        "htmlUrl": json.get("html_url"),
        "assets": assets,
    });
    store(&mut cache, &value);
    Ok(value)
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
    download_and_place_inner(app, id, url, filename, true).await
}

async fn download_and_place_inner(
    app: &AppHandle,
    id: &str,
    url: &str,
    filename: &str,
    auto_extract: bool,
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
    // ZERO-manual-step rule: a saved archive is not "usable" — extract it here
    // and put extracted CLI binaries on Studio's PATH. Files external tools
    // consume as-is (.taco, .jar, .whl) are deliberately kept untouched.
    // Callers that must checksum-verify FIRST (the Exasol downloads portal)
    // use download_only + call auto_extract_and_link after the verify.
    if auto_extract {
        auto_extract_and_link(app, id, &file);
    }
    Ok(file.to_string_lossy().to_string())
}

/// download_and_place without the auto-extract step — for artifacts that must
/// be checksum-verified before anything derived from them exists.
async fn download_only(app: &AppHandle, id: &str, url: &str, filename: &str) -> AppResult<String> {
    download_and_place_inner(app, id, url, filename, false).await
}

/// Which archives get auto-extracted; pure so the routing is unit-tested.
/// None = keep the file as-is (either not an archive, or a file an external
/// tool consumes whole).
fn archive_kind(filename: &str) -> Option<&'static str> {
    let name = filename.to_ascii_lowercase();
    if [".taco", ".jar", ".whl", ".nupkg"].iter().any(|s| name.ends_with(s)) {
        return None;
    }
    if name.ends_with(".tar.gz") || name.ends_with(".tgz") || name.ends_with(".crate") {
        Some("tar")
    } else if name.ends_with(".zip") {
        Some("zip")
    } else {
        None
    }
}

/// File extensions that are never CLI entry points — they stay in the
/// unpacked tree but are not linked onto the PATH.
fn non_binary_extension(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [
        ".sh", ".bat", ".ps1", ".so", ".dylib", ".dll", ".a", ".h", ".c", ".py", ".txt", ".md",
        ".json", ".yml", ".yaml", ".toml", ".html", ".css", ".js", ".ts", ".go", ".rs", ".r",
        ".sql", ".mod", ".sum", ".gz", ".zip", ".sig", ".pem", ".crt", ".plist", ".conf",
    ]
    .iter()
    .any(|ext| lower.ends_with(ext))
}

fn extract_tar_gz(archive: &std::path::Path, dest: &std::path::Path) -> AppResult<()> {
    let decoder = flate2::read::GzDecoder::new(std::fs::File::open(archive)?);
    tar::Archive::new(decoder)
        .unpack(dest)
        .map_err(|e| AppError::Storage(format!("extract: {e}")))
}

/// Structure-preserving zip extraction (engine.rs's extractor flattens on
/// purpose — wrong for source trees). Entry paths are sanitized via
/// enclosed_name; unix modes are preserved.
fn extract_zip_tree(archive: &std::path::Path, dest: &std::path::Path) -> AppResult<()> {
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| AppError::Storage(format!("zip open: {e}")))?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| AppError::Storage(format!("zip entry: {e}")))?;
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else { continue };
        let target = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&target)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&target)?;
        std::io::copy(&mut entry, &mut out)?;
        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(mode));
        }
    }
    Ok(())
}

/// Names an extracted binary must NEVER take on the PATH: personal-local/bin
/// is PREPENDED for the terminal and the AI agent, so these would shadow the
/// user's real tools.
fn shadowable_tool_name(name: &str) -> bool {
    [
        "sh", "bash", "zsh", "env", "sudo", "git", "docker", "podman", "colima", "python",
        "python3", "pip", "pip3", "node", "npm", "npx", "uv", "uvx", "brew", "cargo", "rustc",
        "go", "java", "terraform", "exasol", "exapump", "ls", "cat", "rm", "cp", "mv", "curl",
        "wget", "make", "cc", "gcc", "clang",
    ]
    .contains(&name.to_ascii_lowercase().as_str())
}

#[cfg(unix)]
fn link_executables(dir: &std::path::Path, root: &std::path::Path, bin_dir: &std::path::Path, depth: u8, linked: &mut Vec<String>) {
    use std::os::unix::fs::PermissionsExt;
    if depth > 4 || linked.len() >= 5 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let Ok(root_canonical) = root.canonicalize() else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        // NEVER follow symlinks — a tar entry can symlink outside the unpack
        // dir, and following it would walk (and link!) foreign files.
        let Ok(meta) = std::fs::symlink_metadata(&path) else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            link_executables(&path, root, bin_dir, depth + 1, linked);
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else { continue };
        if non_binary_extension(name) || shadowable_tool_name(name) {
            continue;
        }
        let executable = meta.is_file() && meta.permissions().mode() & 0o111 != 0 && meta.len() > 0;
        if !executable {
            continue;
        }
        // Belt and suspenders: the real file must live under the unpack dir.
        if !path.canonicalize().map(|p| p.starts_with(&root_canonical)).unwrap_or(false) {
            continue;
        }
        let link = bin_dir.join(name);
        // Replace only prior symlinks — a REAL file here is a managed binary
        // (exapump lives in this dir) and must never be shadowed.
        match std::fs::symlink_metadata(&link) {
            Ok(link_meta) if !link_meta.file_type().is_symlink() => continue,
            Ok(_) => {
                let _ = std::fs::remove_file(&link);
            }
            Err(_) => {}
        }
        if std::os::unix::fs::symlink(&path, &link).is_ok() {
            linked.push(name.to_string());
            if linked.len() >= 5 {
                return;
            }
        }
    }
}

/// First file under `dir` (depth-limited) whose name matches.
fn find_file(dir: &std::path::Path, depth: u8, matches: &dyn Fn(&str) -> bool) -> Option<PathBuf> {
    if depth > 4 {
        return None;
    }
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_file(&path, depth + 1, matches) {
                return Some(found);
            }
        } else if path.file_name().and_then(|s| s.to_str()).is_some_and(matches) {
            return Some(path);
        }
    }
    None
}

pub(crate) fn auto_extract_and_link(app: &AppHandle, id: &str, archive: &std::path::Path) {
    let name = archive.file_name().and_then(|s| s.to_str()).unwrap_or("");
    let Some(kind) = archive_kind(name) else { return };
    let Some(dir) = archive.parent().map(|p| p.join("unpacked")) else { return };
    let _ = std::fs::remove_dir_all(&dir);
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let extracted = match kind {
        "tar" => extract_tar_gz(archive, &dir),
        _ => extract_zip_tree(archive, &dir),
    };
    if let Err(e) = extracted {
        emit_log(app, id, format!("Could not extract the archive ({e}) — the download is kept as-is."), "err");
        let _ = std::fs::remove_dir_all(&dir);
        return;
    }
    emit_log(app, id, format!("Extracted to {}.", dir.display()), "info");
    #[cfg(unix)]
    {
        let bin_dir = app
            .state::<crate::state::AppState>()
            .data_dir
            .join("personal-local")
            .join("bin");
        if std::fs::create_dir_all(&bin_dir).is_ok() {
            let mut linked: Vec<String> = Vec::new();
            link_executables(&dir, &dir, &bin_dir, 0, &mut linked);
            if !linked.is_empty() {
                emit_log(
                    app,
                    id,
                    format!("Ready on Studio's PATH (terminal + AI agent): {}.", linked.join(", ")),
                    "info",
                );
            }
        }
    }
}

/// AI Lab is NOT a PyPI package (the old `uv pip install exasol-ai-lab`
/// failed forever — no such package). It ships as the exasol/ai-lab Docker
/// image (JupyterLab on port 49494). Pull the requested tag (default latest)
/// with whichever engine exists.
fn install_ai_lab(app: &AppHandle, id: &str, tag: Option<&str>) -> AppResult<String> {
    // Zero prerequisites: bring a container engine up ourselves (start a
    // stopped one, or install Colima headlessly on macOS) — never dead-end on
    // "install Docker first". Podman is honored when it's what the user runs.
    let engine = match crate::community_db::ensure_engine_ready(app, id) {
        Ok(bin) => bin,
        Err(engine_error) => resolve_bin("podman")
            .map(|p| p.to_string_lossy().to_string())
            .ok_or(engine_error)?,
    };
    let tag = tag.unwrap_or("latest");
    // Docker's tag grammar is stricter than the generic version validation.
    if !valid_docker_tag(tag) {
        return Err(AppError::Storage(format!("Invalid AI Lab image tag: {tag}")));
    }
    let image = format!("docker.io/exasol/ai-lab:{tag}");
    emit_log(app, id, format!("Pulling {image}…"), "info");
    if run_streamed(app, id, &engine, &["pull", &image])? != 0 {
        return Err(AppError::Storage(format!("Could not pull the exasol/ai-lab:{tag} image.")));
    }
    emit_log(
        app,
        id,
        format!("AI Lab image ready. Start it with: docker run --detach --name exasol-ai-lab -p 127.0.0.1:49494:49494 exasol/ai-lab:{tag} — then open http://localhost:49494 (JupyterLab)."),
        "info",
    );
    Ok(format!("exasol/ai-lab:{tag} image pulled"))
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

/// A version/tag string safe to embed in a URL path segment or a `pkg==v`
/// spec — never anything path- or option-like. Pure so it's unit-tested.
/// Shared with update_component, which embeds versions the same two ways.
pub(crate) fn valid_version_tag(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 100
        // Never option-like, and never dot-segment-like: a bare "." or ".."
        // used as a URL path segment normalizes OUT of the intended endpoint.
        && !v.starts_with('-')
        && !v.starts_with('.')
        && v.chars().all(|c| c.is_ascii_alphanumeric() || ".-_+".contains(c))
}

/// The `<latest>` version from a Maven Central maven-metadata.xml. Pure so the
/// parsing rules are unit-tested — a full XML parser is overkill for one tag.
fn maven_latest_version(xml: &str) -> Option<String> {
    let start = xml.find("<latest>")? + "<latest>".len();
    let end = xml[start..].find("</latest>")? + start;
    let v = xml[start..end].trim();
    if !valid_version_tag(v) {
        return None;
    }
    Some(v.to_string())
}

/// Every `<version>` from a Maven Central maven-metadata.xml — the file lists
/// oldest first, returned newest first. Pure so it's unit-tested.
fn maven_all_versions(xml: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<version>") {
        rest = &rest[start + "<version>".len()..];
        let Some(end) = rest.find("</version>") else { break };
        let v = rest[..end].trim();
        if valid_version_tag(v) {
            out.push(v.to_string());
        }
        rest = &rest[end..];
    }
    out.reverse();
    out
}

/// Sort version strings newest first by numeric segments ("2.0.10" above
/// "2.0.9"). A version with trailing non-numeric content ("1.0.dev1",
/// "2.0-rc1") sorts BELOW the plain release with the same numeric prefix —
/// the pre-release convention — with plain string order as the last resort.
/// Pure so it's unit-tested.
fn sort_versions_desc(mut versions: Vec<String>) -> Vec<String> {
    fn key(v: &str) -> (Vec<u64>, bool, String) {
        let segments: Vec<&str> = v
            .trim_start_matches(['v', 'V'])
            .split(|c: char| c == '.' || c == '-' || c == '+')
            .collect();
        let numeric: Vec<u64> = segments.iter().map_while(|p| p.parse::<u64>().ok()).collect();
        // true = a final release (every segment numeric) — ranks above a
        // pre-release with the same numeric prefix when sorted descending.
        let is_final = numeric.len() == segments.len();
        (numeric, is_final, v.to_string())
    }
    versions.sort_by(|a, b| key(b).cmp(&key(a)));
    versions
}

/// The last-known latest release tag for a repo, from market_release's disk
/// cache — enough to keep a version dropdown useful (one entry: the newest)
/// when the API is rate-limited before any full list was ever fetched.
fn latest_tag_from_release_cache(app: &AppHandle, repo: &str) -> Option<String> {
    let path = market_dir(app).ok()?.join("release-cache.json");
    let cache: Value = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    let tag = cache.get(repo)?.get("value")?.get("tag")?.as_str()?;
    if valid_version_tag(tag) { Some(tag.to_string()) } else { None }
}

/// Merge one entry into the versions cache under a process-wide lock, writing
/// via temp file + rename — concurrent version fetches (several dropdowns
/// opened quickly) must not lose each other's entries or expose a torn file.
fn merge_versions_cache(cache_path: &std::path::Path, key: &str, entry: Value) {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut cache: serde_json::Map<String, Value> = std::fs::read_to_string(cache_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    cache.insert(key.into(), entry);
    let tmp = cache_path.with_extension("json.partial");
    if std::fs::write(&tmp, serde_json::to_string(&cache).unwrap_or_default()).is_ok() {
        let _ = std::fs::rename(&tmp, cache_path);
    }
}

/// A Docker image tag per Docker's own grammar — stricter than
/// `valid_version_tag` (no `+`, must not start with `.` or `-`).
fn valid_docker_tag(v: &str) -> bool {
    let mut chars = v.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphanumeric() || c == '_')
        && v.len() <= 128
        && chars.all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
}

/// Live version list for an item, so ANY version can be installed — not just
/// the newest. `source` is "github" (release tags of `reference` = owner/repo,
/// disk-cached 1h — the unauthenticated API rate-limits at 60/hr), "pypi"
/// (release versions of `reference` = package name), "dockerhub" (image tags
/// of `reference` = org/repo), or "maven-exasol-jdbc" (Maven Central;
/// `reference` ignored). Newest first.
#[tauri::command]
pub async fn market_versions(app: AppHandle, source: String, reference: String) -> AppResult<Vec<String>> {
    fn ok_segment(s: &str) -> bool {
        !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    }
    fn ok_repo(reference: &str) -> bool {
        let mut parts = reference.split('/');
        matches!(
            (parts.next(), parts.next(), parts.next()),
            (Some(o), Some(n), None) if ok_segment(o) && ok_segment(n)
        )
    }
    let client = reqwest::Client::new();
    let timeout = std::time::Duration::from_secs(8);
    let list: Vec<String> = match source.as_str() {
        "github" => {
            if !ok_repo(&reference) {
                return Err(AppError::Storage("Invalid repository.".into()));
            }
            // Industry-standard rate-limit handling, in order:
            //   1. fresh disk cache (1h) — no request at all;
            //   2. ETag revalidation — a 304 answer does NOT count against
            //      GitHub's unauthenticated 60/hr limit, so refreshes are free
            //      once a list has been fetched once;
            //   3. stale cache over any error — old truth beats none;
            //   4. the release cache's known latest tag as a one-entry list —
            //      the dropdown still offers the newest version;
            //   5. only then an error.
            let cache_path = market_dir(&app)?.join("versions-cache.json");
            let cache: serde_json::Map<String, Value> = std::fs::read_to_string(&cache_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let entry = cache.get(&reference);
            let cached_list = entry.and_then(|e| e.get("list")).and_then(Value::as_array).map(|list| {
                list.iter().filter_map(Value::as_str).map(str::to_string).collect::<Vec<_>>()
            });
            let cached_at = entry.and_then(|e| e.get("at")).and_then(Value::as_u64).unwrap_or(0);
            let cached_etag = entry.and_then(|e| e.get("etag")).and_then(Value::as_str).map(str::to_string);
            // A future timestamp (clock rollback, corrupted entry) is not
            // "fresh forever" — only a real past-hour entry counts.
            if let Some(list) = &cached_list {
                if cached_at <= now && now - cached_at < 3600 {
                    return Ok(list.clone());
                }
            }
            let mut request = client
                .get(format!("https://api.github.com/repos/{reference}/releases?per_page=30"))
                .header("User-Agent", "exasol-studio")
                .header("Accept", "application/vnd.github+json")
                .timeout(timeout);
            if let (Some(etag), Some(_)) = (&cached_etag, &cached_list) {
                request = request.header("If-None-Match", etag.as_str());
            }
            let fetched = request.send().await.map_err(|e| AppError::Storage(e.to_string()));
            let response = match fetched {
                Ok(r) if r.status() == reqwest::StatusCode::NOT_MODIFIED => {
                    // Unchanged upstream: re-stamp freshness, serve the cache.
                    if let Some(list) = cached_list {
                        merge_versions_cache(
                            &cache_path,
                            &reference,
                            json!({ "at": now, "etag": cached_etag, "list": list.clone() }),
                        );
                        return Ok(list);
                    }
                    return Err(AppError::Storage("GitHub answered 304 with no local cache.".into()));
                }
                Ok(r) => r.error_for_status().map_err(|e| AppError::Storage(format!("GitHub: {e}"))),
                Err(e) => Err(e),
            };
            let response = match response {
                Ok(r) => r,
                Err(e) => {
                    if let Some(list) = cached_list {
                        return Ok(list); // stale cache over an error
                    }
                    // Never fetched before AND rate-limited/offline: the
                    // release cache usually knows the latest tag — a one-entry
                    // list beats an error message.
                    if let Some(tag) = latest_tag_from_release_cache(&app, &reference) {
                        return Ok(vec![tag]);
                    }
                    return Err(e);
                }
            };
            let etag = response
                .headers()
                .get(reqwest::header::ETAG)
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            let body: Value = response.json().await.map_err(|e| AppError::Storage(e.to_string()))?;
            // GitHub already lists newest first.
            let list: Vec<String> = body
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter(|r| !r.get("draft").and_then(Value::as_bool).unwrap_or(false))
                        .filter_map(|r| r.get("tag_name").and_then(Value::as_str))
                        .filter(|t| valid_version_tag(t))
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();
            merge_versions_cache(&cache_path, &reference, json!({ "at": now, "etag": etag, "list": list }));
            list
        }
        "dockerhub" => {
            if !ok_repo(&reference) {
                return Err(AppError::Storage("Invalid image repository.".into()));
            }
            // Follow pagination (bounded) — releases past the first page must
            // not silently vanish from the dropdown.
            let mut names: Vec<String> = Vec::new();
            let mut url = format!("https://hub.docker.com/v2/repositories/{reference}/tags?page_size=100");
            for _ in 0..4 {
                let body: Value = client
                    .get(&url)
                    .header("User-Agent", "exasol-studio")
                    .timeout(timeout)
                    .send()
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| AppError::Storage(format!("Docker Hub: {e}")))?
                    .json()
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                // A 200 without `results` is a schema surprise, not "no tags".
                let page = body
                    .get("results")
                    .and_then(Value::as_array)
                    .ok_or_else(|| AppError::Storage("Docker Hub returned an unexpected tag listing.".into()))?;
                names.extend(page.iter().filter_map(|t| t.get("name").and_then(Value::as_str)).map(str::to_string));
                match body.get("next").and_then(Value::as_str) {
                    // Only follow Docker Hub's own pagination links.
                    Some(next) if next.starts_with("https://hub.docker.com/") => url = next.to_string(),
                    _ => break,
                }
            }
            crate::community_db::version_tags(names)
        }
        "pypi" => {
            if !ok_segment(&reference) {
                return Err(AppError::Storage("Invalid package name.".into()));
            }
            let body: Value = client
                .get(format!("https://pypi.org/pypi/{reference}/json"))
                .header("User-Agent", "exasol-studio")
                .timeout(timeout)
                .send()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?
                .error_for_status()
                .map_err(|e| AppError::Storage(format!("PyPI: {e}")))?
                .json()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let versions: Vec<String> = body
                .get("releases")
                .and_then(Value::as_object)
                .map(|releases| {
                    releases
                        .iter()
                        // Skip versions with no files (never uploaded) and
                        // versions whose EVERY file is yanked — pip would
                        // refuse or warn on those, so offering them only
                        // fails the install.
                        .filter(|(v, files)| {
                            valid_version_tag(v)
                                && files.as_array().is_some_and(|f| {
                                    f.iter().any(|file| !file.get("yanked").and_then(Value::as_bool).unwrap_or(false))
                                })
                        })
                        .map(|(v, _)| v.clone())
                        .collect()
                })
                .unwrap_or_default();
            sort_versions_desc(versions)
        }
        "npm" => {
            // Scoped names ("@exasol/pkg") — validate, then encode the slash.
            if reference.is_empty()
                || !reference.chars().all(|c| c.is_ascii_alphanumeric() || "@/._-".contains(c))
            {
                return Err(AppError::Storage("Invalid npm package name.".into()));
            }
            let encoded = reference.replace('/', "%2F");
            let body: Value = client
                .get(format!("https://registry.npmjs.org/{encoded}"))
                .header("User-Agent", "exasol-studio")
                .timeout(timeout)
                .send()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?
                .error_for_status()
                .map_err(|e| AppError::Storage(format!("npm: {e}")))?
                .json()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let versions: Vec<String> = body
                .get("versions")
                .and_then(Value::as_object)
                .ok_or_else(|| AppError::Storage("npm returned an unexpected package listing.".into()))?
                .keys()
                .filter(|v| valid_version_tag(v))
                .cloned()
                .collect();
            sort_versions_desc(versions)
        }
        "goproxy" => {
            if reference.is_empty()
                || !reference.chars().all(|c| c.is_ascii_alphanumeric() || "./_-".contains(c))
            {
                return Err(AppError::Storage("Invalid Go module path.".into()));
            }
            let text = client
                .get(format!("https://proxy.golang.org/{reference}/@v/list"))
                .header("User-Agent", "exasol-studio")
                .timeout(timeout)
                .send()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?
                .error_for_status()
                .map_err(|e| AppError::Storage(format!("Go proxy: {e}")))?
                .text()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
            sort_versions_desc(
                text.lines().map(str::trim).filter(|v| valid_version_tag(v)).map(str::to_string).collect(),
            )
        }
        "crates" => {
            if !ok_segment(&reference) {
                return Err(AppError::Storage("Invalid crate name.".into()));
            }
            let body: Value = client
                .get(format!("https://crates.io/api/v1/crates/{reference}"))
                .header("User-Agent", "exasol-studio")
                .timeout(timeout)
                .send()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?
                .error_for_status()
                .map_err(|e| AppError::Storage(format!("crates.io: {e}")))?
                .json()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let versions: Vec<String> = body
                .get("versions")
                .and_then(Value::as_array)
                .ok_or_else(|| AppError::Storage("crates.io returned an unexpected listing.".into()))?
                .iter()
                .filter(|v| !v.get("yanked").and_then(Value::as_bool).unwrap_or(false))
                .filter_map(|v| v.get("num").and_then(Value::as_str))
                .filter(|v| valid_version_tag(v))
                .map(str::to_string)
                .collect();
            sort_versions_desc(versions)
        }
        "exasol-downloads" => {
            // The official Exasol downloads portal index — versions for THIS
            // platform only (offering a Linux-only build on macOS would be a
            // guaranteed-failing install).
            if !matches!(reference.as_str(), "ODBC" | "ADO.NET") {
                return Err(AppError::Storage("Unknown Exasol downloads artifact.".into()));
            }
            let index = exasol_downloads_index().await?;
            portal_artifacts(&index, &reference, std::env::consts::OS, std::env::consts::ARCH)
                .into_iter()
                .map(|a| a.version)
                .collect()
        }
        "maven-exasol-jdbc" => {
            let xml = client
                .get("https://repo1.maven.org/maven2/com/exasol/exasol-jdbc/maven-metadata.xml")
                .header("User-Agent", "exasol-studio")
                .timeout(timeout)
                .send()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?
                .error_for_status()
                .map_err(|e| AppError::Storage(format!("Maven Central: {e}")))?
                .text()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
            maven_all_versions(&xml)
        }
        _ => return Err(AppError::Storage(format!("Unknown version source: {source}"))),
    };
    Ok(list.into_iter().take(30).collect())
}

/// The official Exasol JDBC driver ships on Maven Central (com.exasol:exasol-jdbc),
/// not GitHub releases: install the requested version, or resolve `<latest>`
/// live, and download the jar into the managed marketplace folder, ready to
/// point Java tools (DBeaver, DataGrip…) at. Returns (resolved version, note)
/// so the manifest records the REAL version — the repo-less catalog card may
/// pass none, and "latest" would break update detection forever.
async fn install_jdbc_from_maven(app: &AppHandle, id: &str, requested: Option<&str>) -> AppResult<(String, String)> {
    const META: &str = "https://repo1.maven.org/maven2/com/exasol/exasol-jdbc/maven-metadata.xml";
    let v = match requested {
        Some(v) if valid_version_tag(v) => v.to_string(),
        Some(v) => return Err(AppError::Storage(format!("Invalid JDBC driver version: {v}"))),
        None => {
            emit_log(app, id, "Resolving the latest exasol-jdbc from Maven Central…", "info");
            let xml = reqwest::Client::new()
                .get(META)
                .header("User-Agent", "exasol-studio")
                .send()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?
                .error_for_status()
                .map_err(|e| AppError::Storage(e.to_string()))?
                .text()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
            maven_latest_version(&xml).ok_or_else(|| {
                AppError::Storage("Could not read the latest exasol-jdbc version from Maven Central.".into())
            })?
        }
    };
    let jar = format!("exasol-jdbc-{v}.jar");
    let url = format!("https://repo1.maven.org/maven2/com/exasol/exasol-jdbc/{v}/{jar}");
    let path = download_and_place(app, id, &url, &jar).await?;
    let note = format!("Exasol JDBC driver {v} downloaded to {path}. Point your Java tool's driver path at this jar.");
    Ok((v, note))
}

/// One artifact choice from Exasol's official downloads index.
struct PortalArtifact {
    version: String,
    url: String,
    filename: String,
    sha256: Option<String>,
}

/// Parse Exasol's machine-readable downloads index
/// (x-up.s3.amazonaws.com/7.x/packages.json — the same data the downloads
/// portal renders) into the artifact list for one driver on one platform,
/// newest first. Pure so the platform mapping is unit-tested.
fn portal_artifacts(index: &Value, artifact: &str, host_os: &str, host_arch: &str) -> Vec<PortalArtifact> {
    let portal_os = match host_os {
        "macos" => "MacOS",
        "windows" => "Windows",
        _ => "Linux",
    };
    // ADO.NET ships Windows-only; everything else matches the host.
    let (want_os, want_arch) = if artifact == "ADO.NET" {
        ("Windows", "noarch")
    } else {
        (portal_os, host_arch)
    };
    let Some(oses) = index
        .get("artefacts")
        .and_then(Value::as_array)
        .and_then(|a| a.iter().find(|e| e.get("name").and_then(Value::as_str) == Some(artifact)))
        .and_then(|e| e.get("operatingSystems"))
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };
    let Some(arches) = oses
        .iter()
        .find(|o| o.get("operatingSystem").and_then(Value::as_str) == Some(want_os))
        .and_then(|o| o.get("architectures"))
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };
    // Exact architecture first; "universal"/"noarch" builds cover every host.
    let arch_entry = arches
        .iter()
        .find(|a| a.get("architecture").and_then(Value::as_str) == Some(want_arch))
        .or_else(|| {
            arches.iter().find(|a| {
                matches!(a.get("architecture").and_then(Value::as_str), Some("universal") | Some("noarch"))
            })
        });
    let Some(versions) = arch_entry.and_then(|a| a.get("versions")).and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut list: Vec<PortalArtifact> = versions
        .iter()
        .filter_map(|v| {
            let version = v.get("version")?.as_str()?.to_string();
            let file = v.get("packageFile")?;
            Some(PortalArtifact {
                url: file.get("url")?.as_str()?.to_string(),
                filename: file.get("filename")?.as_str()?.to_string(),
                sha256: file.get("sha256").and_then(Value::as_str).map(str::to_string),
                version,
            })
        })
        .filter(|a| valid_version_tag(&a.version) && a.url.starts_with("https://"))
        .collect();
    // Same ordering rule as every other version list: newest first.
    let order = sort_versions_desc(list.iter().map(|a| a.version.clone()).collect());
    list.sort_by_key(|a| order.iter().position(|v| *v == a.version).unwrap_or(usize::MAX));
    list
}

async fn exasol_downloads_index() -> AppResult<Value> {
    reqwest::Client::new()
        .get("https://x-up.s3.amazonaws.com/7.x/packages.json")
        .header("User-Agent", "exasol-studio")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
        .error_for_status()
        .map_err(|e| AppError::Storage(format!("Exasol downloads: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))
}

/// One small JSON GET with the standard headers.
async fn fetch_json(url: &str) -> AppResult<Value> {
    reqwest::Client::new()
        .get(url)
        .header("User-Agent", "exasol-studio")
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
        .error_for_status()
        .map_err(|e| AppError::Storage(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))
}

/// Download a driver package from its NATIVE registry (npm / Go proxy /
/// crates.io / GitHub tags) into the managed marketplace folder — independent
/// of any Studio-pinned runtime, at the requested version or the registry's
/// latest. Returns (resolved version, note).
async fn install_registry_package(
    app: &AppHandle,
    id: &str,
    requested: Option<&str>,
) -> AppResult<(String, String)> {
    let (version, url, filename, hint) = match id {
        "driver-ts" => {
            let v = match requested {
                Some(v) => v.to_string(),
                None => fetch_json("https://registry.npmjs.org/@exasol%2Fexasol-driver-ts/latest")
                    .await?
                    .get("version")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Storage("npm returned no latest version.".into()))?
                    .to_string(),
            };
            (
                v.clone(),
                format!("https://registry.npmjs.org/@exasol/exasol-driver-ts/-/exasol-driver-ts-{v}.tgz"),
                format!("exasol-driver-ts-{v}.tgz"),
                "npm package tarball — or add it to a project with `npm install @exasol/exasol-driver-ts`",
            )
        }
        "driver-go" => {
            let v = match requested {
                Some(v) => v.to_string(),
                None => fetch_json("https://proxy.golang.org/github.com/exasol/exasol-driver-go/@latest")
                    .await?
                    .get("Version")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Storage("The Go proxy returned no latest version.".into()))?
                    .to_string(),
            };
            (
                v.clone(),
                format!("https://proxy.golang.org/github.com/exasol/exasol-driver-go/@v/{v}.zip"),
                format!("exasol-driver-go-{v}.zip"),
                "Go module zip — or add it to a project with `go get github.com/exasol/exasol-driver-go`",
            )
        }
        "exarrow-rs" => {
            let v = match requested {
                Some(v) => v.to_string(),
                None => {
                    let body = fetch_json("https://crates.io/api/v1/crates/exarrow-rs").await?;
                    body.get("crate")
                        .and_then(|c| c.get("max_stable_version").or_else(|| c.get("max_version")))
                        .and_then(Value::as_str)
                        .ok_or_else(|| AppError::Storage("crates.io returned no latest version.".into()))?
                        .to_string()
                }
            };
            (
                v.clone(),
                format!("https://crates.io/api/v1/crates/exarrow-rs/{v}/download"),
                format!("exarrow-rs-{v}.crate"),
                "crates.io package — or add it to a project with `cargo add exarrow-rs`",
            )
        }
        "driver-r" => {
            let v = match requested {
                Some(v) => v.to_string(),
                None => crate::upstream::latest("exasol/r-exasol")
                    .map(|r| r.tag)
                    .ok_or_else(|| AppError::Storage("Could not resolve the latest r-exasol release.".into()))?,
            };
            (
                v.clone(),
                format!("https://codeload.github.com/exasol/r-exasol/tar.gz/refs/tags/{v}"),
                format!("r-exasol-{v}.tar.gz"),
                "R package source — or install in R with `remotes::install_github(\"exasol/r-exasol\")`",
            )
        }
        "driver-odbc" | "driver-adonet" => {
            let artifact_name = if id == "driver-odbc" { "ODBC" } else { "ADO.NET" };
            let index = exasol_downloads_index().await?;
            let artifacts = portal_artifacts(&index, artifact_name, std::env::consts::OS, std::env::consts::ARCH);
            let chosen = match requested {
                Some(v) => artifacts.into_iter().find(|a| a.version == v).ok_or_else(|| {
                    AppError::Storage(format!("{artifact_name} {v} is not published for this platform."))
                })?,
                None => artifacts.into_iter().next().ok_or_else(|| {
                    AppError::Storage(format!("{artifact_name} has no build for this platform on the Exasol downloads portal."))
                })?,
            };
            // Verify BEFORE extracting/linking — nothing derived from an
            // unverified file may ever exist (not even a dangling symlink).
            let path = download_only(app, id, &chosen.url, &chosen.filename).await?;
            if let Some(expected) = &chosen.sha256 {
                let actual = crate::local_runtime::sha256_file(std::path::Path::new(&path))?;
                if !actual.eq_ignore_ascii_case(expected) {
                    let _ = std::fs::remove_file(&path);
                    return Err(AppError::Storage(format!(
                        "{} failed checksum verification — the download was discarded.",
                        chosen.filename
                    )));
                }
                emit_log(app, id, "Checksum verified against the Exasol downloads portal.", "info");
            }
            auto_extract_and_link(app, id, std::path::Path::new(&path));
            let mut hint = if id == "driver-odbc" {
                "ODBC driver files extracted".to_string()
            } else {
                "Windows driver package for your .NET projects".to_string()
            };
            // One install = usable: wire the extracted ODBC library straight
            // into Studio's connection runtime (pyodbc takes a driver PATH, so
            // no OS-level registration is needed) and ensure the runtime venv.
            if id == "driver-odbc" {
                let unpacked = market_dir(app)?.join(id).join("unpacked");
                if let Some(lib) = find_file(&unpacked, 0, &|name: &str| {
                    let lower = name.to_ascii_lowercase();
                    lower.contains("exaodbc")
                        && (lower.ends_with(".dylib") || lower.ends_with(".so") || lower.ends_with(".dll"))
                }) {
                    // Propagate: claiming "wired into Studio" on a failed
                    // override write would be a lie.
                    crate::driver_exec::driver_override_set(
                        app.clone(),
                        "odbc".into(),
                        Some(lib.to_string_lossy().to_string()),
                    )?;
                    crate::driver_exec::driver_setup(app.clone(), "odbc".into()).await?;
                    hint = "wired into Studio's connections — pick the ODBC driver on any connection and it just works".to_string();
                }
            }
            return Ok((chosen.version.clone(), format!("Version {} downloaded to {path}. {hint}.", chosen.version)));
        }
        "dash-server" => {
            // Not on PyPI — pip-install straight from the GitHub tag tarball
            // into its own managed environment, so it runs from Studio.
            let v = match requested {
                Some(v) => v.to_string(),
                None => crate::upstream::latest("exasol-labs/dash-server")
                    .map(|r| r.tag)
                    .ok_or_else(|| AppError::Storage("Could not resolve the latest dash-server release.".into()))?,
            };
            if !valid_version_tag(&v) {
                return Err(AppError::Storage(format!("Invalid dash-server version: {v}")));
            }
            let spec = format!("https://github.com/exasol-labs/dash-server/archive/refs/tags/{v}.tar.gz");
            let note = install_uv_pip(app, id, &spec)?;
            return Ok((v.clone(), format!("dash-server {v} installed into a managed environment. {note}")));
        }
        "more-functions" => {
            // A SQL function library with no releases: download the current
            // scripts snapshot, ready to run in the SQL editor.
            let path = download_and_place(
                app,
                id,
                "https://api.github.com/repos/exasol-labs/more-functions/tarball",
                "more-functions-snapshot.tar.gz",
            )
            .await?;
            return Ok((
                "snapshot".into(),
                format!("SQL function library downloaded to {path} — unpack it and run the scripts in the SQL editor against your database."),
            ));
        }
        "driver-websocket" => {
            // A living protocol spec (no releases): download the current
            // snapshot — the API description plus client implementations.
            let path = download_and_place(
                app,
                id,
                "https://api.github.com/repos/exasol/websocket-api/tarball",
                "websocket-api-snapshot.tar.gz",
            )
            .await?;
            return Ok((
                "snapshot".into(),
                format!("Current WebSocket API spec snapshot downloaded to {path} — the protocol description plus client implementations."),
            ));
        }
        other => return Err(AppError::Storage(format!("{other} has no registry package install."))),
    };
    if !valid_version_tag(&version) {
        return Err(AppError::Storage(format!("Invalid package version: {version}")));
    }
    let path = download_and_place(app, id, &url, &filename).await?;
    Ok((version.clone(), format!("Version {version} downloaded to {path}. {hint}.")))
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
    // Which database an in-database add-on (Semantic Views) installs into.
    // Absent means the managed local runtime; other items ignore it.
    profile_id: Option<String>,
    // An EXPLICIT user pick from the card's version dropdown — distinct from
    // `version` (the display/manifest value, usually the catalog latest),
    // which must never silently override a verified pip pin.
    requested: Option<String>,
) -> AppResult<Value> {
    emit_log(&app, &id, "Starting installation…", "info");
    let stack = &crate::component_lock::components().python_stack;
    // Validated before it can reach a package spec or URL.
    let requested = requested.filter(|v| valid_version_tag(v));
    // The pip spec for a PyPI-backed item: the requested version, else the
    // verified pin where one exists, else the package's latest.
    let pip_spec = |package: &str, pin: Option<&str>| -> String {
        match requested.as_deref().or(pin) {
            Some(v) => format!("{package}=={}", v.trim_start_matches(['v', 'V'])),
            None => package.to_string(),
        }
    };
    // Installers that resolve the real version themselves (Maven) report it
    // here so the manifest never records a meaningless "latest".
    let mut resolved_version: Option<String> = None;
    let result: AppResult<String> = match id.as_str() {
        "mcp-server" => install_uv_tool(&app, &id, &pip_spec("exasol-mcp-server", Some(&stack.mcp_server_version))),
        "agent-skills" => {
            let dir = app.state::<crate::state::AppState>().data_dir.clone();
            crate::local_database::ensure_agent_skills(&app, &dir)
                .map(|revision| format!("Exasol agent skills synced from exasol-labs ({revision})."))
        }
        "pyexasol" => install_uv_pip(&app, &id, &pip_spec("pyexasol", Some(&stack.pyexasol_version))),
        "sqlalchemy-exasol" => install_uv_pip(&app, &id, &pip_spec("sqlalchemy-exasol", None)),
        "dbt-exasol" => install_uv_pip(&app, &id, &pip_spec("dbt-exasol", None)),
        "notebook-connector" => install_uv_pip(&app, &id, &pip_spec("exasol-notebook-connector", None)),
        "ai-lab" => {
            // Engine provisioning can take minutes (brew install, colima boot,
            // image pull) — keep it off the async runtime's worker threads.
            let app2 = app.clone();
            let id2 = id.clone();
            let req2 = requested.clone();
            tauri::async_runtime::spawn_blocking(move || install_ai_lab(&app2, &id2, req2.as_deref()))
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?
        }
        "json-tables" => install_json_tables(&app, &id).await,
        "exasol-personal" => install_personal_local(&app, &id),
        "exasol-cloud" => install_personal_cloud(&app, &id),
        "driver-jdbc" => install_jdbc_from_maven(&app, &id, requested.as_deref()).await.map(|(v, note)| {
            resolved_version = Some(v);
            note
        }),
        "driver-ts" | "driver-go" | "exarrow-rs" | "driver-r" | "driver-odbc" | "driver-adonet" | "driver-websocket"
        | "dash-server" | "more-functions" => {
            install_registry_package(&app, &id, requested.as_deref()).await.map(|(v, note)| {
                resolved_version = Some(v);
                note
            })
        }
        "semantic-views" => crate::local_database::personal_install_semantic_views(app.clone(), profile_id)
            .await
            .map(|install| format!("Exasol Semantic Views {} is installed in {}.", install.revision, install.database)),
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
                // Record only what was actually installed: installer-resolved
                // first, then the validated pick, then the display version IF
                // it passes validation — never a raw value execution ignored.
                "version": resolved_version
                    .or(requested)
                    .or(version.filter(|v| valid_version_tag(v)))
                    .unwrap_or_else(|| "latest".into()),
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
    // A JDBC override pointing INTO the directory being deleted would leave
    // the Drivers UI showing a custom jar that no longer exists (the runtime
    // itself falls back safely, but the display would lie). Clear it first.
    if id == "driver-jdbc" {
        if let Some(current) = crate::driver_exec::driver_override(&app, "jdbc") {
            if std::path::Path::new(&current).starts_with(&dir) {
                let _ = crate::driver_exec::driver_override_set(app.clone(), "jdbc".into(), None);
            }
        }
    }
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
pub async fn market_detect(app: AppHandle) -> AppResult<Value> {
    // Every probe here spawns processes (python imports, docker inspect,
    // launcher status) — seconds of work. A SYNC Tauri command runs on the
    // MAIN thread, which froze the whole window when the Marketplace opened;
    // spawn_blocking keeps the UI fluid while the probes run.
    tauri::async_runtime::spawn_blocking(move || market_detect_blocking(app))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
}

fn market_detect_blocking(app: AppHandle) -> AppResult<Value> {
    use crate::local_database as db;
    let mut map = serde_json::Map::new();

    // Exasol Personal is a DATABASE: installed vs. actually running are
    // distinct — and BOTH count installs made outside Studio (the exa CLI's
    // shared default deployment), so the card never says "Install" next to a
    // database that already runs on this machine.
    map.insert(
        "exasol-personal".into(),
        json!(
            crate::local_runtime::runtime_installed(&app)
                || crate::local_runtime::shared_deployment_installed()
        ),
    );
    map.insert(
        "exasol-personal:running".into(),
        json!(
            crate::local_runtime::runtime_running(&app)
                || crate::local_runtime::shared_deployment_running()
        ),
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

/// Point the SQL editor's driver runtime at an INDEPENDENTLY downloaded driver
/// file — downloads stay unmanaged and unpinned, but one click makes Studio use
/// one. Today: the JDBC jar (sets the same override as Drivers → "Use custom
/// JAR", so it survives runtime reinstalls and is cleared the same way).
#[tauri::command]
pub fn market_use_downloaded(app: AppHandle, id: String, version: String) -> AppResult<Value> {
    if !valid_version_tag(&version) {
        return Err(AppError::Storage(format!("Invalid version: {version}")));
    }
    match id.as_str() {
        "driver-jdbc" => {
            let jar = market_dir(&app)?.join(&id).join(format!("exasol-jdbc-{version}.jar"));
            if !jar.is_file() {
                return Err(AppError::Storage(format!(
                    "exasol-jdbc-{version}.jar isn't downloaded yet — install that version first."
                )));
            }
            crate::driver_exec::driver_override_set(app, "jdbc".into(), Some(jar.to_string_lossy().to_string()))
        }
        other => Err(AppError::Storage(format!(
            "{other} runs outside Studio — download any version here and use it from your own tools."
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::{maven_all_versions, maven_latest_version, sort_versions_desc, valid_version_tag};

    #[test]
    fn archives_extract_except_files_tools_consume_whole() {
        use super::archive_kind;
        assert_eq!(archive_kind("exasol_scheduler-v0.2-macos-arm64.tar.gz"), Some("tar"));
        assert_eq!(archive_kind("exasol-driver-ts-0.7.0.tgz"), Some("tar"));
        assert_eq!(archive_kind("exarrow-rs-0.16.0.crate"), Some("tar"));
        assert_eq!(archive_kind("grafana-datasource.zip"), Some("zip"));
        // Consumed whole by their tools — never unpacked.
        assert_eq!(archive_kind("exasol_jdbc.taco"), None);
        assert_eq!(archive_kind("exasol-jdbc-26.2.9.jar"), None);
        assert_eq!(archive_kind("exasol_json_tables.whl"), None);
        assert_eq!(archive_kind("plain-binary"), None);
    }

    #[test]
    fn portal_artifacts_match_the_host_platform() {
        use super::portal_artifacts;
        let index = serde_json::json!({
            "artefacts": [{
                "name": "ODBC",
                "operatingSystems": [
                    { "operatingSystem": "Linux", "architectures": [
                        { "architecture": "x86_64", "versions": [
                            { "version": "25.2.5", "packageFile": { "filename": "Exasol_ODBC-25.2.5-Linux-x86_64.tar.gz", "url": "https://x-up.s3.amazonaws.com/7.x/25.2.5/l.tar.gz", "sha256": "aa" } }
                        ]}
                    ]},
                    { "operatingSystem": "MacOS", "architectures": [
                        { "architecture": "universal", "versions": [
                            { "version": "25.2.4", "packageFile": { "filename": "old.tar.gz", "url": "https://x-up.s3.amazonaws.com/7.x/25.2.4/m.tar.gz", "sha256": "bb" } },
                            { "version": "26.2.6", "packageFile": { "filename": "Exasol_ODBC-26.2.6-macOS.tar.gz", "url": "https://x-up.s3.amazonaws.com/7.x/26.2.6/m.tar.gz", "sha256": "cc" } }
                        ]}
                    ]}
                ]
            }, {
                "name": "ADO.NET",
                "operatingSystems": [
                    { "operatingSystem": "Windows", "architectures": [
                        { "architecture": "noarch", "versions": [
                            { "version": "25.2.2", "packageFile": { "filename": "ado.zip", "url": "https://x-up.s3.amazonaws.com/7.x/ado.zip" } }
                        ]}
                    ]}
                ]
            }]
        });
        // macOS aarch64 → the universal MacOS build, newest first.
        let mac = portal_artifacts(&index, "ODBC", "macos", "aarch64");
        assert_eq!(mac.iter().map(|a| a.version.as_str()).collect::<Vec<_>>(), ["26.2.6", "25.2.4"]);
        assert_eq!(mac[0].sha256.as_deref(), Some("cc"));
        // Linux x86_64 → the exact-arch build.
        let linux = portal_artifacts(&index, "ODBC", "linux", "x86_64");
        assert_eq!(linux[0].version, "25.2.5");
        // ADO.NET is Windows-only BY DESIGN and must resolve from any host.
        let ado = portal_artifacts(&index, "ADO.NET", "macos", "aarch64");
        assert_eq!(ado[0].version, "25.2.2");
        assert!(ado[0].sha256.is_none());
        // Unknown artifact or platform → empty, never a wrong-platform pick.
        assert!(portal_artifacts(&index, "JDBC", "macos", "aarch64").is_empty());
        assert!(portal_artifacts(&serde_json::json!({}), "ODBC", "macos", "aarch64").is_empty());
    }

    #[test]
    fn docker_tags_follow_dockers_grammar() {
        use super::valid_docker_tag;
        assert!(valid_docker_tag("latest"));
        assert!(valid_docker_tag("6.0.0"));
        assert!(valid_docker_tag("v8.29.1"));
        assert!(!valid_docker_tag("")); // empty
        assert!(!valid_docker_tag(".hidden")); // must not start with separator
        assert!(!valid_docker_tag("-flag"));
        assert!(!valid_docker_tag("1.0+build")); // `+` is version-legal, tag-illegal
        assert!(!valid_docker_tag(&"a".repeat(129)));
    }

    #[test]
    fn version_tags_reject_anything_path_or_option_like() {
        assert!(valid_version_tag("26.2.9"));
        assert!(valid_version_tag("v2.2.0"));
        assert!(valid_version_tag("2.3.0-RC1+build_7"));
        assert!(!valid_version_tag(""));
        assert!(!valid_version_tag("../../evil"));
        assert!(!valid_version_tag("1.0/x"));
        assert!(!valid_version_tag(".")); // URL dot segments normalize away
        assert!(!valid_version_tag(".."));
        assert!(!valid_version_tag(".hidden"));
        assert!(!valid_version_tag("--upgrade")); // never an option
        assert!(!valid_version_tag(&"9".repeat(101))); // absurd length
    }

    #[test]
    fn maven_all_versions_lists_newest_first_and_skips_junk() {
        let xml = r#"<metadata><versioning>
  <versions>
    <version>7.1.20</version>
    <version>../nope</version>
    <version>25.2.4</version>
    <version>26.2.9</version>
  </versions>
</versioning></metadata>"#;
        assert_eq!(maven_all_versions(xml), ["26.2.9", "25.2.4", "7.1.20"]);
        assert!(maven_all_versions("<metadata/>").is_empty());
    }

    #[test]
    fn sort_versions_desc_orders_numerically_not_lexically() {
        let sorted = sort_versions_desc(vec![
            "2.0.9".into(),
            "2.0.10".into(),
            "0.9.0".into(),
            "v2.1.0".into(),
        ]);
        assert_eq!(sorted, ["v2.1.0", "2.0.10", "2.0.9", "0.9.0"]);
    }

    #[test]
    fn sort_versions_desc_ranks_prereleases_below_their_final() {
        let sorted = sort_versions_desc(vec![
            "1.0.dev1".into(),
            "1.0".into(),
            "2.0-rc1".into(),
            "2.0".into(),
        ]);
        assert_eq!(sorted, ["2.0", "2.0-rc1", "1.0", "1.0.dev1"]);
    }

    #[test]
    fn maven_latest_parses_real_metadata_layout() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <groupId>com.exasol</groupId>
  <artifactId>exasol-jdbc</artifactId>
  <versioning>
    <latest>26.2.9</latest>
    <release>26.2.9</release>
    <versions><version>7.1.20</version><version>26.2.9</version></versions>
  </versioning>
</metadata>"#;
        assert_eq!(maven_latest_version(xml).as_deref(), Some("26.2.9"));
    }

    #[test]
    fn maven_latest_rejects_missing_empty_or_unsafe_values() {
        assert_eq!(maven_latest_version("<metadata></metadata>"), None);
        assert_eq!(maven_latest_version("<latest>  </latest>"), None);
        // A hostile value must never become part of a download path.
        assert_eq!(maven_latest_version("<latest>../../evil</latest>"), None);
        assert_eq!(maven_latest_version("<latest>1.0/x</latest>"), None);
    }

    #[test]
    fn maven_latest_tolerates_whitespace_and_prerelease_tags() {
        assert_eq!(
            maven_latest_version("<latest>\n  26.3.0-RC1\n</latest>"),
            Some("26.3.0-RC1".into())
        );
    }
}
