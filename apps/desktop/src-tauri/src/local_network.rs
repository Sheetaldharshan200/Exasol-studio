//! macOS Local Network privacy and Studio's local database.
//!
//! Exasol Personal runs in a small VM on the host-only bridge
//! (192.168.64.0/24). Since macOS 15 an app needs the user's Local Network
//! permission to open connections on such a network, and its child processes
//! — the launcher that forwards the database port — inherit that decision.
//! Without it every connect fails with EHOSTUNREACH ("no route to host")
//! while the same address answers from Terminal, and setup waits minutes for a
//! VM that is already up.
//!
//! This module notices that state while setup runs and says so, with a way
//! to the right settings pane. The probe it makes is itself what shows the
//! system prompt for an app that has not been asked yet.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// The Local Network pane of System Settings.
pub const SETTINGS_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork";

/// The event the setup panel listens for: `{ blocked: bool, guest?: string }`.
pub const EVENT: &str = "personal-local:local-network";

/// The guest address the launcher could not reach, from its log: the last
/// "no route to host" line naming `<ipv4>:<port>`. Other failures (refused,
/// timeouts) are a booting guest, not a permission, and yield nothing.
pub fn blocked_guest(log: &str) -> Option<String> {
    let line = log.lines().rev().find(|l| l.contains("no route to host"))?;
    // Newer lines that reached the guest mean the block has lifted.
    let tail_after = log.rsplit_once(line).map(|(_, after)| after).unwrap_or("");
    if tail_after.lines().any(|l| l.contains("reached guest") || l.contains("SSH is ready") || l.contains("forwarding")) {
        return None;
    }
    line.split(|c: char| c.is_whitespace() || c == '(' || c == ')')
        .filter_map(|tok| tok.trim_end_matches(':').rsplit_once(':').map(|(ip, _)| ip).or(Some(tok)))
        .find(|ip| is_ipv4(ip))
        .map(str::to_string)
}

fn is_ipv4(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    parts.len() == 4 && parts.iter().all(|p| !p.is_empty() && p.len() <= 3 && p.parse::<u8>().is_ok())
}

/// Whether THIS process is denied the guest: the connect fails with "host
/// unreachable" (EHOSTUNREACH, errno 65 on macOS). Refused or timed out is a
/// guest still booting — reachable, just not listening yet.
#[cfg(target_os = "macos")]
fn studio_denied(guest: &str) -> bool {
    use std::net::{SocketAddr, TcpStream};
    let Ok(addr) = format!("{guest}:22").parse::<SocketAddr>() else { return false };
    match TcpStream::connect_timeout(&addr, Duration::from_secs(2)) {
        Ok(_) => false,
        Err(e) => e.raw_os_error() == Some(65) || e.kind() == std::io::ErrorKind::HostUnreachable,
    }
}

/// Runs while setup waits on the VM; stops when dropped.
pub struct Watch(Arc<AtomicBool>);

impl Drop for Watch {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

/// Watch the launcher's VM log during setup. When the launcher cannot reach
/// its guest AND Studio is denied the same address, tell the person once —
/// in the setup log and to the panel — and tell them again when it clears.
#[cfg(target_os = "macos")]
pub fn watch(app: &AppHandle, job: &str, vm_log: &Path) -> Watch {
    let stop = Arc::new(AtomicBool::new(false));
    let (app, job, vm_log, flag) = (app.clone(), job.to_string(), vm_log.to_path_buf(), stop.clone());
    std::thread::spawn(move || {
        let mut reported = false;
        // Ten minutes is longer than any honest first boot.
        for _ in 0..120 {
            if flag.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_secs(5));
            let log = std::fs::read_to_string(&vm_log).unwrap_or_default();
            let denied = blocked_guest(&log).filter(|g| studio_denied(g));
            match (&denied, reported) {
                (Some(guest), false) => {
                    reported = true;
                    crate::market::emit_log(
                        &app,
                        &job,
                        "macOS is blocking Exasol Studio from reaching its local database VM. Open System Settings → Privacy & Security → Local Network and turn on Exasol Studio; setup continues by itself.",
                        "warn",
                    );
                    let _ = app.emit(EVENT, serde_json::json!({ "blocked": true, "guest": guest }));
                }
                (None, true) => {
                    reported = false;
                    crate::market::emit_log(&app, &job, "Local Network access granted — continuing setup.", "info");
                    let _ = app.emit(EVENT, serde_json::json!({ "blocked": false }));
                }
                _ => {}
            }
        }
    });
    Watch(stop)
}

#[cfg(not(target_os = "macos"))]
pub fn watch(_app: &AppHandle, _job: &str, _vm_log: &Path) -> Watch {
    Watch(Arc::new(AtomicBool::new(true)))
}

/// Open the Local Network pane, from the setup panel's button.
#[tauri::command]
pub fn open_local_network_settings() -> crate::error::AppResult<()> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(SETTINGS_URL)
        .spawn()
        .map_err(|e| crate::error::AppError::Storage(format!("Could not open System Settings: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_no_route_line_names_the_guest_and_a_boot_does_not() {
        let log = "[17:34:24] Warning: db forwarder could not reach guest 192.168.64.180:8563 (blocked): dial tcp 192.168.64.180:8563: connect: no route to host\n";
        assert_eq!(blocked_guest(log).as_deref(), Some("192.168.64.180"));
        let ssh = "Warning: SSH did not become ready (timed out waiting for SSH service at 192.168.64.7:22 after 2m0s: dial tcp 192.168.64.7:22: connect: no route to host); VM stays up";
        assert_eq!(blocked_guest(ssh).as_deref(), Some("192.168.64.7"));
        assert_eq!(blocked_guest("dial tcp 192.168.64.180:8563: connect: connection refused\n"), None, "refused is a guest still booting");
        assert_eq!(blocked_guest(""), None);
        assert_eq!(blocked_guest("connect: no route to host\n"), None, "no address, no claim");
    }

    #[test]
    fn a_later_line_that_reached_the_guest_lifts_the_block() {
        let log = "dial tcp 192.168.64.180:22: connect: no route to host\n[17:40:01] SSH is ready at 192.168.64.180\n";
        assert_eq!(blocked_guest(log), None);
    }

    #[test]
    fn only_dotted_quads_count_as_addresses() {
        assert!(is_ipv4("192.168.64.180"));
        assert!(!is_ipv4("192.168.64"));
        assert!(!is_ipv4("192.168.64.999"));
        assert!(!is_ipv4("host.local"));
    }
}
