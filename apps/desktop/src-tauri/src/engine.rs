//! Exa engine (opencode) install + resolution (exa-agent-v2, task 4.x).
//!
//! The engine binary is a Marketplace component whose SOURCE OF TRUTH is
//! opencode's GitHub Releases. This module maps the platform to the right
//! release asset (parity with agent-core's `engine/opencode-release.ts`),
//! downloads + extracts it into the component directory, records
//! `installed.json`, and resolves the runnable binary path (component dir,
//! falling back to a bundled baseline). Actual downloads need the network +
//! a real release, so E2E is out of scope for unit tests; the pure
//! platform→asset mapping IS tested and mirrors the TS side.

use std::fs::File;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::components_update::{component_dir, write_manifest, ComponentId, InstalledManifest};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const EXA_REPO: &str = "Sheetaldharshan200/exa-engine";

/// The offline fallback tag: what the bundled baseline was built from
/// (scripts/fetch-runtime.mjs resolves the real latest at build time). Live
/// installs never pin — "latest" resolves against the engine repo's releases,
/// so the sidecar always speaks the current engine's feature set (providers,
/// subscription sign-in, database tools).
pub const ENGINE_BASELINE_TAG: &str = "v2026.1.82";

/// Resolve the tag to install: "latest" asks the release API (digest-verified
/// helper), anything else is used verbatim. Offline, the bundled baseline tag
/// keeps installs working rather than failing on a network lookup.
pub fn resolve_engine_tag(tag: &str) -> String {
    if tag != "latest" {
        return tag.to_string();
    }
    crate::upstream::latest(EXA_REPO)
        .map(|r| r.tag)
        .unwrap_or_else(|| ENGINE_BASELINE_TAG.to_string())
}

/// The release asset filename for an (os, arch), or None when unsupported.
/// Mirrors agent-core `engine/opencode-release.ts::assetFor`.
pub fn asset_for(os: &str, arch: &str) -> Option<String> {
    let a = match arch {
        "aarch64" | "arm64" => "arm64",
        "x86_64" | "x64" => "x64",
        _ => return None,
    };
    Some(match os {
        "macos" => format!("exa-darwin-{a}.zip"),
        "linux" => format!("exa-linux-{a}.tar.gz"),
        "windows" => format!("exa-windows-{a}.zip"),
        _ => return None,
    })
}

fn binary_name() -> &'static str {
    if std::env::consts::OS == "windows" {
        "exa.exe"
    } else {
        "exa"
    }
}

/// Pre-exa.14 archives shipped the binary under the upstream name; existing
/// component installs and cached bundles keep working through this fallback.
fn legacy_binary_name() -> &'static str {
    if std::env::consts::OS == "windows" {
        "opencode.exe"
    } else {
        "opencode"
    }
}

/// The installed component copy of the engine binary, if present.
pub fn engine_binary_path(data_dir: &Path) -> Option<PathBuf> {
    let bin_dir = component_dir(data_dir, ComponentId::ExaAgent).join("bin");
    let installed = bin_dir.join(binary_name());
    if installed.exists() {
        return Some(installed);
    }
    let legacy = bin_dir.join(legacy_binary_name());
    legacy.exists().then_some(legacy)
}

/// Recursively find the engine binary inside a directory (the bundled archive
/// layout varies by platform, so we search rather than assume a fixed path).
fn find_binary(dir: &Path, depth: u8) -> Option<PathBuf> {
    if depth > 4 {
        return None;
    }
    let entries = std::fs::read_dir(dir).ok()?;
    let mut subdirs = Vec::new();
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            subdirs.push(p);
        } else if p.file_name().map(|n| n == binary_name() || n == legacy_binary_name()).unwrap_or(false) {
            return Some(p);
        }
    }
    subdirs.into_iter().find_map(|d| find_binary(&d, depth + 1))
}

/// The baseline engine bundled beside the app's other runtimes
/// (resources/runtime/exa-engine), or None in a dev build without it.
pub fn bundled_engine_path(app: &AppHandle) -> Option<PathBuf> {
    let base = app
        .path()
        .resolve("runtime/exa-engine", tauri::path::BaseDirectory::Resource)
        .ok()?;
    find_binary(&base, 0)
}

/// The engine binary Studio runs: the independently-installed component copy
/// first, then the bundled baseline — so a fresh install works offline and an
/// update moves it forward without touching the app.
pub fn resolve_engine_binary(app: &AppHandle, data_dir: &Path) -> Option<PathBuf> {
    // An app update must never be shadowed by a STALE independent install:
    // the component copy wins only while it is at least as new as the
    // baseline this app ships (verified live 2026-08-12: an exa.1 component
    // kept serving pre-branding binaries under an exa.3 app).
    if let Some(component) = engine_binary_path(data_dir) {
        let installed = crate::components_update::read_manifest(data_dir, ComponentId::ExaAgent).map(|m| m.version);
        let stale = installed
            .as_deref()
            .map(|v| crate::components_update::is_newer(ENGINE_BASELINE_TAG, v))
            .unwrap_or(false);
        if !stale {
            return Some(component);
        }
        if let Some(baseline) = bundled_engine_path(app) {
            return Some(baseline);
        }
        return Some(component);
    }
    bundled_engine_path(app)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInstallStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub binary_path: Option<String>,
}

