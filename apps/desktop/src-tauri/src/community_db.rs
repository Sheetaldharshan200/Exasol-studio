//! Exasol Community database — the full Exasol 8 `exasol/docker-db` image
//! (BucketFS, virtual schemas, extensions; up to 10 GiB of data) managed as a
//! Marketplace card: Docker checks, LIVE version tags from Docker Hub, pull +
//! run with the officially documented flags, and start/stop/remove lifecycle.
//!
//! Facts from exasol/docker-db (verified): linux/amd64 only, --privileged
//! required, DB port 8563 in-container, BucketFS https on 2581, data under
//! /exa (persist via a named volume), default credentials sys / exasol.
//! Upstream supports Docker on Linux; on Apple Silicon it runs amd64-emulated
//! — offered, but labelled experimental.

use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::market::{emit_log, resolve_bin, run_streamed};
use crate::state::AppState;

pub const JOB_ID: &str = "community-db";
const IMAGE: &str = "exasol/docker-db";
const CONTAINER: &str = "exasol-studio-community";
const VOLUME: &str = "exasol-studio-community-data";
/// Host ports — deliberately off Personal (8565) and Nano (8563).
const DB_PORT: u16 = 8574;
const BUCKETFS_PORT: u16 = 2581;
const PROFILE_NAME: &str = "Exasol Community (Docker)";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityStatus {
    pub docker_installed: bool,
    pub engine_running: bool,
    pub os: String,
    pub arch: String,
    /// amd64 host → native; anything else runs the image emulated.
    pub native: bool,
    pub container_exists: bool,
    pub running: bool,
    /// The image tag of the existing container, when one exists.
    pub tag: Option<String>,
    pub db_port: u16,
    pub bucketfs_port: u16,
    pub user: &'static str,
}

fn docker() -> Option<String> {
    resolve_bin("docker").map(|p| p.to_string_lossy().to_string())
}

fn docker_ok(bin: &str, args: &[&str]) -> bool {
    Command::new(bin).args(args).output().map(|o| o.status.success()).unwrap_or(false)
}

fn inspect(bin: &str) -> (bool, bool, Option<String>) {
    let out = Command::new(bin)
        .args(["inspect", "-f", "{{.State.Running}}\t{{.Config.Image}}", CONTAINER])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            let mut parts = text.trim().split('\t');
            let running = parts.next().is_some_and(|v| v == "true");
            let tag = parts
                .next()
                .and_then(|img| img.rsplit(':').next().map(|t| t.to_string()))
                .filter(|t| !t.is_empty());
            (true, running, tag)
        }
        _ => (false, false, None),
    }
}

fn status_now() -> CommunityStatus {
    let bin = docker();
    let engine_running = bin.as_deref().map(|b| docker_ok(b, &["info"])).unwrap_or(false);
    let (container_exists, running, tag) = match (&bin, engine_running) {
        (Some(b), true) => inspect(b),
        _ => (false, false, None),
    };
    CommunityStatus {
        docker_installed: bin.is_some(),
        engine_running,
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        native: std::env::consts::ARCH == "x86_64",
        container_exists,
        running,
        tag,
        db_port: DB_PORT,
        bucketfs_port: BUCKETFS_PORT,
        user: "sys",
    }
}

#[tauri::command]
pub fn community_status() -> AppResult<CommunityStatus> {
    Ok(status_now())
}

/// Version-shaped docker-db tags (e.g. "2026.1.1"), newest first — drops
/// aliases like "latest"/"latest-8". Pure, so the ordering is testable.
pub(crate) fn version_tags<I: IntoIterator<Item = String>>(names: I) -> Vec<String> {
    fn key(v: &str) -> Option<Vec<u64>> {
        let parts: Vec<&str> = v.split('.').collect();
        if parts.len() < 2 || parts.len() > 4 {
            return None;
        }
        parts.iter().map(|p| p.parse::<u64>().ok()).collect()
    }
    let mut tags: Vec<(Vec<u64>, String)> =
        names.into_iter().filter_map(|n| key(&n).map(|k| (k, n))).collect();
    tags.sort_by(|a, b| b.0.cmp(&a.0));
    tags.into_iter().map(|(_, n)| n).collect()
}

