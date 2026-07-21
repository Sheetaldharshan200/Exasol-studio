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
use std::time::{Duration, Instant};
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
    let mut response = reqwest::blocking::Client::new()
        .get(url)
        .header("User-Agent", "exasol-studio")
        .send()
        .map_err(|e| AppError::Storage(format!("could not download {url}: {e}")))?
        .error_for_status()
        .map_err(|e| AppError::Storage(format!("download failed for {url}: {e}")))?;
    let mut file = File::create(&partial)?;
    response
        .copy_to(&mut file)
        .map_err(|e| AppError::Storage(format!("could not save download: {e}")))?;
    file.flush()?;
    let actual = sha256_file(&partial)?;
    if !actual.eq_ignore_ascii_case(expected_sha256) {
        let _ = std::fs::remove_file(&partial);
        return Err(AppError::Storage(format!(
            "checksum mismatch for {url}: expected {expected_sha256}, got {actual}"
        )));
    }
    if destination.exists() {
        std::fs::remove_file(destination)?;
    }
    std::fs::rename(partial, destination)?;
    Ok(())
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
        format!(
            "Downloading verified Exasol Personal {}…",
            component.version
        ),
        "info",
    );
    download_verified(&artifact.url, &archive, &artifact.sha256)?;
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
    let expected_binary = artifact.executable_sha256.as_ref().ok_or_else(|| {
        AppError::Storage("The generated Personal lock has no executable checksum.".into())
    })?;
    let actual_binary = sha256_file(&target)?;
    if !actual_binary.eq_ignore_ascii_case(expected_binary) {
        let _ = std::fs::remove_file(&target);
        return Err(AppError::Storage(format!(
            "Exasol Personal executable checksum mismatch: expected {expected_binary}, got {actual_binary}."
        )));
    }
    std::fs::write(version_marker, &component.version)?;
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

/// The shared default-dir deployment other tools manage. Detection only —
/// Studio never operates on it.
fn legacy_deployment_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".exasol/personal/deployments/default"))
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
        if port_ready(STUDIO_DB_PORT) {
            return Err(AppError::Storage(format!(
                "Port {STUDIO_DB_PORT} is already in use and is not the managed Exasol Personal deployment."
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

pub fn ensure_runtime(app: &AppHandle, id: &str) -> AppResult<RuntimeConnection> {
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
}
