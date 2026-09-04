//! Public sharing transport: manage a cloudflared "quick tunnel" in front of the
//! isolated share server (agent-core), giving a laptop behind NAT a public URL
//! with no account and no port-forwarding. cloudflared is resolved from a managed
//! copy or PATH; the tunnel is a single child process whose stderr we scan for
//! the `*.trycloudflare.com` URL. Only the share server's localhost port is ever
//! tunneled — never the agent gateway.

use crate::error::{AppError, AppResult};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

/// The running cloudflared child, if any (one public tunnel at a time).
pub struct CloudflaredProc(pub Mutex<Option<Child>>);

impl Default for CloudflaredProc {
    fn default() -> Self {
        CloudflaredProc(Mutex::new(None))
    }
}

fn managed_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    let data = app.state::<crate::state::AppState>().data_dir.clone();
    let name = if cfg!(windows) { "cloudflared.exe" } else { "cloudflared" };
    data.join("personal-local").join("bin").join(name)
}

fn resolve_cloudflared(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let managed = managed_path(app);
    if managed.exists() {
        return Some(managed);
    }
    crate::market::resolve_bin("cloudflared")
}

/// The cloudflared release asset name for this platform.
fn asset_name() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("cloudflared-darwin-arm64.tgz"),
        ("macos", "x86_64") => Some("cloudflared-darwin-amd64.tgz"),
        ("linux", "aarch64") => Some("cloudflared-linux-arm64"),
        ("linux", "x86_64") => Some("cloudflared-linux-amd64"),
        ("windows", "x86_64") => Some("cloudflared-windows-amd64.exe"),
        _ => None,
    }
}

/// Download cloudflared into the managed bin dir (blocking; run off the async
/// runtime). macOS ships a .tgz — extracted with the system `tar`.
fn download_cloudflared(bin_dir: &std::path::Path) -> AppResult<std::path::PathBuf> {
    let asset = asset_name().ok_or_else(|| AppError::Storage("no cloudflared build for this platform".into()))?;
    let url = format!("https://github.com/cloudflare/cloudflared/releases/latest/download/{asset}");
    std::fs::create_dir_all(bin_dir)?;
    let name = if cfg!(windows) { "cloudflared.exe" } else { "cloudflared" };
    let dest = bin_dir.join(name);

    let bytes = reqwest::blocking::Client::builder()
        .build()
        .map_err(|e| AppError::Storage(e.to_string()))?
        .get(&url)
        .header("User-Agent", "exasol-studio")
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.bytes())
        .map_err(|e| AppError::Storage(format!("cloudflared download failed: {e}")))?;

    if asset.ends_with(".tgz") {
        let tgz = bin_dir.join("cloudflared.tgz");
        std::fs::write(&tgz, &bytes)?;
        let status = Command::new("tar").arg("xzf").arg(&tgz).arg("-C").arg(bin_dir).status();
        let _ = std::fs::remove_file(&tgz);
        if !status.map(|s| s.success()).unwrap_or(false) {
            return Err(AppError::Storage("failed to extract cloudflared archive".into()));
        }
    } else {
        std::fs::write(&dest, &bytes)?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755));
    }
    if !dest.exists() {
        return Err(AppError::Storage("cloudflared binary missing after download".into()));
    }
    Ok(dest)
}

/// Ensure cloudflared is available, downloading it on first use. Returns its path.
#[tauri::command]
pub async fn cloudflared_ensure(app: tauri::AppHandle) -> AppResult<String> {
    if let Some(p) = resolve_cloudflared(&app) {
        return Ok(p.to_string_lossy().into_owned());
    }
    let bin_dir = managed_path(&app).parent().map(|p| p.to_path_buf()).ok_or_else(|| AppError::Storage("bad bin dir".into()))?;
    let path = tokio::task::spawn_blocking(move || download_cloudflared(&bin_dir))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))??;
    Ok(path.to_string_lossy().into_owned())
}

/// Pull the first `https://…trycloudflare.com` token out of a log line.
fn extract_url(line: &str) -> Option<String> {
    let idx = line.find("https://")?;
    let url: String = line[idx..]
        .chars()
        .take_while(|c| !c.is_whitespace() && *c != '|')
        .collect();
    if url.contains("trycloudflare.com") {
        Some(url)
    } else {
        None
    }
}

/// Start a quick tunnel to the given localhost port; returns the public URL.
#[tauri::command]
pub async fn cloudflared_start(app: tauri::AppHandle, port: u16) -> AppResult<String> {
    let bin = resolve_cloudflared(&app).ok_or_else(|| {
        AppError::Storage(
            "cloudflared is not installed — public sharing needs it (install with `brew install cloudflared`, or use LAN / snapshot sharing instead)."
                .into(),
        )
    })?;

    // Replace any prior tunnel.
    let _ = stop_inner(&app);

    let mut child = Command::new(&bin)
        .args([
            "tunnel",
            "--url",
            &format!("http://127.0.0.1:{port}"),
            "--no-autoupdate",
            // Force HTTP/2 (TCP) — the default QUIC uses UDP 7844, which many
            // networks block, and then the tunnel never registers (Cloudflare 1033).
            "--protocol",
            "http2",
        ])
        .stdout(std::process::Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Storage(format!("failed to start cloudflared: {e}")))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Storage("cloudflared produced no stderr".into()))?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        // Return the URL only AFTER the tunnel actually registers with the edge —
        // cloudflared prints the URL early ("may take some time to be reachable"),
        // so returning it too soon hands the user a link that 1033s. Then KEEP
        // draining stderr for the tunnel's whole life, or its pipe fills (~64KB)
        // and cloudflared blocks on write, stalling the tunnel.
        let mut url: Option<String> = None;
        let mut sent = false;
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if url.is_none() {
                if let Some(u) = extract_url(&line) {
                    url = Some(u);
                }
            }
            if !sent {
                if let Some(u) = &url {
                    if line.contains("Registered tunnel connection") {
                        let _ = tx.send(u.clone());
                        sent = true;
                    }
                }
            }
        }
    });

    match rx.recv_timeout(std::time::Duration::from_secs(45)) {
        Ok(url) => {
            *app.state::<CloudflaredProc>().0.lock().unwrap() = Some(child);
            Ok(url)
        }
        Err(_) => {
            let _ = child.kill();
            Err(AppError::Storage(
                "cloudflared did not produce a public URL in time — check your network and try again.".into(),
            ))
        }
    }
}

fn stop_inner(app: &tauri::AppHandle) -> AppResult<()> {
    if let Some(mut child) = app.state::<CloudflaredProc>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
    Ok(())
}

/// Stop the public tunnel (safe to call when none is running).
#[tauri::command]
pub async fn cloudflared_stop(app: tauri::AppHandle) -> AppResult<()> {
    stop_inner(&app)
}

#[cfg(test)]
mod tests {
    use super::extract_url;

    #[test]
    fn parses_the_trycloudflare_url_from_a_boxed_log_line() {
        assert_eq!(
            extract_url("2026-09-03 INF |  https://brave-fox-123.trycloudflare.com  |"),
            Some("https://brave-fox-123.trycloudflare.com".to_string())
        );
    }

    #[test]
    fn ignores_unrelated_https_lines() {
        assert_eq!(extract_url("see https://developers.cloudflare.com/docs"), None);
        assert_eq!(extract_url("no url here"), None);
    }
}