#[tauri::command]
pub fn engine_status(app: AppHandle, state: State<'_, AppState>) -> AppResult<EngineInstallStatus> {
    let data_dir = &state.data_dir;
    let manifest = crate::components_update::read_manifest(data_dir, ComponentId::ExaAgent);
    // Installed component copy OR the bundled baseline both count as usable.
    let path = resolve_engine_binary(&app, data_dir);
    Ok(EngineInstallStatus {
        installed: path.is_some(),
        version: manifest.map(|m| m.version).or_else(|| bundled_engine_path(&app).map(|_| "bundled".to_string())),
        binary_path: path.map(|p| p.to_string_lossy().to_string()),
    })
}

/// Download + extract the opencode release for `tag` into the Exa agent
/// component dir + record the installed version. Blocking; called from the
/// engine_install command AND the Managed Components install dispatch, so the
/// engine installs/updates through the same UI as exapump. The component is
/// isolated, so a bad extract never touches app files or the bundled baseline.
pub fn install_engine(data_dir: &Path, tag: &str) -> AppResult<EngineInstallStatus> {
    let tag = &resolve_engine_tag(tag);
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let asset =
        asset_for(os, arch).ok_or_else(|| AppError::InvalidSettings(format!("No Exa engine build for {os}/{arch}.")))?;
    let url = format!("https://github.com/{EXA_REPO}/releases/download/{tag}/{asset}");

    let dir = component_dir(data_dir, ComponentId::ExaAgent);
    let bin_dir = dir.join("bin");
    // Clean prior payload so an update never mixes versions.
    let _ = std::fs::remove_dir_all(&bin_dir);
    std::fs::create_dir_all(&bin_dir)?;
    let archive = dir.join(&asset);

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| AppError::Storage(format!("http client: {e}")))?;
    let mut resp = client
        .get(&url)
        .send()
        .map_err(|e| AppError::Storage(format!("Engine download failed: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Storage(format!("Engine download failed: {} for {url}", resp.status())));
    }
    let mut out = File::create(&archive)?;
    std::io::copy(&mut resp, &mut out)?;
    drop(out);

    if asset.ends_with(".zip") {
        extract_zip(&archive, &bin_dir)?;
    } else {
        let decoder = flate2::read::GzDecoder::new(File::open(&archive)?);
        tar::Archive::new(decoder).unpack(&bin_dir)?;
    }
    let _ = std::fs::remove_file(&archive);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let bin = bin_dir.join(binary_name());
        if bin.exists() {
            let mut perms = std::fs::metadata(&bin)?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&bin, perms)?;
        }
    }

    let version = tag.trim_start_matches('v').to_string();
    write_manifest(
        data_dir,
        ComponentId::ExaAgent,
        &InstalledManifest {
            version: version.clone(),
            installed_at: chrono::Utc::now().to_rfc3339(),
            channel: Some("opencode-release".into()),
        },
    )?;
    let path = engine_binary_path(data_dir);
    Ok(EngineInstallStatus {
        installed: path.is_some(),
        version: Some(version),
        binary_path: path.map(|p| p.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub async fn engine_install(app: AppHandle, tag: String) -> AppResult<EngineInstallStatus> {
    let data_dir = app.state::<AppState>().data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || install_engine(&data_dir, &tag))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
}

// ── exa CLI (install-to-PATH) ───────────────────────────────────────────────

/// Where the `exa` CLI shim is installed for this OS. Unix: ~/.local/bin/exa
/// (a directory conventionally on PATH); Windows: %LOCALAPPDATA%\Exasol\bin\
/// exa.cmd. Pure given the home dir, so it is testable.
pub fn cli_shim_path(home: &Path) -> PathBuf {
    if std::env::consts::OS == "windows" {
        home.join("AppData").join("Local").join("Exasol").join("bin").join("exa.cmd")
    } else {
        home.join(".local").join("bin").join("exa")
    }
}

/// The shim contents: a tiny launcher that runs the installed engine binary as
/// the `exa` CLI, pinned to Studio's config dir so app + CLI share sessions.
pub fn cli_shim_contents(engine_binary: &Path, config_dir: &Path) -> String {
    let bin = engine_binary.to_string_lossy();
    let cfg = config_dir.to_string_lossy();
    if std::env::consts::OS == "windows" {
        format!(
            "@echo off\r\nset \"EXA_CONFIG_DIR={cfg}\"\r\nset \"XDG_DATA_HOME={cfg}\"\r\nset \"XDG_CONFIG_HOME={cfg}\"\r\n\"{bin}\" %*\r\n"
        )
    } else {
        // Sandbox and ops are native engine commands since exa.14; the shim
        // only pins the config dir so app + CLI share the same engine state.
        format!(
            r#"#!/bin/sh
export EXA_CONFIG_DIR="{cfg}"
export XDG_DATA_HOME="{cfg}"
export XDG_CONFIG_HOME="{cfg}"
exec "{bin}" "$@"
"#
        )
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    pub installed: bool,
    pub path: Option<String>,
}

#[tauri::command]
pub fn engine_cli_status(state: State<'_, AppState>) -> AppResult<CliStatus> {
    let home = dirs::home_dir().ok_or_else(|| AppError::Storage("no home directory".into()))?;
    let _ = &state;
    let shim = cli_shim_path(&home);
    Ok(CliStatus {
        installed: shim.exists(),
        path: shim.exists().then(|| shim.to_string_lossy().to_string()),
    })
}

/// Install (or refresh) the `exa` CLI shim to PATH, pointing at the installed
/// engine binary. Requires the engine component to be installed.
#[tauri::command]
pub fn engine_install_cli(app: AppHandle, state: State<'_, AppState>) -> AppResult<CliStatus> {
    let data_dir = &state.data_dir;
    let bin = resolve_engine_binary(&app, data_dir)
        .ok_or_else(|| AppError::InvalidSettings("Install the Exa engine first, then install the CLI.".into()))?;
    let cfg_dir = component_dir(data_dir, ComponentId::ExaAgent).join("config");
    std::fs::create_dir_all(&cfg_dir)?;
    let home = dirs::home_dir().ok_or_else(|| AppError::Storage("no home directory".into()))?;
    let shim = cli_shim_path(&home);
    if let Some(parent) = shim.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&shim, cli_shim_contents(&bin, &cfg_dir))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&shim)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&shim, perms)?;
    }
    Ok(CliStatus { installed: true, path: Some(shim.to_string_lossy().to_string()) })
}

