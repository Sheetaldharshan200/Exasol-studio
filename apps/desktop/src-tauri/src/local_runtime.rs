//! Studio-owned local Exasol runtime orchestration.
//!
//! macOS uses the native Exasol Personal launcher. Windows and Linux use the
//! official Exasol Nano image through Docker (preferred) or Podman. This module
//! deliberately does not execute or install the Personal Local Starter Kit.

use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::market::{emit_log, resolve_bin, run_streamed};

const NANO_CONTAINER: &str = "exasol-studio-nano";
const NANO_VOLUME: &str = "exasol-studio-nano-data";
const PORT: u16 = 8563;
// Studio's OWN Personal deployment listens off the standard port so it can
// coexist with (and never be broken by) any other local Exasol — the starter
// kit's Docker DB or a user-managed `exasol` deployment, both usually on 8563.
const STUDIO_DB_PORT: u16 = 8565;
const STUDIO_SSH_PORT: u16 = 2224;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConnection {
    pub kind: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub engine: Option<String>,
}

fn runtime_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Storage(e.to_string()))?
        .join("personal-local");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn command_ok(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

fn port_ready(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port),
        Duration::from_secs(1),
    )
    .is_ok()
}

/// Whether Studio's managed local database is currently accepting connections.
pub fn runtime_running(app: &AppHandle) -> bool {
    port_ready(expected_db_port(app))
}

/// The port Studio's managed database listens on: the deployment's recorded
/// dbPort when installed, otherwise the platform default for a fresh install.
fn expected_db_port(app: &AppHandle) -> u16 {
    if std::env::consts::OS == "macos" {
        personal_deployment_dir(app)
            .ok()
            .and_then(|dir| std::fs::read(dir.join("deployment.json")).ok())
            .and_then(|raw| serde_json::from_slice::<Value>(&raw).ok())
            .and_then(|v| v.get("connection")?.get("dbPort")?.as_u64())
            .map(|p| p as u16)
            .unwrap_or(STUDIO_DB_PORT)
    } else {
        PORT
    }
}

fn wait_for_port(app: &AppHandle, id: &str, port: u16, timeout: Duration) -> AppResult<()> {
    let started = Instant::now();
    let mut last_report = 0;
    while started.elapsed() < timeout {
        if port_ready(port) {
            return Ok(());
        }
        let elapsed = started.elapsed().as_secs();
        if elapsed >= last_report + 30 {
            last_report = elapsed;
            emit_log(
                app,
                id,
                format!("Database is still starting ({elapsed}s)…"),
                "info",
            );
        }
        std::thread::sleep(Duration::from_secs(5));
    }
    Err(AppError::Storage(format!(
        "Local Exasol did not open 127.0.0.1:{port} within {} seconds.",
        timeout.as_secs()
    )))
}

pub(crate) fn sha256_file(path: &Path) -> AppResult<String> {
    let mut file = File::open(path)?;
    let mut hash = Sha256::new();
    let mut buf = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hash.update(&buf[..read]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

/// Prebundled runtime artifact shipped inside the .app (`resources/runtime/`).
/// Returns the path only when the checksum matches the component lock, so a
/// tampered or stale bundle silently falls back to the verified download.
fn bundled_artifact(app: &AppHandle, name: &str, expected_sha256: &str) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(path) = app
        .path()
        .resolve(format!("runtime/{name}"), tauri::path::BaseDirectory::Resource)
    {
        candidates.push(path);
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("resources/runtime/{name}")));
    candidates.into_iter().find(|path| {
        path.is_file()
            && sha256_file(path).is_ok_and(|actual| actual.eq_ignore_ascii_case(expected_sha256))
    })
}

/// Fetch a locked artifact: prebundled copy first (no network), verified
/// download otherwise. Either way the destination matches the lock's sha256.
pub(crate) fn obtain_artifact(
    app: &AppHandle,
    id: &str,
    artifact: &crate::component_lock::Artifact,
    destination: &Path,
) -> AppResult<()> {
    if let Some(bundled) = bundled_artifact(app, &artifact.name, &artifact.sha256) {
        emit_log(
            app,
            id,
            format!("Installing {} from the app bundle (no download needed)…", artifact.name),
            "info",
        );
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let partial = destination.with_extension("partial");
        std::fs::copy(&bundled, &partial)?;
        if destination.exists() {
            std::fs::remove_file(destination)?;
        }
        std::fs::rename(partial, destination)?;
        return Ok(());
    }
    emit_log(app, id, format!("Downloading verified {}…", artifact.name), "info");
    download_verified(&artifact.url, destination, &artifact.sha256)
}

/// Whether an HTTP status is worth retrying — transient server/rate-limit
/// conditions. Other 4xx (e.g. 404) are a bad URL and won't fix themselves, so
/// we fail fast instead of burning the backoff budget.
fn retryable_status(status: u16) -> bool {
    status >= 500 || status == 408 || status == 429
}

/// One download attempt into `partial`. Returns Ok on success, or
/// (retryable, message) on failure so the caller can decide whether to retry.
fn try_download(
    client: &reqwest::blocking::Client,
    url: &str,
    partial: &Path,
    expected_sha256: &str,
) -> Result<(), (bool, String)> {
    let resp = client
        .get(url)
        .header("User-Agent", "exasol-studio")
        .send()
        // A send error means we never got a response (DNS/TLS/connection/timeout)
        // — always transient, worth another try.
        .map_err(|e| (true, format!("could not download {url}: {e}")))?;
    let mut resp = match resp.error_for_status() {
        Ok(r) => r,
        Err(e) => {
            let retry = e.status().map(|s| retryable_status(s.as_u16())).unwrap_or(true);
            return Err((retry, format!("download failed for {url}: {e}")));
        }
    };
    let mut file = File::create(partial).map_err(|e| (false, format!("could not create download file: {e}")))?;
    // A broken stream mid-copy is transient (a truncated download).
    resp.copy_to(&mut file).map_err(|e| (true, format!("could not save download: {e}")))?;
    file.flush().map_err(|e| (false, format!("could not flush download: {e}")))?;
    let actual = sha256_file(partial).map_err(|e| (false, format!("could not hash download: {e}")))?;
    if !actual.eq_ignore_ascii_case(expected_sha256) {
        // A checksum miss usually means a truncated/corrupt transfer — retry.
        return Err((true, format!("checksum mismatch for {url}: expected {expected_sha256}, got {actual}")));
    }
    Ok(())
}