/// LIVE tag list from Docker Hub (no auth, generous rate limits — unlike the
/// GitHub API). Newest first.
#[tauri::command]
pub fn community_versions() -> AppResult<Vec<String>> {
    let url = format!("https://hub.docker.com/v2/repositories/{IMAGE}/tags?page_size=50");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let body: serde_json::Value = client
        .get(&url)
        .header("User-Agent", "exasol-studio")
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.json())
        .map_err(|e| AppError::Storage(format!("Could not list docker-db versions from Docker Hub: {e}")))?;
    let names = body["results"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|t| t["name"].as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(version_tags(names))
}

fn require_engine() -> AppResult<String> {
    let Some(bin) = docker() else {
        return Err(AppError::Storage(
            "Docker is not installed. macOS: `brew install colima docker` then `colima start` (no admin needed); Windows/Linux: install Docker Desktop or the docker package — then retry.".into(),
        ));
    };
    if !docker_ok(&bin, &["info"]) {
        return Err(AppError::Storage(
            "Docker is installed but not running. Start it (`colima start`, or launch Docker Desktop), then retry.".into(),
        ));
    }
    Ok(bin)
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port),
        Duration::from_secs(1),
    )
    .is_ok()
}

fn wait_ready(app: &AppHandle, timeout: Duration) -> AppResult<()> {
    let started = std::time::Instant::now();
    let mut last = 0;
    while started.elapsed() < timeout {
        if port_open(DB_PORT) {
            return Ok(());
        }
        let secs = started.elapsed().as_secs();
        if secs >= last + 30 {
            last = secs;
            emit_log(app, JOB_ID, format!("Community database is still initializing ({secs}s — the first boot takes a few minutes)…"), "info");
        }
        std::thread::sleep(Duration::from_secs(5));
    }
    Err(AppError::Storage(format!(
        "The Community database did not open 127.0.0.1:{DB_PORT} within {} seconds. `docker logs {CONTAINER}` shows the boot progress.",
        timeout.as_secs()
    )))
}

/// Pull the chosen tag and run the container with the officially documented
/// flags, then register the connection profile (sys/exasol) once it answers.
#[tauri::command]
pub fn community_install(app: AppHandle, tag: String) -> AppResult<CommunityStatus> {
    if !tag.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) || tag.is_empty() {
        return Err(AppError::Storage(format!("Invalid image tag: {tag}")));
    }
    let bin = require_engine()?;
    let (exists, _, _) = inspect(&bin);
    if exists {
        return Err(AppError::Storage(
            "A Community container already exists — start it, or remove it first to install a different version.".into(),
        ));
    }
    if port_open(DB_PORT) {
        return Err(AppError::Storage(format!(
            "Port {DB_PORT} is already in use by another program — free it, then retry."
        )));
    }
    let emulated = std::env::consts::ARCH != "x86_64";
    if emulated {
        emit_log(
            &app,
            JOB_ID,
            "This host is not x86-64: the amd64 image runs EMULATED (upstream supports Docker on Linux only). Experimental — expect slower startup and queries.",
            "info",
        );
    }
    let image = format!("{IMAGE}:{tag}");
    let mut pull: Vec<&str> = vec!["pull"];
    if emulated {
        pull.extend(["--platform", "linux/amd64"]);
    }
    pull.push(&image);
    if run_streamed(&app, JOB_ID, &bin, &pull)? != 0 {
        return Err(AppError::Storage(format!("`docker pull {image}` failed.")));
    }

    let db_map = format!("127.0.0.1:{DB_PORT}:8563");
    let bfs_map = format!("127.0.0.1:{BUCKETFS_PORT}:2581");
    let vol = format!("{VOLUME}:/exa");
    let mut run: Vec<&str> = vec![
        "run", "--name", CONTAINER, "--detach", "--privileged", "--stop-timeout", "120",
        "-p", &db_map, "-p", &bfs_map, "-v", &vol,
    ];
    if emulated {
        run.extend(["--platform", "linux/amd64"]);
    }
    run.push(&image);
    if run_streamed(&app, JOB_ID, &bin, &run)? != 0 {
        return Err(AppError::Storage("`docker run` for the Community database failed — the streamed log above has the engine's reason.".into()));
    }
    wait_ready(&app, Duration::from_secs(600))?;
    let _ = crate::profiles::ensure_local_profile(
        &app.state::<AppState>(),
        PROFILE_NAME,
        "127.0.0.1",
        DB_PORT,
        "sys",
        "exasol",
    );
    emit_log(&app, JOB_ID, format!("Community database is up: 127.0.0.1:{DB_PORT} (sys/exasol) · BucketFS https on {BUCKETFS_PORT} · data persisted in the `{VOLUME}` volume."), "info");
    Ok(status_now())
}