#[tauri::command]
pub fn engine_uninstall_cli() -> AppResult<()> {
    let home = dirs::home_dir().ok_or_else(|| AppError::Storage("no home directory".into()))?;
    let shim = cli_shim_path(&home);
    if shim.exists() {
        std::fs::remove_file(&shim)?;
    }
    Ok(())
}

fn extract_zip(archive: &Path, dest: &Path) -> AppResult<()> {
    let file = File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| AppError::Storage(format!("zip open: {e}")))?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| AppError::Storage(format!("zip entry: {e}")))?;
        let name = entry.name().to_string();
        // Flatten: we only want the binary, wherever it sits in the archive.
        let base = Path::new(&name).file_name().map(|s| s.to_os_string());
        let Some(base) = base else { continue };
        if entry.is_dir() {
            continue;
        }
        let target = dest.join(&base);
        let mut out = File::create(&target)?;
        std::io::copy(&mut entry, &mut out)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors packages/agent-core/src/engine/opencode-release.test.ts so the
    // Rust installer and the TS mapper can never disagree on asset names.
    #[test]
    fn asset_for_matches_the_ts_mapper() {
        assert_eq!(asset_for("macos", "aarch64").as_deref(), Some("exa-darwin-arm64.zip"));
        assert_eq!(asset_for("macos", "x86_64").as_deref(), Some("exa-darwin-x64.zip"));
        assert_eq!(asset_for("linux", "aarch64").as_deref(), Some("exa-linux-arm64.tar.gz"));
        assert_eq!(asset_for("linux", "x86_64").as_deref(), Some("exa-linux-x64.tar.gz"));
        assert_eq!(asset_for("windows", "x86_64").as_deref(), Some("exa-windows-x64.zip"));
        assert_eq!(asset_for("windows", "aarch64").as_deref(), Some("exa-windows-arm64.zip"));
    }

    #[test]
    fn asset_for_rejects_unsupported() {
        assert_eq!(asset_for("freebsd", "x86_64"), None);
        assert_eq!(asset_for("linux", "riscv64"), None);
    }

    #[test]
    fn cli_shim_path_is_on_a_path_dir() {
        let home = Path::new("/home/u");
        let p = cli_shim_path(home);
        if std::env::consts::OS == "windows" {
            assert!(p.ends_with("exa.cmd"));
        } else {
            assert_eq!(p, Path::new("/home/u/.local/bin/exa"));
        }
    }

    #[test]
    fn cli_shim_pins_config_and_execs_the_binary() {
        let s = cli_shim_contents(Path::new("/opt/exa/opencode"), Path::new("/data/exa/config"));
        assert!(s.contains("/opt/exa/opencode"));
        assert!(s.contains("/data/exa/config"));
        // Config-dir env is set so the CLI shares sessions with the app.
        assert!(s.contains("EXA_CONFIG_DIR"));
        if std::env::consts::OS != "windows" {
            assert!(s.starts_with("#!/bin/sh"));
            assert!(s.contains("exec "));
        }
    }
}