pub(crate) fn download_verified(
    url: &str,
    destination: &Path,
    expected_sha256: &str,
) -> AppResult<()> {
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::Storage("download destination has no parent".into()))?;
    std::fs::create_dir_all(parent)?;
    let partial = destination.with_extension("partial");

    // Explicit timeouts so a hung connection can't stall setup forever, and a
    // few retries with exponential backoff so a transient network blip (the
    // common "error sending request" case) doesn't fail the whole local setup.
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| AppError::Storage(format!("could not build http client: {e}")))?;

    const ATTEMPTS: u32 = 4;
    let mut last = String::new();
    for attempt in 1..=ATTEMPTS {
        match try_download(&client, url, &partial, expected_sha256) {
            Ok(()) => {
                if destination.exists() {
                    std::fs::remove_file(destination)?;
                }
                std::fs::rename(&partial, destination)?;
                return Ok(());
            }
            Err((retryable, msg)) => {
                let _ = std::fs::remove_file(&partial);
                last = msg;
                if !retryable || attempt == ATTEMPTS {
                    break;
                }
                // 2s, 4s, 8s between the four attempts.
                std::thread::sleep(Duration::from_secs(2u64.pow(attempt)));
            }
        }
    }
    Err(AppError::Storage(last))
}

#[cfg(unix)]
fn make_executable(path: &Path) -> AppResult<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = std::fs::metadata(path)?.permissions();
    permissions.set_mode(0o700);
    std::fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> AppResult<()> {
    Ok(())
}

fn write_secret(path: &Path, value: &str) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))?;
        }
    }
    let partial = path.with_extension("partial");
    std::fs::write(&partial, value.as_bytes())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&partial, std::fs::Permissions::from_mode(0o600))?;
    }
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    std::fs::rename(partial, path)?;
    #[cfg(windows)]
    restrict_windows_secret(path)?;
    Ok(())
}

#[cfg(windows)]
fn restrict_windows_secret(path: &Path) -> AppResult<()> {
    let who = Command::new("whoami")
        .args(["/user", "/fo", "csv", "/nh"])
        .output()
        .map_err(|e| AppError::Storage(format!("could not resolve the Windows user SID: {e}")))?;
    let row = String::from_utf8_lossy(&who.stdout);
    let sid = row
        .split(',')
        .nth(1)
        .map(|value| value.trim().trim_matches('"'))
        .filter(|value| value.starts_with("S-"))
        .ok_or_else(|| AppError::Storage("could not parse the current Windows user SID".into()))?;
    let grant = format!("*{sid}:F");
    let status = Command::new("icacls")
        .arg(path)
        .args(["/inheritance:r", "/grant:r", &grant])
        .status()
        .map_err(|e| AppError::Storage(format!("could not secure the Nano password file: {e}")))?;
    if !status.success() {
        return Err(AppError::Storage(
            "Windows refused the private ACL for the Nano password file.".into(),
        ));
    }
    Ok(())
}

fn generated_password() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

fn managed_exasol(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(runtime_dir(app)?.join("bin").join("exasol"))
}

fn exasol_cli(app: &AppHandle) -> AppResult<PathBuf> {
    let managed = managed_exasol(app)?;
    if managed.is_file() {
        return Ok(managed);
    }
    resolve_bin("exasol")
        .ok_or_else(|| AppError::Storage("Exasol Personal launcher is not installed.".into()))
}

fn ensure_personal_launcher(app: &AppHandle, id: &str) -> AppResult<PathBuf> {
    let component = &crate::component_lock::components().personal;
    let artifact = crate::component_lock::artifact_for(component).ok_or_else(|| {
        AppError::Storage(format!(
            "Exasol Personal {} is not published for {}.",
            component.version,
            crate::component_lock::platform_key()
        ))
    })?;
    let managed = managed_exasol(app)?;
    let version_marker = runtime_dir(app)?.join("launcher.version");
    let installed_version = std::fs::read_to_string(&version_marker).unwrap_or_default();
    // An independently-updated NEWER engine must never be rolled back by the
    // pin (verified live: a completed v2.2.0 update was silently downgraded
    // to the v2.1.0 pin at the next app boot by this very check).
    if managed.is_file()
        && !installed_version.trim().is_empty()
        && crate::components_update::is_newer(installed_version.trim(), &component.version)
    {
        if let Ok(output) = Command::new(&managed).args(["install", "--help"]).output() {
            if output.status.success() && String::from_utf8_lossy(&output.stdout).contains("local") {
                return Ok(managed);
            }
        }
    }
    // Bootstrap installs the LATEST official release from the original repo
    // (digest-verified) — components are never bundled and never coupled to
    // the Studio release. The verified lock below is the fallback when the
    // release API or a usable digest is unavailable.
    if let Some(release) = crate::upstream::latest(&component.repository) {
        let installed = installed_version.trim();
        if installed == release.tag && managed.is_file() {
            if let Ok(output) = Command::new(&managed).args(["install", "--help"]).output() {
                if output.status.success() && String::from_utf8_lossy(&output.stdout).contains("local") {
                    return Ok(managed);
                }
            }
        }
        if installed != release.tag {
            if let Some(official) = crate::upstream::pick_asset(&artifact.name, &release.assets)
                .and_then(|asset| crate::upstream::artifact_from(asset))
            {
                match install_personal_launcher_from(app, id, &official, &release.tag) {
                    Ok(path) => return Ok(path),
                    Err(err) => emit_log(
                        app,
                        id,
                        format!(
                            "Latest official install failed ({err}) — falling back to verified {}.",
                            component.version
                        ),
                        "warning",
                    ),
                }
            }
        }
    }
    let checksum_valid = managed.is_file()
        && artifact.executable_sha256.as_ref().is_some_and(|expected| {
            sha256_file(&managed).is_ok_and(|actual| actual.eq_ignore_ascii_case(expected))
        });
    if installed_version.trim() == component.version && checksum_valid {
        let path = managed;
        if let Ok(output) = Command::new(&path).args(["install", "--help"]).output() {
            if output.status.success() && String::from_utf8_lossy(&output.stdout).contains("local")
            {
                return Ok(path);
            }
        }
    }
    let archive = runtime_dir(app)?.join(&artifact.name);
    emit_log(
        app,
        id,
        format!("Installing Exasol Personal {}…", component.version),
        "info",
    );
    obtain_artifact(app, id, artifact, &archive)?;
    let unpack = runtime_dir(app)?.join("launcher-unpack");
    let _ = std::fs::remove_dir_all(&unpack);
    std::fs::create_dir_all(&unpack)?;
    let decoder = flate2::read::GzDecoder::new(File::open(&archive)?);
    tar::Archive::new(decoder).unpack(&unpack)?;
    let binary = find_file(&unpack, "exasol").ok_or_else(|| {
        AppError::Storage("Exasol Personal archive did not contain `exasol`.".into())
    })?;
    let target = managed_exasol(app)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(binary, &target)?;
    make_executable(&target)?;
    // Same rule as uv: the inner-executable pin exists only in the committed
    // lock; live releases are archive-digest-verified and carry no inner pin.
    if let Some(expected_binary) = artifact.executable_sha256.as_ref() {
        let actual_binary = sha256_file(&target)?;
        if !actual_binary.eq_ignore_ascii_case(expected_binary) {
            let _ = std::fs::remove_file(&target);
            return Err(AppError::Storage(format!(
                "Exasol Personal executable checksum mismatch: expected {expected_binary}, got {actual_binary}."
            )));
        }
    }
    std::fs::write(version_marker, &component.version)?;
    let _ = std::fs::remove_file(archive);
    let _ = std::fs::remove_dir_all(unpack);
    Ok(target)
}