/// start | stop | remove (container kept-volume) | destroy (container + data).
#[tauri::command]
pub fn community_control(app: AppHandle, action: String) -> AppResult<CommunityStatus> {
    let bin = require_engine()?;
    match action.as_str() {
        "start" => {
            if run_streamed(&app, JOB_ID, &bin, &["start", CONTAINER])? != 0 {
                return Err(AppError::Storage("Could not start the Community container.".into()));
            }
            wait_ready(&app, Duration::from_secs(420))?;
            let _ = crate::profiles::ensure_local_profile(
                &app.state::<AppState>(),
                PROFILE_NAME,
                "127.0.0.1",
                DB_PORT,
                "sys",
                "exasol",
            );
        }
        "stop" => {
            // --stop-timeout 120 on the container gives the DB a clean shutdown.
            if run_streamed(&app, JOB_ID, &bin, &["stop", CONTAINER])? != 0 {
                return Err(AppError::Storage("Could not stop the Community container.".into()));
            }
        }
        "remove" => {
            let _ = run_streamed(&app, JOB_ID, &bin, &["rm", "-f", CONTAINER]);
            emit_log(&app, JOB_ID, format!("Container removed. Data volume `{VOLUME}` kept — reinstalling any version reuses it."), "info");
        }
        "destroy" => {
            let _ = run_streamed(&app, JOB_ID, &bin, &["rm", "-f", CONTAINER]);
            let _ = run_streamed(&app, JOB_ID, &bin, &["volume", "rm", VOLUME]);
            emit_log(&app, JOB_ID, "Container and data volume removed.", "info");
        }
        other => return Err(AppError::Storage(format!("Unsupported action: {other}"))),
    }
    Ok(status_now())
}

#[cfg(test)]
mod tests {
    use super::version_tags;

    #[test]
    fn drops_aliases_and_sorts_numerically_desc() {
        let names = [
            "latest", "latest-8", "latest-2025.1", "2025.1.9", "2025.1.16", "2026.1.1", "8.34.0", "not-a-version",
        ]
        .map(String::from);
        assert_eq!(
            version_tags(names),
            vec!["2026.1.1", "2025.1.16", "2025.1.9", "8.34.0"]
        );
    }

    #[test]
    fn numeric_not_lexicographic() {
        let names = ["2025.1.2", "2025.1.10"].map(String::from);
        assert_eq!(version_tags(names), vec!["2025.1.10", "2025.1.2"]);
    }

    #[test]
    fn empty_and_garbage_yield_empty() {
        assert!(version_tags(Vec::<String>::new()).is_empty());
        assert!(version_tags(["", "abc", "1", "a.b.c"].map(String::from)).is_empty());
    }
}