/// Install a specific Exasol Personal launcher build from an OFFICIAL release
/// artifact (digest-verified archive — see upstream::resolve_artifact). Mirrors
/// ensure_personal_launcher's install tail; the lock's per-executable hash only
/// exists for the verified build, so here the archive digest is the pin.
fn install_personal_launcher_from(
    app: &AppHandle,
    id: &str,
    artifact: &crate::component_lock::Artifact,
    version: &str,
) -> AppResult<PathBuf> {
    let archive = runtime_dir(app)?.join(&artifact.name);
    emit_log(app, id, format!("Installing Exasol Personal {version} (official release)…"), "info");
    obtain_artifact(app, id, artifact, &archive)?;
    let unpack = runtime_dir(app)?.join("launcher-unpack");
    let _ = std::fs::remove_dir_all(&unpack);
    std::fs::create_dir_all(&unpack)?;
    let decoder = flate2::read::GzDecoder::new(File::open(&archive)?);
    tar::Archive::new(decoder).unpack(&unpack)?;
    let binary = find_file(&unpack, "exasol").ok_or_else(|| {
        AppError::Storage("Exasol Personal archive did not contain `exasol`.".into())
    })?;
    let target = managed_exasol(app)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(binary, &target)?;
    make_executable(&target)?;
    let version_marker = runtime_dir(app)?.join("launcher.version");
    std::fs::write(version_marker, version)?;
    let _ = std::fs::remove_file(archive);
    let _ = std::fs::remove_dir_all(unpack);
    Ok(target)
}

fn find_file(dir: &Path, name: &str) -> Option<PathBuf> {
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().and_then(|n| n.to_str()) == Some(name) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file(&path, name) {
                return Some(found);
            }
        }
    }
    None
}

/// Studio's OWN deployment directory, inside app-data. Fully isolated: the
/// shared `~/.exasol/personal/deployments/default` (used by the starter kit or
/// manual `exasol` runs) is never read, started, stopped, or destroyed by
/// Studio — destroying that one can no longer break Studio's database.
fn personal_deployment_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(runtime_dir(app)?.join("deployment"))
}

/// The shared default-dir deployment other tools manage (the `exa` CLI's
/// `exa connect` install lands here). Detection only — Studio never operates
/// on it.
fn legacy_deployment_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".exasol/personal/deployments/default"))
}

/// An Exasol Personal installed by another tool (the exa CLI, a starter kit)
/// in the shared default directory. The Marketplace card must reflect it —
/// "Install" next to a database that is already running reads as broken sync.
pub(crate) fn shared_deployment_installed() -> bool {
    legacy_deployment_dir().is_some_and(|d| d.join("deployment.json").is_file())
}

/// Whether the shared deployment's database answers, on the port its own
/// deployment.json records (8563 when unrecorded).
pub(crate) fn shared_deployment_running() -> bool {
    let port = legacy_deployment_dir()
        .and_then(|d| std::fs::read(d.join("deployment.json")).ok())
        .and_then(|raw| serde_json::from_slice::<Value>(&raw).ok())
        .and_then(|v| v.get("connection")?.get("dbPort")?.as_u64())
        .map(|p| p as u16)
        .unwrap_or(PORT);
    port_ready(port)
}

fn read_personal_connection(app: &AppHandle) -> AppResult<RuntimeConnection> {
    let dir = personal_deployment_dir(app)?;
    let deployment: Value = serde_json::from_slice(&std::fs::read(dir.join("deployment.json"))?)?;
    let secrets: Value = serde_json::from_slice(&std::fs::read(dir.join("secrets.json"))?)?;
    let connection = deployment.get("connection").unwrap_or(&Value::Null);
    let password = secrets
        .get("dbPassword")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::Storage("Exasol Personal secrets.json has no dbPassword.".into())
        })?;
    Ok(RuntimeConnection {
        kind: "personal".into(),
        host: connection
            .get("host")
            .and_then(Value::as_str)
            .unwrap_or("127.0.0.1")
            .into(),
        port: connection
            .get("dbPort")
            .and_then(Value::as_u64)
            .unwrap_or(STUDIO_DB_PORT as u64) as u16,
        user: connection
            .get("username")
            .and_then(Value::as_str)
            .unwrap_or("sys")
            .into(),
        password: password.into(),
        engine: None,
    })
}

/// True when Studio's own Personal deployment has been installed.
pub(crate) fn personal_deployment_exists(app: &AppHandle) -> bool {
    personal_deployment_dir(app).is_ok_and(|dir| dir.join("deployment.json").is_file())
}

/// True when the managed database is currently accepting connections.
pub(crate) fn personal_db_running(app: &AppHandle) -> bool {
    personal_deployment_exists(app) && port_ready(expected_db_port(app))
}

/// The deployment's current connection (must be installed).
pub(crate) fn current_personal_connection(app: &AppHandle) -> AppResult<RuntimeConnection> {
    read_personal_connection(app)
}

/// Rewrite the deployment's stored dbPassword after a successful ALTER USER,
/// so `exasol`-CLI operations and future reads use the new credential.
pub(crate) fn persist_personal_password(app: &AppHandle, password: &str) -> AppResult<()> {
    let path = personal_deployment_dir(app)?.join("secrets.json");
    let mut secrets: Value = serde_json::from_slice(&std::fs::read(&path)?)?;
    secrets["dbPassword"] = Value::String(password.into());
    write_secret(&path, &serde_json::to_string_pretty(&secrets)?)
}

/// When our deployment dir is gone but the port is still held by OUR OWN
/// orphaned runtime daemon (e.g. the data dir was cleared while the DB ran),
/// kill that process so setup can proceed. Only kills processes whose command
/// path points inside Studio's managed runtime dir — never a foreign server.
/// Returns true if it freed the port. Unix only (Windows uses containers).
#[cfg(unix)]
fn reclaim_orphaned_port(app: &AppHandle, id: &str, port: u16) -> bool {
    let Ok(runtime) = runtime_dir(app) else { return false };
    let marker = runtime.to_string_lossy().to_string();
    let Ok(out) = Command::new("lsof")
        .args(["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN", "-t"])
        .output()
    else {
        return false;
    };
    let mut killed = false;
    for pid in String::from_utf8_lossy(&out.stdout).split_whitespace() {
        let cmd = Command::new("ps")
            .args(["-p", pid, "-o", "command="])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        // Only ours: the executable must live under our managed runtime dir.
        if cmd.contains(&marker) {
            emit_log(
                app,
                id,
                format!("Reclaiming port {port} from an orphaned Studio database process (pid {pid})…"),
                "info",
            );
            let _ = Command::new("kill").arg(pid).output();
            killed = true;
        }
    }
    if killed {
        std::thread::sleep(Duration::from_millis(1500));
        return !port_ready(port);
    }
    false
}

#[cfg(not(unix))]
fn reclaim_orphaned_port(_app: &AppHandle, _id: &str, _port: u16) -> bool {
    false
}

fn ensure_personal(app: &AppHandle, id: &str) -> AppResult<RuntimeConnection> {
    let cli = ensure_personal_launcher(app, id)?;
    let cli = cli.to_string_lossy().to_string();
    let dir = personal_deployment_dir(app)?;
    let ddir = dir.to_string_lossy().to_string();
    let deployment_exists = dir.join("deployment.json").is_file();
    if !deployment_exists {
        if legacy_deployment_dir().is_some_and(|d| d.join("deployment.json").is_file()) {
            emit_log(
                app,
                id,
                "A default-directory Exasol Personal deployment exists on this machine. Studio installs its OWN isolated database (port 8565) and leaves that one untouched.",
                "info",
            );
        }
        if port_ready(STUDIO_DB_PORT) && !reclaim_orphaned_port(app, id, STUDIO_DB_PORT) {
            return Err(AppError::Storage(format!(
                "Port {STUDIO_DB_PORT} is already in use by another program. Close whatever is using it, then retry setup."
            )));
        }
        let ports = format!("db:{STUDIO_DB_PORT},ssh:{STUDIO_SSH_PORT}");
        if run_streamed(
            app,
            id,
            &cli,
            &["install", "local", "--deployment-dir", &ddir, "--ports", &ports],
        )? != 0
        {
            return Err(AppError::Storage("`exasol install local` failed.".into()));
        }
    } else {
        let port = expected_db_port(app);
        if !port_ready(port)
            && run_streamed(app, id, &cli, &["start", "--deployment-dir", &ddir])? != 0
        {
            return Err(AppError::Storage("`exasol start` failed.".into()));
        }
    }
    wait_for_port(app, id, expected_db_port(app), Duration::from_secs(150))?;
    if !command_ok(&cli, &["info", "--deployment-dir", &ddir]) {
        return Err(AppError::Storage(
            "Exasol Personal is listening but `exasol info` failed.".into(),
        ));
    }
    read_personal_connection(app)
}

/// Recursively copy `src` into `dst` (created if absent). Symlinks are
/// RECREATED, never followed — so a symlink cycle can't cause infinite
/// recursion and the copy never escapes the tree via a link. Used for the cold
/// backup of the deployment directory.
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        // symlink_metadata does NOT follow links (unlike metadata), so a
        // symlink is handled as a symlink instead of being traversed.
        let ty = std::fs::symlink_metadata(&from)?.file_type();
        if ty.is_symlink() {
            #[cfg(unix)]
            {
                let target = std::fs::read_link(&from)?;
                let _ = std::fs::remove_file(&to);
                std::os::unix::fs::symlink(target, &to)?;
            }
            // Non-unix managed DBs run in Docker (no dir backup), so a symlink
            // here isn't expected; skip rather than follow it.
        } else if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else if ty.is_file() {
            std::fs::copy(&from, &to)?;
        }
        // Anything else — unix sockets (the VM runner's vm.sock), FIFOs,
        // device nodes — cannot be copied (ENOTSUP, os error 102) and holds
        // no data worth backing up: skip. The runner recreates its socket
        // on start.
    }
    Ok(())
}

/// Poll until `port` stops accepting connections (the DB has fully shut down),
/// or the timeout elapses. Returns whether the port is closed.
fn wait_for_port_closed(port: u16, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if !port_ready(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    !port_ready(port)
}

/// The engine version currently installed on disk (the `launcher.version`
/// marker written by `ensure_personal_launcher`), or None before first install.
/// This is the REAL installed engine — distinct from the verified/target
/// version in the lock — so the Updates panel can tell when an update is due.
pub(crate) fn installed_personal_version(app: &AppHandle) -> Option<String> {
    runtime_dir(app)
        .ok()
        .and_then(|dir| std::fs::read_to_string(dir.join("launcher.version")).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// A consistent, cold backup of Studio's own local deployment: stop the DB (if
/// running) so the copy can't catch a half-written file, copy the WHOLE
/// deployment directory (config + data), then restart it. Returns the backup
/// path. Never touches the source deployment. The DB is briefly unavailable
/// during the copy — this is an explicit, user-triggered action, not automatic.
pub(crate) fn backup_personal_deployment(app: &AppHandle, id: &str) -> AppResult<PathBuf> {
    let dir = personal_deployment_dir(app)?;
    if !dir.join("deployment.json").is_file() {
        return Err(AppError::Storage(
            "There's no local database to back up yet.".into(),
        ));
    }
    let cli = managed_exasol(app)?;
    let cli_s = cli.to_string_lossy().to_string();
    let ddir = dir.to_string_lossy().to_string();
    let port = expected_db_port(app);
    let was_running = port_ready(port);
    if was_running {
        emit_log(
            app,
            id,
            "Stopping the local database for a consistent backup…",
            "info",
        );
        // A backup taken from a live DB can catch half-written files, so refuse
        // to copy unless the engine actually stopped. On failure nothing has
        // been changed and the database is left running.
        if run_streamed(app, id, &cli_s, &["stop", "--deployment-dir", &ddir])? != 0 {
            return Err(AppError::Storage(
                "Could not stop the database for a consistent backup; the database was left running and nothing was changed.".into(),
            ));
        }
        if !wait_for_port_closed(port, Duration::from_secs(60)) {
            return Err(AppError::Storage(
                "The database did not shut down in time; backup aborted so it can't capture a live database.".into(),
            ));
        }
    }

    let backups = runtime_dir(app)?.join("backups");
    std::fs::create_dir_all(&backups)?;
    // Millisecond stamp keeps backups ordered and unique without a clock format
    // dependency; a `.partial` suffix during the copy means a crash mid-backup
    // never leaves a directory that looks like a finished backup.
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = backups.join(format!("deployment-{stamp}"));
    let partial = backups.join(format!(".deployment-{stamp}.partial"));
    let _ = std::fs::remove_dir_all(&partial);

    emit_log(app, id, "Backing up the local database…", "info");
    let copied = copy_dir_all(&dir, &partial);

    // Always bring the database back up, whether or not the copy succeeded.
    if was_running {
        emit_log(app, id, "Restarting the local database…", "info");
        let _ = run_streamed(app, id, &cli_s, &["start", "--deployment-dir", &ddir]);
        let _ = wait_for_port(app, id, port, Duration::from_secs(150));
    }

    match copied {
        Ok(()) => {
            std::fs::rename(&partial, &dest)?;
            emit_log(
                app,
                id,
                format!("Local database backed up to {}", dest.display()),
                "success",
            );
            Ok(dest)
        }
        Err(e) => {
            let _ = std::fs::remove_dir_all(&partial);
            Err(AppError::Storage(format!("Backup failed: {e}")))
        }
    }
}

/// Update the database ENGINE only, never the data. Ordered so the data is
/// always recoverable: back up first, keep the old engine binary, stop, swap in
/// the newer VERIFIED engine, restart + verify. On ANY failure, restore the old
/// engine binary AND the backed-up data, then restart the old engine. Never a
/// force update. Caller guarantees a newer verified engine exists and the
/// runtime is idle (see `update_component`).
///
/// NOTE: this path only runs once the verified lock advances the engine version
/// to one that is data-compatible with the existing deployment — which is an
/// ops decision (the lock never advances to an incompatible engine). Until then
/// it is unreachable (verified == installed), so it has not been exercised
/// against a real cross-version upgrade.
pub(crate) fn update_personal_engine(
    app: &AppHandle,
    id: &str,
    upstream: Option<(crate::component_lock::Artifact, String)>,
) -> AppResult<()> {
    let dir = personal_deployment_dir(app)?;
    if !dir.join("deployment.json").is_file() {
        return Err(AppError::Storage(
            "There's no local database to update.".into(),
        ));
    }
    let launcher = managed_exasol(app)?;
    if !launcher.is_file() {
        return Err(AppError::Storage(
            "The database engine isn't installed yet.".into(),
        ));
    }
    let launcher_s = launcher.to_string_lossy().to_string();
    let ddir = dir.to_string_lossy().to_string();

    // 1. Back up the data FIRST (stops+restarts for a consistent copy).
    let backup = backup_personal_deployment(app, id)?;

    // 2. Preserve the current engine binary + its version marker for rollback.
    let prev_bin = launcher.with_extension("prev");
    let _ = std::fs::remove_file(&prev_bin);
    std::fs::copy(&launcher, &prev_bin)?;
    let version_marker = runtime_dir(app)?.join("launcher.version");
    let old_version = installed_personal_version(app);

    // 3. Stop and CONFIRM shutdown before touching the engine binary — never
    // swap under a live database. If it won't stop, abort with everything still
    // intact (nothing swapped, data untouched, backup taken).
    let port = expected_db_port(app);
    emit_log(app, id, "Stopping the database to swap the engine…", "info");
    let stop_ok = run_streamed(app, id, &launcher_s, &["stop", "--deployment-dir", &ddir])
        .map(|code| code == 0)
        .unwrap_or(false);
    if !stop_ok || !wait_for_port_closed(port, Duration::from_secs(60)) {
        let _ = std::fs::remove_file(&prev_bin);
        return Err(AppError::Storage(format!(
            "Could not stop the database to swap the engine; nothing was changed. A backup is at {}.",
            backup.display()
        )));
    }
    // Clear the marker so the (newer) target build is actually installed.
    let _ = std::fs::remove_file(&version_marker);

    let swap = (|| -> AppResult<()> {
        let new_cli = match &upstream {
            // Official release: the digest-verified asset resolved by the caller.
            Some((artifact, version)) => install_personal_launcher_from(app, id, artifact, version)?,
            None => ensure_personal_launcher(app, id)?,
        };
        let new_cli_s = new_cli.to_string_lossy().to_string();
        emit_log(app, id, "Starting the updated engine…", "info");
        if run_streamed(app, id, &new_cli_s, &["start", "--deployment-dir", &ddir])? != 0 {
            return Err(AppError::Storage("The updated engine failed to start.".into()));
        }
        wait_for_port(app, id, port, Duration::from_secs(150))?;
        if !command_ok(&new_cli_s, &["info", "--deployment-dir", &ddir]) {
            return Err(AppError::Storage(
                "The updated engine started but `info` failed.".into(),
            ));
        }
        Ok(())
    })();

    match swap {
        Ok(()) => {
            let _ = std::fs::remove_file(&prev_bin);
            emit_log(app, id, "Database engine updated.", "success");
            Ok(())
        }
        Err(e) => {
            emit_log(
                app,
                id,
                format!("Engine update failed ({e}); restoring the previous engine and your data…"),
                "err",
            );
            // Restore the previous engine binary + its version marker first.
            // This is a file-level swap that doesn't touch the deployment data,
            // so it's safe regardless of DB state. A failed binary restore is
            // critical — report it (data untouched, backup intact).
            if let Err(be) = std::fs::copy(&prev_bin, &launcher) {
                return Err(AppError::Storage(format!(
                    "Engine update failed ({e}) and restoring the previous engine binary failed: {be}. Your data is untouched and a backup is at {}.",
                    backup.display()
                )));
            }
            let _ = std::fs::remove_file(&prev_bin);
            if let Some(v) = &old_version {
                let _ = std::fs::write(&version_marker, v);
            }
            // Confirm the failed attempt's engine is fully down BEFORE mutating
            // deployment data on disk. If it won't stop, do NOT rename/delete
            // the deployment under a live process — leave the data as-is (we
            // haven't touched it) and point at the intact backup.
            let _ = run_streamed(app, id, &launcher_s, &["stop", "--deployment-dir", &ddir]);
            if !wait_for_port_closed(port, Duration::from_secs(60)) {
                return Err(AppError::Storage(format!(
                    "Engine update failed ({e}); the previous engine binary was restored but the database could not be confirmed stopped, so your data was left untouched. A consistent backup is at {}. Restart the app to recover.",
                    backup.display()
                )));
            }
            // Restore the data from the backup — never leave a window with no
            // deployment: move the failed one aside FIRST, copy the backup into
            // place, and only drop the aside on success. If the copy fails, put
            // the failed deployment back. The backup at `backup` stays intact
            // regardless — we only ever copy FROM it.
            let aside = dir.with_extension("failed-update");
            if std::fs::remove_dir_all(&aside).is_err() && aside.exists() {
                return Err(AppError::Storage(format!(
                    "Engine update failed ({e}) and a stale `{}` blocks rollback; remove it and restore from the backup at {}.",
                    aside.display(),
                    backup.display()
                )));
            }
            let moved_aside = match std::fs::rename(&dir, &aside) {
                Ok(()) => true,
                Err(_) => {
                    // Couldn't move aside — clear dir directly. If THAT fails,
                    // abort rather than blindly proceed (backup stays intact).
                    match std::fs::remove_dir_all(&dir) {
                        Ok(()) => false,
                        Err(de) if de.kind() == std::io::ErrorKind::NotFound => false,
                        Err(de) => {
                            return Err(AppError::Storage(format!(
                                "Engine update failed ({e}) and the deployment could not be cleared for restore: {de}. Your backup is intact at {}.",
                                backup.display()
                            )))
                        }
                    }
                }
            };
            if let Err(re) = copy_dir_all(&backup, &dir) {
                let _ = std::fs::remove_dir_all(&dir);
                if moved_aside {
                    if let Err(rne) = std::fs::rename(&aside, &dir) {
                        return Err(AppError::Storage(format!(
                            "Engine update failed AND restoring the backup failed ({re}) AND recovering the prior deployment failed ({rne}). Your backup is intact at {}.",
                            backup.display()
                        )));
                    }
                }
                return Err(AppError::Storage(format!(
                    "Engine update failed AND restoring the backup failed: {re}. Your backup is intact at {}.",
                    backup.display()
                )));
            }
            if moved_aside {
                let _ = std::fs::remove_dir_all(&aside);
            }
            // Bring the old engine back up.
            let _ = run_streamed(app, id, &launcher_s, &["start", "--deployment-dir", &ddir]);
            let _ = wait_for_port(app, id, port, Duration::from_secs(150));
            Err(AppError::Storage(format!(
                "Engine update failed and was rolled back to the previous engine + data: {e}"
            )))
        }
    }
}

fn engine_owner_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(runtime_dir(app)?.join("container-engine"))
}

fn engine_program(name: &str) -> String {
    resolve_bin(name)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| name.into())
}

fn engine_name(program: &str) -> &'static str {
    if program.to_ascii_lowercase().contains("podman") {
        "podman"
    } else {
        "docker"
    }
}

fn persist_engine_owner(app: &AppHandle, program: &str) -> AppResult<()> {
    std::fs::write(engine_owner_path(app)?, engine_name(program))?;
    Ok(())
}

fn container_engine(app: &AppHandle) -> AppResult<String> {
    let owner = engine_owner_path(app)?;
    if let Ok(name) = std::fs::read_to_string(&owner) {
        let name = name.trim();
        if !matches!(name, "docker" | "podman") {
            return Err(AppError::Storage(
                "The saved Nano container-engine owner is invalid.".into(),
            ));
        }
        let program = engine_program(name);
        if command_ok(&program, &["info"]) {
            return Ok(program);
        }
        return Err(AppError::Storage(format!(
            "The managed Exasol Nano runtime belongs to {name}, but that engine is not running. Start {name} and retry."
        )));
    }

    let mut available = Vec::new();
    let mut existing: Option<String> = None;
    for name in ["docker", "podman"] {
        let program = engine_program(name);
        if !command_ok(&program, &["info"]) {
            continue;
        }
        if container_exists(&program) {
            if existing.is_some() {
                return Err(AppError::Storage(
                    "Both Docker and Podman contain an Exasol Studio Nano container; remove the duplicate before continuing."
                        .into(),
                ));
            }
            existing = Some(program.clone());
        }
        available.push(program);
    }
    if let Some(program) = existing {
        persist_engine_owner(app, &program)?;
        return Ok(program);
    }
    available.into_iter().next().ok_or_else(|| {
        AppError::Storage(
            "Exasol Nano requires a running Docker or Podman engine. Start one and retry.".into(),
        )
    })
}

fn container_exists(engine: &str) -> bool {
    command_ok(engine, &["container", "inspect", NANO_CONTAINER])
}

fn container_running(engine: &str) -> bool {
    Command::new(engine)
        .args([
            "container",
            "inspect",
            "-f",
            "{{.State.Running}}",
            NANO_CONTAINER,
        ])
        .output()
        .map(|out| out.status.success() && String::from_utf8_lossy(&out.stdout).trim() == "true")
        .unwrap_or(false)
}

fn container_uses_current_image(engine: &str) -> bool {
    let expected = crate::component_lock::components().nano.immutable_image();
    Command::new(engine)
        .args([
            "container",
            "inspect",
            "-f",
            "{{.Config.Image}}",
            NANO_CONTAINER,
        ])
        .output()
        .map(|output| {
            output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == expected
        })
        .unwrap_or(false)
}

fn first_deploy_args(engine: &str) -> bool {
    Command::new(engine)
        .args([
            "container",
            "inspect",
            "-f",
            "{{.Config.Cmd}}",
            NANO_CONTAINER,
        ])
        .output()
        .map(|out| {
            out.status.success()
                && String::from_utf8_lossy(&out.stdout).contains("sys_password_file")
        })
        .unwrap_or(false)
}

fn run_nano_container(
    app: &AppHandle,
    id: &str,
    engine: &str,
    secret: Option<&Path>,
) -> AppResult<()> {
    let image = crate::component_lock::components().nano.immutable_image();
    let mut args = vec![
        "run".to_string(),
        "-d".into(),
        "--name".into(),
        NANO_CONTAINER.into(),
        "--shm-size=512mb".into(),
        "--pids-limit=-1".into(),
        "-p".into(),
        format!("127.0.0.1:{PORT}:8563"),
        "-v".into(),
        format!("{NANO_VOLUME}:/exa"),
    ];
    if let Some(secret) = secret {
        let mut source = secret.to_string_lossy().replace('\\', "/");
        source.push_str(":/run/secrets/sys_password:ro");
        if engine.ends_with("podman") {
            source.push_str(",z");
        }
        args.extend(["-v".into(), source]);
    }
    args.push(image);
    if secret.is_some() {
        args.extend([
            "init".into(),
            "sys_password_file=/run/secrets/sys_password".into(),
        ]);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    if run_streamed(app, id, engine, &refs)? != 0 {
        return Err(AppError::Storage(
            "Exasol Nano container failed to start.".into(),
        ));
    }
    Ok(())
}

fn ensure_nano(app: &AppHandle, id: &str) -> AppResult<RuntimeConnection> {
    let engine = container_engine(app)?;
    let password_file = runtime_dir(app)?.join("credentials/nano_sys_password");
    let exists = container_exists(&engine);
    let password = match std::fs::read_to_string(&password_file) {
        Ok(value) if !value.trim().is_empty() => value.trim().to_owned(),
        _ if !exists => {
            let value = generated_password();
            write_secret(&password_file, &value)?;
            value
        }
        _ => return Err(AppError::Storage(format!(
            "The managed Nano container exists but its Studio credential is missing at {}. Refusing to replace it with an unrelated password; restore the credential or destroy and recreate the managed runtime.",
            password_file.display()
        ))),
    };
    if exists {
        if !container_uses_current_image(&engine) {
            let image = crate::component_lock::components().nano.immutable_image();
            if run_streamed(app, id, &engine, &["pull", &image])? != 0 {
                return Err(AppError::Storage(format!("Could not pull {image}.")));
            }
            if run_streamed(app, id, &engine, &["rm", "-f", NANO_CONTAINER])? != 0 {
                return Err(AppError::Storage(
                    "Could not replace the outdated Exasol Nano container.".into(),
                ));
            }
            run_nano_container(app, id, &engine, None)?;
        } else if !container_running(&engine) {
            if first_deploy_args(&engine) {
                if run_streamed(app, id, &engine, &["rm", "-f", NANO_CONTAINER])? != 0 {
                    return Err(AppError::Storage(
                        "Could not replace the first-deploy Nano container.".into(),
                    ));
                }
                run_nano_container(app, id, &engine, None)?;
            } else if run_streamed(app, id, &engine, &["start", NANO_CONTAINER])? != 0 {
                return Err(AppError::Storage(
                    "Could not start the existing Exasol Nano container.".into(),
                ));
            }
        }
    } else {
        if port_ready(PORT) {
            return Err(AppError::Storage(format!("Port {PORT} is already in use.")));
        }
        let image = crate::component_lock::components().nano.immutable_image();
        if run_streamed(app, id, &engine, &["pull", &image])? != 0 {
            return Err(AppError::Storage(format!("Could not pull {image}.")));
        }
        run_nano_container(app, id, &engine, Some(&password_file))?;
    }
    wait_for_port(app, id, PORT, Duration::from_secs(600))?;
    persist_engine_owner(app, &engine)?;
    Ok(RuntimeConnection {
        kind: "nano".into(),
        host: "127.0.0.1".into(),
        port: PORT,
        user: "sys".into(),
        password,
        engine: Some(engine),
    })
}

/// A local database already registered in the shared registry and answering
/// on its port.
///
/// Deploying a second Exasol when one is already running wastes ~170MB and
/// leaves the user guessing which copy holds their data. If the `exa` CLI (or
/// an earlier Studio run, or the starter kit) already registered a local
/// database that responds, Studio adopts it instead of bootstrapping its own.
pub fn adopt_shared_local() -> Option<RuntimeConnection> {
    let registry = crate::shared_registry::read_registry();
    for entry in registry.connections {
        let local = crate::shared_registry::is_local_host(&entry.host);
        if !local {
            continue;
        }
        if !port_answers(&entry.host, entry.port) {
            continue;
        }
        let Some(password) = crate::shared_registry::read_credential(&entry.id) else {
            continue; // no shared secret: cannot connect for the user
        };
        return Some(RuntimeConnection {
            kind: "adopted".into(),
            host: entry.host,
            port: entry.port,
            user: entry.user,
            password,
            engine: None,
        });
    }
    None
}

fn port_answers(host: &str, port: u16) -> bool {
    use std::net::{TcpStream, ToSocketAddrs};
    let Ok(mut addrs) = (host, port).to_socket_addrs() else {
        return false;
    };
    addrs.any(|addr| TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(500)).is_ok())
}

pub fn ensure_runtime(app: &AppHandle, id: &str) -> AppResult<RuntimeConnection> {
    // Reuse a running, already-registered local database before deploying one.
    if let Some(adopted) = adopt_shared_local() {
        emit_log(
            app,
            id,
            format!("Using the local Exasol already running on {}:{}", adopted.host, adopted.port),
            "info",
        );
        return Ok(adopted);
    }
    if std::env::consts::OS == "macos" {
        ensure_personal(app, id)
    } else {
        ensure_nano(app, id)
    }
}

pub fn runtime_installed(app: &AppHandle) -> bool {
    if std::env::consts::OS == "macos" {
        personal_deployment_dir(app)
            .map(|dir| dir.join("deployment.json").is_file())
            .unwrap_or(false)
    } else {
        engine_owner_path(app).is_ok_and(|path| path.is_file())
            || ["docker", "podman"].iter().any(|name| {
                let engine = engine_program(name);
                command_ok(&engine, &["info"]) && container_exists(&engine)
            })
    }
}

pub fn start_runtime(app: &AppHandle, id: &str) -> AppResult<RuntimeConnection> {
    ensure_runtime(app, id)
}

pub fn restart_personal_runtime(app: &AppHandle, id: &str) -> AppResult<RuntimeConnection> {
    if std::env::consts::OS != "macos" {
        return Err(AppError::Storage(
            "Native Exasol Personal recovery is only available on macOS.".into(),
        ));
    }
    let cli = exasol_cli(app)?.to_string_lossy().to_string();
    let deployment = personal_deployment_dir(app)?.to_string_lossy().to_string();
    emit_log(
        app,
        id,
        "The Personal endpoint is not query-ready; restarting the managed deployment once…",
        "info",
    );
    if run_streamed(app, id, &cli, &["stop", "--deployment-dir", &deployment])? != 0 {
        return Err(AppError::Storage(
            "Could not stop Exasol Personal during query-readiness recovery.".into(),
        ));
    }
    if run_streamed(app, id, &cli, &["start", "--deployment-dir", &deployment])? != 0 {
        return Err(AppError::Storage(
            "Could not restart Exasol Personal during query-readiness recovery.".into(),
        ));
    }
    wait_for_port(app, id, expected_db_port(app), Duration::from_secs(150))?;
    read_personal_connection(app)
}

pub fn control_runtime(app: &AppHandle, id: &str, action: &str) -> AppResult<i32> {
    if std::env::consts::OS == "macos" {
        let cli = exasol_cli(app)?.to_string_lossy().to_string();
        // Every action targets Studio's OWN deployment dir — never the shared
        // default one, so Studio can't destroy a deployment it doesn't own.
        let ddir = personal_deployment_dir(app)?.to_string_lossy().to_string();
        match action {
            "status" => {
                emit_log(
                    app,
                    id,
                    if port_ready(expected_db_port(app))
                        && command_ok(&cli, &["info", "--deployment-dir", &ddir])
                    {
                        "running"
                    } else {
                        "stopped"
                    },
                    "out",
                );
                Ok(0)
            }
            "info" => run_streamed(app, id, &cli, &["info", "--deployment-dir", &ddir]),
            "start" => {
                ensure_personal(app, id)?;
                Ok(0)
            }
            "stop" => run_streamed(app, id, &cli, &["stop", "--deployment-dir", &ddir]),
            "destroy" => run_streamed(
                app,
                id,
                &cli,
                &["destroy", "--remove", "--auto-approve", "--deployment-dir", &ddir],
            ),
            _ => Err(AppError::Storage(format!("Unsupported action: {action}"))),
        }
    } else {
        let engine = container_engine(app)?;
        match action {
            "status" => {
                emit_log(
                    app,
                    id,
                    if container_running(&engine) {
                        "running"
                    } else if container_exists(&engine) {
                        "stopped"
                    } else {
                        "not installed"
                    },
                    "out",
                );
                Ok(0)
            }
            "info" => run_streamed(app, id, &engine, &["container", "inspect", NANO_CONTAINER]),
            "start" => {
                ensure_nano(app, id)?;
                Ok(0)
            }
            "stop" => run_streamed(app, id, &engine, &["stop", "-t", "60", NANO_CONTAINER]),
            "destroy" => {
                let container = run_streamed(app, id, &engine, &["rm", "-f", NANO_CONTAINER])?;
                let volume = run_streamed(app, id, &engine, &["volume", "rm", NANO_VOLUME])?;
                if container == 0 && volume == 0 {
                    let _ = std::fs::remove_file(engine_owner_path(app)?);
                    Ok(0)
                } else {
                    Ok(1)
                }
            }
            _ => Err(AppError::Storage(format!("Unsupported action: {action}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retryable_status_retries_transient_not_client_errors() {
        // Transient: server + rate-limit + request-timeout.
        for s in [500u16, 502, 503, 504, 408, 429] {
            assert!(retryable_status(s), "{s} should retry");
        }
        // Fail fast: a bad URL / auth / plain client error won't self-heal.
        for s in [400u16, 401, 403, 404, 410, 200] {
            assert!(!retryable_status(s), "{s} should not retry");
        }
    }

    #[test]
    fn generated_password_is_long_ascii_alphanumeric() {
        let password = generated_password();
        assert_eq!(password.len(), 32);
        assert!(password.bytes().all(|byte| byte.is_ascii_alphanumeric()));
    }

    #[test]
    fn sha256_file_matches_known_digest() {
        let path = std::env::temp_dir().join(format!("exasol-studio-sha-{}", std::process::id()));
        std::fs::write(&path, b"abc").unwrap();
        let digest = sha256_file(&path).unwrap();
        let _ = std::fs::remove_file(path);
        assert_eq!(
            digest,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn nano_image_is_immutable() {
        let image = crate::component_lock::components().nano.immutable_image();
        assert!(image.starts_with("docker.io/exasol/nano@sha256:"));
        assert_eq!(image.rsplit(':').next().unwrap().len(), 64);
    }

    #[test]
    #[cfg(unix)]
    fn copy_dir_all_skips_unix_sockets() {
        let root = std::env::temp_dir().join(format!("exasol-studio-sock-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let src = root.join("src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("data.txt"), b"keep me").unwrap();
        // A live unix socket in the tree (like the VM runner's vm.sock).
        let _listener = std::os::unix::net::UnixListener::bind(src.join("vm.sock")).unwrap();
        let out = root.join("out");
        copy_dir_all(&src, &out).expect("socket must not fail the copy");
        assert_eq!(std::fs::read(out.join("data.txt")).unwrap(), b"keep me");
        assert!(!out.join("vm.sock").exists(), "socket is skipped, not copied");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn copy_dir_all_copies_nested_files_and_contents() {
        let root =
            std::env::temp_dir().join(format!("exasol-studio-copy-{}", std::process::id()));
        let src = root.join("src");
        let dst = root.join("dst");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(src.join("nested/deep")).unwrap();
        std::fs::write(src.join("top.txt"), b"top").unwrap();
        std::fs::write(src.join("nested/mid.txt"), b"mid").unwrap();
        std::fs::write(src.join("nested/deep/leaf.txt"), b"leaf").unwrap();

        copy_dir_all(&src, &dst).unwrap();

        assert_eq!(std::fs::read(dst.join("top.txt")).unwrap(), b"top");
        assert_eq!(std::fs::read(dst.join("nested/mid.txt")).unwrap(), b"mid");
        assert_eq!(
            std::fs::read(dst.join("nested/deep/leaf.txt")).unwrap(),
            b"leaf"
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}
